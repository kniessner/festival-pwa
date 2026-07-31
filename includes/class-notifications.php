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
 * Each notification can be flagged "send as push" — that flag is stored
 * and exposed in the JSON/REST feed now, but actually delivering an OS-level
 * push notification needs infrastructure this plugin doesn't have yet
 * (a Web Push endpoint, VAPID keys, a subscription store). Until that's
 * built, the PWA instead shows an in-app popup for any notification it
 * hasn't seen yet — see standalone/js/notifications.js — which needs none
 * of that and works for every notification regardless of the push flag.
 */

if (!defined('ABSPATH')) exit;

// Known path on the WordPress.com Atomic host — same server, sibling of the
// WP install, where scripts/deploy-prod.sh rsyncs the standalone app to.
// Still overridable via PWA Push → Settings if that ever changes.
if (!defined('FESTIVAL_PWA_WEBAPP_DATA_DIR_DEFAULT')) {
    define('FESTIVAL_PWA_WEBAPP_DATA_DIR_DEFAULT', '/srv/htdocs/webapp/data');
}

class Festival_PWA_Notifications {
    const POST_TYPE = 'pwa_notification';

    public function __construct() {
        add_action('init', [$this, 'register_post_type']);
        add_action('add_meta_boxes', [$this, 'add_meta_box']);
        add_action('save_post_' . self::POST_TYPE, [$this, 'save']);
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
            Every notification always shows as an in-app alert. OS push delivery
            for the checkbox above isn't wired up yet — it just records the
            intent for when that's built.
        </p>
        <?php
    }

    public function save($post_id) {
        if (!isset($_POST['pwa_notification_nonce']) || !wp_verify_nonce($_POST['pwa_notification_nonce'], 'pwa_notification_nonce')) return;
        if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) return;
        if (!current_user_can('edit_post', $post_id)) return;

        update_post_meta($post_id, '_pwa_highlight', isset($_POST['pwa_highlight']) ? '1' : '');
        update_post_meta($post_id, '_pwa_send_push', isset($_POST['pwa_send_push']) ? '1' : '');

        $this->rebuild_json();
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
        foreach ($posts as $post) {
            $items[] = [
                'id'        => $post->ID,
                'question'  => get_the_title($post),
                'answer'    => trim(wp_strip_all_tags(apply_filters('the_content', $post->post_content))),
                'date'      => get_the_date('Y-m-d', $post),
                'time'      => get_the_date('H:i', $post),
                'highlight' => get_post_meta($post->ID, '_pwa_highlight', true) === '1',
                'push'      => get_post_meta($post->ID, '_pwa_send_push', true) === '1',
            ];
        }

        $data = [
            'type'  => 'notifications',
            'slug'  => 'notifications',
            'title' => 'Notifications',
            'intro' => '',
            'items' => $items,
        ];

        $json = wp_json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);

        wp_mkdir_p(FESTIVAL_PWA_DIR . 'pwa/data/');
        file_put_contents(FESTIVAL_PWA_DIR . 'pwa/data/notifications.json', $json);

        $webapp_dir = rtrim(get_option('festival_pwa_webapp_data_dir', FESTIVAL_PWA_WEBAPP_DATA_DIR_DEFAULT), '/');
        if ($webapp_dir && is_dir($webapp_dir) && is_writable($webapp_dir)) {
            file_put_contents($webapp_dir . '/notifications.json', $json);
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
