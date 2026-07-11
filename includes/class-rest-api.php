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

        // External sync service batch push
        register_rest_route('festival/v1', '/sync-batch', [
            'methods'             => 'POST',
            'callback'            => [$this, 'receive_sync_batch'],
            'permission_callback' => '__return_true',
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

    /**
     * Receive a batch payload from the external sync service.
     */
    public function receive_sync_batch($request) {
        $body = $request->get_json_params();
        if (empty($body) || !is_array($body)) {
            return new WP_Error('invalid_payload', 'Empty or invalid JSON payload.', ['status' => 400]);
        }

        // Validate shared secret
        $expected = get_option('festival_pwa_sync_secret', '');
        $provided = sanitize_text_field($body['secret'] ?? '');
        if (empty($expected) || !hash_equals($expected, $provided)) {
            return new WP_Error('unauthorized', 'Invalid sync secret.', ['status' => 401]);
        }

        $data_dir    = FESTIVAL_PWA_DIR . 'pwa/data/';
        $snap_dir    = FESTIVAL_PWA_DIR . 'pwa/snapshots/';
        $synced      = [];
        $failed      = [];
        $synced_slugs = [];

        foreach (($body['results'] ?? []) as $result) {
            $slug   = sanitize_file_name($result['slug'] ?? '');
            $status = $result['status'] ?? 'error';
            $data   = $result['data'] ?? null;

            if (!$slug) {
                $failed[] = 'missing-slug';
                continue;
            }

            if ($status !== 'ok' || !is_array($data)) {
                $failed[] = $slug;
                continue;
            }

            $data['slug'] = $slug;

            // Snapshot pages include full HTML from the service.
            if (($data['type'] ?? '') === 'snapshot') {
                if (!empty($data['snapshot_html'])) {
                    wp_mkdir_p($snap_dir);
                    file_put_contents($snap_dir . $slug . '.html', $data['snapshot_html']);
                    $data['snapshot_url'] = FESTIVAL_PWA_URL . 'pwa/snapshots/' . $slug . '.html';
                    unset($data['snapshot_html']);
                }
                if (!empty($data['fragment_html'])) {
                    wp_mkdir_p($snap_dir);
                    file_put_contents($snap_dir . $slug . '.fragment.html', $data['fragment_html']);
                    $data['fragment_url'] = FESTIVAL_PWA_URL . 'pwa/snapshots/' . $slug . '.fragment.html';
                    unset($data['fragment_html']);
                }
            }

            wp_mkdir_p($data_dir);
            file_put_contents(
                $data_dir . $slug . '.json',
                json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)
            );

            $synced[]      = $slug;
            $synced_slugs[] = $slug;
        }

        // Write manifest
        $manifest_pages = [];
        foreach (($body['pages'] ?? []) as $page) {
            if (in_array($page['slug'] ?? '', $synced_slugs, true)) {
                $manifest_pages[] = [
                    'slug'  => sanitize_title($page['slug']),
                    'label' => sanitize_text_field($page['label'] ?? ''),
                    'icon'  => sanitize_text_field($page['icon'] ?? '📄'),
                ];
            }
        }

        $manifest = [
            'pages'      => $manifest_pages,
            'app_name'   => sanitize_text_field($body['app_name'] ?? get_option('festival_pwa_app_name', 'Festival Guide')),
            'start_page' => sanitize_text_field($body['start_page'] ?? get_option('festival_pwa_start_page', '')),
            'synced_at'  => intval($body['synced_at'] ?? time()),
        ];

        file_put_contents(
            $data_dir . '_manifest.json',
            json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)
        );

        update_option('festival_pwa_last_sync', time());
        update_option('festival_pwa_synced_pages', $synced_slugs);
        update_option('festival_pwa_sync_log', array_slice([
            '[sync-batch] synced: ' . implode(', ', $synced) . '; failed: ' . implode(', ', $failed)
        ], -50));

        return new WP_REST_Response([
            'success' => count($failed) === 0,
            'synced'  => $synced,
            'failed'  => $failed,
            'manifest' => $manifest,
        ], 200);
    }
}
