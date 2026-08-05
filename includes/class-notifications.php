<?php
/**
 * "PWA Push" — a custom post type (classic editor) for authoring
 * news/alerts without touching the standalone app's scraped data files.
 *
 * Saving a post regenerates notifications.json in the SAME shape the
 * standalone app's news.json already uses ({type,slug,title,intro,items:
 * [{question,answer,date,highlight}]}), and writes it to two places:
 *   - this plugin's own pwa/data/ (matches how every other synced page
 *     already works — see class-content-sync.php)
 *   - the standalone webapp's data/ directory, so bucht-der-traeumer.de/webapp/
 *     picks it up too. That folder is deployed separately by
 *     scripts/deploy-prod.sh (rsync from the developer's machine), so its
 *     path isn't fixed relative to this plugin — it's a configurable
 *     setting instead of a guessed path.
 *
 * Each notification also has optional English title/text fields (the
 * "English Translation" meta box). Every save writes a SECOND file,
 * notifications.json under an en/ subfolder in both of the locations
 * above — matching the en/ convention the standalone app's fetchLocalized()
 * already expects for every other localized data file. A field left empty
 * falls back to the German title/text, so an English reader always sees
 * something rather than a blank notification while translation is pending.
 *
 * Each notification can be flagged "send as push", delivering an actual
 * OS-level Web Push via class-push.php on top of the in-app popup every
 * notification already gets regardless of the flag (see
 * standalone/js/notifications.js). The send fires once, either
 * immediately (save() below, when the post is published right away) or —
 * respecting WordPress's own Schedule date/time picker — when WP-Cron
 * actually auto-publishes a scheduled post (on_scheduled_publish() below,
 * hooked to transition_post_status). Either way it's guarded by
 * _pwa_push_sent so a post is never pushed twice.
 */

if (!defined('ABSPATH')) exit;

// Known path on the WordPress.com Atomic host — same server, sibling of the
// WP install, where scripts/deploy-prod.sh rsyncs the standalone app to.
// Still overridable via PWA Push → Settings if that ever changes.
if (!defined('FESTIVAL_PWA_WEBAPP_DATA_DIR_DEFAULT')) {
    define('FESTIVAL_PWA_WEBAPP_DATA_DIR_DEFAULT', '/srv/htdocs/webapp/data');
}

// Public URL of the same webapp — used to deep-link a push notification's
// click straight to its entry on the News tab (?notif=<post ID>, read by
// standalone/js/app.js on load / via the service worker's postMessage).
if (!defined('FESTIVAL_PWA_WEBAPP_URL')) {
    define('FESTIVAL_PWA_WEBAPP_URL', 'https://bucht-der-traeumer.de/webapp/');
}

class Festival_PWA_Notifications {
    const POST_TYPE = 'pwa_notification';

    public function __construct() {
        add_action('init', [$this, 'register_post_type']);
        add_action('add_meta_boxes', [$this, 'add_meta_box']);
        add_action('add_meta_boxes', [$this, 'add_translation_meta_box']);
        add_action('save_post_' . self::POST_TYPE, [$this, 'save']);
        add_action('transition_post_status', [$this, 'on_scheduled_publish'], 10, 3);
        add_action('trashed_post', [$this, 'on_status_change']);
        add_action('untrashed_post', [$this, 'on_status_change']);
        add_action('before_delete_post', [$this, 'on_status_change']);
        add_action('rest_api_init', [$this, 'register_routes']);
        add_action('admin_menu', [$this, 'admin_menu']);
        add_action('admin_init', [$this, 'register_settings']);
        add_action('admin_head', [$this, 'admin_menu_icon_color']);
    }

