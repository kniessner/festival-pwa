<?php
/**
 * Web Push delivery for notifications flagged "Also send as OS push
 * notification" (see class-notifications.php's _pwa_send_push meta).
 *
 * Everything push-specific lives here: VAPID keys, the subscription table,
 * the subscribe/unsubscribe REST routes the standalone app's js/push.js
 * calls, and the actual encrypted send via vendor/minishlink/web-push.
 * That library is vendored (composer.json at the plugin root, vendor/
 * committed) rather than installed at deploy time, since WP.com Atomic
 * has no server-side build step to run `composer install` for us.
 */

if (!defined('ABSPATH')) exit;

require_once FESTIVAL_PWA_DIR . 'vendor/autoload.php';

use Minishlink\WebPush\WebPush;
use Minishlink\WebPush\Subscription;
use Minishlink\WebPush\VAPID;

class Festival_PWA_Push {
    const TABLE_SUFFIX = 'festival_pwa_push_subscriptions';

    public function __construct() {
        add_action('rest_api_init', [$this, 'register_routes']);
        // This plugin ships via GitHub-integration deploys, not WordPress's
        // normal upload-and-activate flow — register_activation_hook (see
        // festival-pwa.php) never fires on a deploy to an already-active
        // plugin. Self-heals here instead: cheap to check, and install()
        // itself is already idempotent (dbDelta diffs the schema; VAPID
        // keys are only generated if missing).
        add_action('admin_init', [__CLASS__, 'maybe_install']);
    }

    public static function maybe_install() {
        if (!get_option('festival_pwa_vapid_public_key') || !self::table_exists()) {
            self::install();
        }
    }

