<?php
/**
 * REST API endpoints for the PWA.
 * Serves dynamic page list and cached content.
 */

if (!defined('ABSPATH')) exit;

class Festival_PWA_REST_API {
    public function __construct() {
        add_action('rest_api_init', [$this, 'register_routes']);
    }

    public function register_routes() {
        // Get the manifest (which pages are included)
        register_rest_route('festival/v1', '/manifest', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_manifest'],
            'permission_callback' => '__return_true',
        ]);

        // Get a single page's content
        register_rest_route('festival/v1', '/pages/(?P<page>[a-z0-9-]+)', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_page'],
            'permission_callback' => '__return_true',
        ]);

        // Get design tokens
        register_rest_route('festival/v1', '/design', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_design'],
            'permission_callback' => '__return_true',
        ]);

        // Trigger manual sync
        register_rest_route('festival/v1', '/sync', [
            'methods'             => 'POST',
            'callback'            => [$this, 'trigger_sync'],
            'permission_callback' => function () {
                return current_user_can('manage_options');
            },
        ]);

        // Async sync status
        register_rest_route('festival/v1', '/sync-status', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_sync_status'],
            'permission_callback' => function () {
                return current_user_can('manage_options');
            },
        ]);
    }

    /**
     * Return the PWA manifest: app name + list of included pages.
     */
    public function get_manifest() {
        $file = FESTIVAL_PWA_DIR . 'pwa/data/_manifest.json';
        $data = file_exists($file)
            ? json_decode(file_get_contents($file), true)
            : ['pages' => [], 'app_name' => 'Festival Guide', 'synced_at' => 0, 'start_page' => ''];

        $data['_server_time'] = time();
        return new WP_REST_Response($data, 200);
    }

    /**
     * Return a single page's cached JSON.
     */
    public function get_page($request) {
        $page = sanitize_file_name($request['page']);
        $file = FESTIVAL_PWA_DIR . 'pwa/data/' . $page . '.json';

        if (!file_exists($file)) {
            return new WP_Error(
                'not_found',
                'Page not cached. Run sync first.',
                ['status' => 404]
            );
        }

        $data = json_decode(file_get_contents($file), true);
        $data['_synced'] = filemtime($file);

        return new WP_REST_Response($data, 200);
    }

    /**
     * Return design tokens + asset URLs.
     */
    public function get_design() {
        $bg_url = file_exists(FESTIVAL_PWA_DIR . 'pwa/images/bg.jpg')
            ? FESTIVAL_PWA_URL . 'pwa/images/bg.jpg'
            : null;

        $logo_url = file_exists(FESTIVAL_PWA_DIR . 'pwa/images/datum.png')
            ? FESTIVAL_PWA_URL . 'pwa/images/datum.png'
            : null;

        return new WP_REST_Response([
            'background_image' => $bg_url,
            'logo_image'       => $logo_url,
            'colors'           => [
                'bg'            => '#080943',
                'accent_pink'   => '#b0327a',
                'accent_purple' => '#762c8c',
                'accent_orange' => '#ff6f21',
                'text'          => '#f3efdf',
            ],
            'fonts' => [
                'body'    => 'Lato',
                'heading' => 'Space Grotesk',
            ],
        ], 200);
    }

    /**
     * Trigger a manual sync.
     */
    public function trigger_sync() {
        require_once FESTIVAL_PWA_DIR . 'includes/class-content-sync.php';
        $sync   = new Festival_PWA_Content_Sync();
        $result = $sync->sync_all();

        return new WP_REST_Response([
            'success'   => $result,
            'timestamp' => time(),
            'pages'     => get_option('festival_pwa_synced_pages', []),
        ], $result ? 200 : 500);
    }

    /**
     * Return async sync status.
     */
    public function get_sync_status() {
        require_once FESTIVAL_PWA_DIR . 'includes/class-content-sync.php';
        $status = Festival_PWA_Content_Sync::get_sync_status();
        $status['_server_time'] = time();
        return new WP_REST_Response($status, 200);
    }
}