    // register_post_type()'s menu_icon is recolored by WP to match whatever
    // admin color scheme is active, so baking a specific color into the
    // dashicon/SVG itself doesn't stick — overriding the glyph's own CSS
    // color on the auto-generated .menu-icon-{post_type} class is the
    // standard way to actually pin it to a specific color.
    public function admin_menu_icon_color() {
        $type = self::POST_TYPE;
        echo "<style>
            #adminmenu .menu-icon-{$type} div.wp-menu-image:before,
            #adminmenu .menu-icon-{$type}:hover div.wp-menu-image:before,
            #adminmenu .menu-icon-{$type}.wp-has-current-submenu div.wp-menu-image:before,
            #adminmenu .menu-icon-{$type}.current div.wp-menu-image:before {
                color: #de4e39;
            }
        </style>";
    }

    public function register_post_type() {
        register_post_type(self::POST_TYPE, [
            'labels' => [
                'name'          => 'PWA Push',
                'singular_name' => 'Notification',
                'add_new'       => 'Add Notification',
                'add_new_item'  => 'Add New Notification',
                'edit_item'     => 'Edit Notification',
                'all_items'     => 'All Notifications',
                'menu_name'     => 'PWA Push',
            ],
            'public'       => false,
            'show_ui'      => true,
            'supports'     => ['title', 'editor'],
            'menu_icon'    => 'dashicons-megaphone',
            'has_archive'  => false,
            // A purpose-built REST route below serves the shape the PWA
            // expects — the default post-type REST controller wouldn't.
            'show_in_rest' => false,
        ]);
    }

    /* ── Meta box: highlight + push flag ─────────────────────────────── */

    public function add_meta_box() {
        add_meta_box(
            'pwa_notification_details',
            'Notification Settings',
            [$this, 'render_meta_box'],
            self::POST_TYPE,
            'side'
        );
    }

    public function render_meta_box($post) {
        $highlight = get_post_meta($post->ID, '_pwa_highlight', true);
        $send_push = get_post_meta($post->ID, '_pwa_send_push', true);
        wp_nonce_field('pwa_notification_nonce', 'pwa_notification_nonce');
        ?>
        <p>
            <label>
                <input type="checkbox" name="pwa_highlight" value="1" <?php checked($highlight, '1'); ?>>
                Highlight this notification
            </label>
        </p>
        <p>
            <label>
                <input type="checkbox" name="pwa_send_push" value="1" <?php checked($send_push, '1'); ?>>
                Also send as OS push notification
            </label>
        </p>
        <p style="color:#646970;font-size:12px;">
            Every notification always shows as an in-app alert regardless of this
            checkbox. Checking it ALSO sends a one-time OS push to everyone
            currently subscribed — immediately if you publish now, or at the
            date/time below if you use Schedule instead. Unchecking and
            re-checking it lets you resend (e.g. after fixing a typo before
            anyone saw it), but a normal edit afterward won't re-notify anyone.
        </p>
        <?php
    }

    public function save($post_id) {
        if (!isset($_POST['pwa_notification_nonce']) || !wp_verify_nonce($_POST['pwa_notification_nonce'], 'pwa_notification_nonce')) return;
        if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) return;
        if (!current_user_can('edit_post', $post_id)) return;

        update_post_meta($post_id, '_pwa_highlight', isset($_POST['pwa_highlight']) ? '1' : '');
        update_post_meta($post_id, '_pwa_send_push', isset($_POST['pwa_send_push']) ? '1' : '');
        update_post_meta($post_id, '_pwa_title_en', sanitize_text_field($_POST['pwa_title_en'] ?? ''));
        // wp_kses_post (not sanitize_textarea_field) — this field is a rich
        // editor now, and its HTML is rendered as-is by the standalone app
        // (see standalone/js/notifications.js), so it needs to survive
        // saving as safe HTML rather than being reduced to plain text.
        update_post_meta($post_id, '_pwa_content_en', wp_kses_post($_POST['pwa_content_en'] ?? ''));

        // Fires the actual OS push exactly once per post — guarded by
        // _pwa_push_sent so re-saving an already-pushed post (fixing a
        // typo, etc.) doesn't re-notify every subscriber. Unchecking and
        // re-checking the box does intentionally allow a re-send, since
        // that's the only way to retry after e.g. an empty title slipped
        // through.
        //
        // Only sends here when the post is ACTUALLY publishing right now —
        // if the admin picked a future date in WordPress's own Schedule
        // picker (post_status is 'future', not 'publish'), this
        // deliberately does nothing; on_scheduled_publish() below fires the
        // send later, when WP-Cron actually publishes it. Without this
        // check, scheduling a post would push immediately at save time
        // instead of at the scheduled time.
        $send_push = isset($_POST['pwa_send_push']);
        $already_sent = get_post_meta($post_id, '_pwa_push_sent', true) === '1';
        $publishing_now = get_post_status($post_id) === 'publish';
        if ($send_push && !$already_sent && $publishing_now) {
            // Raw HTML, not pre-stripped — Festival_PWA_Push::send_to_all()
            // does its own HTML-to-plain-text conversion (preserving
            // paragraph/list line breaks, which a naive strip here would
            // have collapsed) and combines German+English into one payload.
            $title_de = get_the_title($post_id);
            $body_de  = apply_filters('the_content', get_post($post_id)->post_content);
            $title_en = sanitize_text_field($_POST['pwa_title_en'] ?? '');
            $body_en  = wp_kses_post($_POST['pwa_content_en'] ?? '');
            Festival_PWA_Push::send_to_all([
                'de' => ['title' => $title_de, 'body' => $body_de],
                'en' => ['title' => $title_en, 'body' => $body_en],
            ], FESTIVAL_PWA_WEBAPP_URL . '?notif=' . $post_id);
            update_post_meta($post_id, '_pwa_push_sent', '1');
        } elseif (!$send_push) {
            // Allows a genuine retry: uncheck, save, check again.
            update_post_meta($post_id, '_pwa_push_sent', '');
        }

        $this->rebuild_json();
    }

    // WP-Cron's counterpart to save()'s immediate-publish send: fires
    // whenever ANY post transitions status, so it's scoped down to
    // exactly the one case save() intentionally skips — a scheduled
    // ('future') PWA Push post that WordPress's own cron just auto-
    // published. No $_POST here (there's no real HTTP request behind a
    // cron-triggered publish), so unlike save() this reads straight from
    // the already-saved post meta instead.
    public function on_scheduled_publish($new_status, $old_status, $post) {
        if ($post->post_type !== self::POST_TYPE) return;
        if ($new_status !== 'publish' || $old_status !== 'future') return;

        $send_push = get_post_meta($post->ID, '_pwa_send_push', true) === '1';
        $already_sent = get_post_meta($post->ID, '_pwa_push_sent', true) === '1';
        if (!$send_push || $already_sent) return;

        $title_de = get_the_title($post);
        $body_de  = apply_filters('the_content', $post->post_content);
        $title_en = get_post_meta($post->ID, '_pwa_title_en', true);
        $body_en  = get_post_meta($post->ID, '_pwa_content_en', true);
        Festival_PWA_Push::send_to_all([
            'de' => ['title' => $title_de, 'body' => $body_de],
            'en' => ['title' => $title_en, 'body' => $body_en],
        ], FESTIVAL_PWA_WEBAPP_URL . '?notif=' . $post->ID);
        update_post_meta($post->ID, '_pwa_push_sent', '1');

        // notifications.json is otherwise only rebuilt from save() (a real
        // form submission) — a scheduled post publishing via cron needs
        // its own rebuild trigger so it actually shows up in the feed the
        // moment it goes live, not just whenever someone next edits it.
        $this->rebuild_json();
    }

    /* ── Meta box: English translation ───────────────────────────────── */

    public function add_translation_meta_box() {
        add_meta_box(
            'pwa_notification_translation',
            'English Translation',
            [$this, 'render_translation_meta_box'],
            self::POST_TYPE,
            'normal',
            'high'
        );
    }

    public function render_translation_meta_box($post) {
        $title_en   = get_post_meta($post->ID, '_pwa_title_en', true);
        $content_en = get_post_meta($post->ID, '_pwa_content_en', true);
        ?>
        <p>
            <label for="pwa_title_en"><strong>Title (English)</strong></label><br>
            <input type="text" id="pwa_title_en" name="pwa_title_en" class="widefat"
                value="<?php echo esc_attr($title_en); ?>">
        </p>
        <p>
            <label for="pwacontenten"><strong>Text (English)</strong></label>
        </p>
        <?php
        wp_editor($content_en, 'pwacontenten', [
            'textarea_name' => 'pwa_content_en',
            'textarea_rows' => 8,
            'media_buttons' => false,
        ]);
        ?>
        <p style="color:#646970;font-size:12px;">
            Leave either field empty to fall back to the German title/text above —
            English readers see the German content until it's translated, rather
            than a blank notification.
        </p>
        <?php
    }

    public function on_status_change($post_id) {
        if (get_post_type($post_id) !== self::POST_TYPE) return;
        $this->rebuild_json();
    }

    /* ── JSON generation ──────────────────────────────────────────────── */

    public function rebuild_json() {
        $posts = get_posts([
            'post_type'      => self::POST_TYPE,
            'post_status'    => 'publish',
            'posts_per_page' => -1,
            'orderby'        => 'date',
            'order'          => 'DESC',
        ]);

        $items = [];
        $items_en = [];
        foreach ($posts as $post) {
            $title = get_the_title($post);
            $answer = trim(wp_strip_all_tags(apply_filters('the_content', $post->post_content)));
            $highlight = get_post_meta($post->ID, '_pwa_highlight', true) === '1';
            $push = get_post_meta($post->ID, '_pwa_send_push', true) === '1';
            $date = get_the_date('Y-m-d', $post);
            $time = get_the_date('H:i', $post);

            $items[] = [
                'id'        => $post->ID,
                'question'  => $title,
                'answer'    => $answer,
                'date'      => $date,
                'time'      => $time,
                'highlight' => $highlight,
                'push'      => $push,
            ];

            // Falls back to the German title/text per-field — an editor can
            // translate the title first and leave the body pending (or vice
            // versa) without the untranslated half going blank.
            $title_en = get_post_meta($post->ID, '_pwa_title_en', true);
            $content_en = get_post_meta($post->ID, '_pwa_content_en', true);
            $items_en[] = [
                'id'        => $post->ID,
                'question'  => $title_en !== '' ? $title_en : $title,
                'answer'    => $content_en !== '' ? $content_en : $answer,
                'date'      => $date,
                'time'      => $time,
                'highlight' => $highlight,
                'push'      => $push,
            ];
        }

        $data = [
            'type'  => 'notifications',
            'slug'  => 'notifications',
            'title' => 'Notifications',
            'intro' => '',
            'items' => $items,
        ];
        $data_en = array_merge($data, ['items' => $items_en]);

        $json = wp_json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
        $json_en = wp_json_encode($data_en, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);

        wp_mkdir_p(FESTIVAL_PWA_DIR . 'pwa/data/');
        file_put_contents(FESTIVAL_PWA_DIR . 'pwa/data/notifications.json', $json);
        wp_mkdir_p(FESTIVAL_PWA_DIR . 'pwa/data/en/');
        file_put_contents(FESTIVAL_PWA_DIR . 'pwa/data/en/notifications.json', $json_en);

        $webapp_dir = rtrim(get_option('festival_pwa_webapp_data_dir', FESTIVAL_PWA_WEBAPP_DATA_DIR_DEFAULT), '/');
        if ($webapp_dir && is_dir($webapp_dir) && is_writable($webapp_dir)) {
            file_put_contents($webapp_dir . '/notifications.json', $json);
            wp_mkdir_p($webapp_dir . '/en/');
            file_put_contents($webapp_dir . '/en/notifications.json', $json_en);
        }

        return $data;
    }

    /* ── REST ─────────────────────────────────────────────────────────── */

    public function register_routes() {
        register_rest_route('festival/v1', '/notifications', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_notifications'],
            'permission_callback' => '__return_true',
        ]);
    }

    public function get_notifications() {
        $file = FESTIVAL_PWA_DIR . 'pwa/data/notifications.json';
        $data = file_exists($file)
            ? json_decode(file_get_contents($file), true)
            : $this->rebuild_json();

        $data['_synced'] = file_exists($file) ? filemtime($file) : time();
        return new WP_REST_Response($data, 200);
    }

    /* ── Settings: where the standalone webapp's data/ folder lives ───── */

    public function admin_menu() {
        add_submenu_page(
            'edit.php?post_type=' . self::POST_TYPE,
            'PWA Push Settings',
            'Settings',
            'manage_options',
            'pwa-push-settings',
            [$this, 'render_settings_page']
        );
    }

    public function register_settings() {
        register_setting('pwa_push_settings', 'festival_pwa_webapp_data_dir', [
            'sanitize_callback' => 'sanitize_text_field',
        ]);
    }

    public function render_settings_page() {
        ?>
        <div class="wrap">
            <h1>PWA Push Settings</h1>
            <form method="post" action="options.php">
                <?php settings_fields('pwa_push_settings'); ?>
                <table class="form-table">
                    <tr>
                        <th scope="row"><label for="festival_pwa_webapp_data_dir">Standalone webapp data directory</label></th>
                        <td>
                            <input type="text" id="festival_pwa_webapp_data_dir" name="festival_pwa_webapp_data_dir"
                                value="<?php echo esc_attr(get_option('festival_pwa_webapp_data_dir', FESTIVAL_PWA_WEBAPP_DATA_DIR_DEFAULT)); ?>"
                                class="regular-text" placeholder="<?php echo esc_attr(FESTIVAL_PWA_WEBAPP_DATA_DIR_DEFAULT); ?>">
                            <p class="description">
                                Absolute server path to the standalone PWA's <code>data/</code> folder
                                (the one <code>scripts/deploy-prod.sh</code> rsyncs to). Defaults to
                                <code><?php echo esc_html(FESTIVAL_PWA_WEBAPP_DATA_DIR_DEFAULT); ?></code>
                                on this host. When the directory exists and is writable, every notification
                                save also writes <code>notifications.json</code> there, in addition to this
                                plugin's own <code>pwa/data/</code>. Clear the field and save to fall back
                                to only syncing the plugin's own copy.
                            </p>
                        </td>
                    </tr>
                </table>
                <?php submit_button(); ?>
            </form>
        </div>
        <?php
    }
}

new Festival_PWA_Notifications();