    private static function table_exists() {
        global $wpdb;
        $table = self::table_name();
        return $wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $table)) === $table;
    }

    public static function table_name() {
        global $wpdb;
        return $wpdb->prefix . self::TABLE_SUFFIX;
    }

    /* ── Setup (plugin activation) ───────────────────────────────────── */

    // Called from festival-pwa.php's register_activation_hook. dbDelta is
    // fussy about exact formatting (two spaces before PRIMARY KEY, one
    // space before KEY) — deviating from that silently no-ops the table
    // creation instead of erroring, so the layout below is deliberate.
    public static function install() {
        global $wpdb;
        $table = self::table_name();
        $charset_collate = $wpdb->get_charset_collate();

        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        dbDelta("CREATE TABLE {$table} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            endpoint TEXT NOT NULL,
            endpoint_hash CHAR(64) NOT NULL,
            p256dh VARCHAR(255) NOT NULL,
            auth VARCHAR(255) NOT NULL,
            lang VARCHAR(10) DEFAULT 'de',
            created_at DATETIME NOT NULL,
            PRIMARY KEY  (id),
            UNIQUE KEY endpoint_hash (endpoint_hash)
        ) {$charset_collate};");

        // Generated once, ever — regenerating later would invalidate every
        // subscription already stored client-side (they're bound to the
        // public key they were created with).
        if (!get_option('festival_pwa_vapid_public_key')) {
            $keys = VAPID::createVapidKeys();
            update_option('festival_pwa_vapid_public_key', $keys['publicKey']);
            update_option('festival_pwa_vapid_private_key', $keys['privateKey']);
        }
    }

    /* ── REST routes: public key, subscribe, unsubscribe ─────────────── */

    // All three are deliberately unauthenticated — each call only ever
    // registers/removes the calling browser's OWN subscription (an opaque
    // endpoint URL + keys it just generated itself), the same trust model
    // as any other public "subscribe me to push" endpoint.
    public function register_routes() {
        register_rest_route('festival/v1', '/push/vapid-public-key', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_vapid_public_key'],
            'permission_callback' => '__return_true',
        ]);
        register_rest_route('festival/v1', '/push/subscribe', [
            'methods'             => 'POST',
            'callback'            => [$this, 'subscribe'],
            'permission_callback' => '__return_true',
        ]);
        register_rest_route('festival/v1', '/push/unsubscribe', [
            'methods'             => 'POST',
            'callback'            => [$this, 'unsubscribe'],
            'permission_callback' => '__return_true',
        ]);
    }

    public function get_vapid_public_key() {
        return new WP_REST_Response(['publicKey' => get_option('festival_pwa_vapid_public_key')], 200);
    }

    // subscribe() is unauthenticated by design (any browser registers its
    // OWN endpoint), which means $endpoint is fully attacker-controlled
    // input. It's later fed straight into an outbound HTTP POST from
    // send_to_all() — without this allowlist, anyone could register e.g.
    // an internal admin URL or a cloud metadata endpoint as their
    // "subscription" and have the server request it on their behalf the
    // next time any notification gets published (SSRF). Real push
    // services only ever come from this small, stable set of hosts.
    private static function is_valid_push_endpoint($endpoint) {
        $parts = wp_parse_url($endpoint);
        if (!$parts || ($parts['scheme'] ?? '') !== 'https' || empty($parts['host'])) {
            return false;
        }
        $host = strtolower(rtrim($parts['host'], '.'));

        $exact = [
            'fcm.googleapis.com',              // Chrome, Edge, Android, Opera, Samsung Internet
            'updates.push.services.mozilla.com', // Firefox
            'web.push.apple.com',              // Safari (macOS, iOS 16.4+)
        ];
        if (in_array($host, $exact, true)) return true;

        // Legacy Edge/WNS and some Apple push variants use a subdomain
        // rather than one fixed host.
        return (bool) preg_match('/\.notify\.windows\.com$/', $host)
            || (bool) preg_match('/\.push\.apple\.com$/', $host);
    }

    public function subscribe(WP_REST_Request $request) {
        $body     = $request->get_json_params();
        $endpoint = $body['endpoint'] ?? '';
        $p256dh   = $body['keys']['p256dh'] ?? '';
        $auth     = $body['keys']['auth'] ?? '';
        $lang     = sanitize_text_field($body['lang'] ?? 'de');

        if (!$endpoint || !$p256dh || !$auth) {
            return new WP_REST_Response(['error' => 'Invalid subscription'], 400);
        }
        if (!self::is_valid_push_endpoint($endpoint)) {
            return new WP_REST_Response(['error' => 'Endpoint host not allowed'], 400);
        }

        global $wpdb;
        $table = self::table_name();
        $hash  = hash('sha256', $endpoint);

        // Upsert on endpoint_hash — a browser re-subscribing (e.g. after
        // clearing storage) sends the same endpoint again; this updates the
        // keys in place instead of accumulating duplicate rows.
        $wpdb->query($wpdb->prepare(
            "INSERT INTO {$table} (endpoint, endpoint_hash, p256dh, auth, lang, created_at)
             VALUES (%s, %s, %s, %s, %s, %s)
             ON DUPLICATE KEY UPDATE p256dh = %s, auth = %s, lang = %s",
            $endpoint, $hash, $p256dh, $auth, $lang, current_time('mysql'),
            $p256dh, $auth, $lang
        ));

        return new WP_REST_Response(['ok' => true], 200);
    }

    public function unsubscribe(WP_REST_Request $request) {
        $body     = $request->get_json_params();
        $endpoint = $body['endpoint'] ?? '';
        if (!$endpoint) {
            return new WP_REST_Response(['error' => 'Missing endpoint'], 400);
        }

        global $wpdb;
        $wpdb->delete(self::table_name(), ['endpoint_hash' => hash('sha256', $endpoint)]);
        return new WP_REST_Response(['ok' => true], 200);
    }

    /* ── Sending ──────────────────────────────────────────────────────── */

    // HTML → plain text for the push body. wp_strip_all_tags() alone
    // removes tags with NO separator at all, so multi-paragraph content
    // collapses into one unreadable run-on line ("Paragraph oneParagraph
    // two"); OS notifications can't render the original bold/lists, but
    // they can still show it as separate lines, which is the "formatting"
    // that's actually worth preserving here.
    private static function html_to_plain_text($html) {
        $html = preg_replace('/<br\s*\/?>/i', "\n", $html);
        $html = preg_replace('/<\/(p|li|div|h[1-6])>/i', "\n\n", $html);
        $text = wp_strip_all_tags($html);
        $text = preg_replace('/\n{3,}/', "\n\n", $text);
        return trim($text);
    }

    // Combines German + English into one string everyone sees, rather
    // than picking one per subscriber — skips English entirely when it's
    // empty or identical to German (an untranslated post whose English
    // field was left blank, per class-notifications.php's own
    // "leave empty to fall back to German" convention).
    private static function combine_bilingual($de, $en, $joiner) {
        $de = trim($de);
        $en = trim($en);
        if ($en === '' || $en === $de) return $de;
        return $de . $joiner . $en;
    }

    // Called from class-notifications.php's save handler the first time a
    // post is saved with "send as push" checked (guarded there by
    // _pwa_push_sent so re-saving an already-sent post doesn't re-push).
    // $content is ['de' => ['title'=>,'body'=>], 'en' => [...]] — body
    // values are raw HTML (the_content-filtered post content / wp_kses_post
    // English field), plain-texted and combined below.
    public static function send_to_all(array $content, $url = '') {
        $public  = get_option('festival_pwa_vapid_public_key');
        $private = get_option('festival_pwa_vapid_private_key');
        if (!$public || !$private) return;

        global $wpdb;
        $table = self::table_name();
        $rows  = $wpdb->get_results("SELECT id, endpoint, p256dh, auth FROM {$table}", ARRAY_A);
        if (!$rows) return;

        $webPush = new WebPush([
            'VAPID' => [
                // mailto: admin_email is the standard fallback when there's
                // no dedicated push contact — VAPID just requires SOME
                // reachable identity for push services to contact if they
                // need to flag abuse.
                'subject'    => 'mailto:' . get_option('admin_email'),
                'publicKey'  => $public,
                'privateKey' => $private,
            ],
        ]);

        $title = self::combine_bilingual($content['de']['title'] ?? '', $content['en']['title'] ?? '', ' / ');
        $body  = self::combine_bilingual(
            self::html_to_plain_text($content['de']['body'] ?? ''),
            self::html_to_plain_text($content['en']['body'] ?? ''),
            "\n\n"
        );
        $payload = wp_json_encode(['title' => $title, 'body' => $body, 'url' => $url]);

        foreach ($rows as $row) {
            $subscription = Subscription::create([
                'endpoint'        => $row['endpoint'],
                'keys'            => ['p256dh' => $row['p256dh'], 'auth' => $row['auth']],
                'contentEncoding' => 'aes128gcm',
            ]);
            $webPush->queueNotification($subscription, $payload);
        }

        // flush() sends everything queued above and yields one report per
        // subscription — prune any the push service says are gone (the
        // user uninstalled, revoked permission, etc.) so we stop wasting
        // requests on them.
        $expiredHashes = [];
        foreach ($webPush->flush() as $report) {
            if ($report->isSubscriptionExpired()) {
                $expiredHashes[] = $wpdb->prepare('%s', hash('sha256', $report->getEndpoint()));
            }
        }
        if ($expiredHashes) {
            $wpdb->query("DELETE FROM {$table} WHERE endpoint_hash IN (" . implode(',', $expiredHashes) . ")");
        }
    }
}

new Festival_PWA_Push();
