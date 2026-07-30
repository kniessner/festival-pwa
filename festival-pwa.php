<?php
/**
 * Plugin Name: Bucht der Träumer* – Festival PWA
 * Description: Offline-capable festival guide PWA. Choose start page, internal or remote pages, and sync for offline use.
 * Version:      1.3.1
 * Author:       Festival Tech
 * Text Domain:  festival-pwa
 */

if (!defined('ABSPATH')) exit;

define('FESTIVAL_PWA_VERSION', '1.3.1');
define('FESTIVAL_PWA_DIR', plugin_dir_path(__FILE__));
define('FESTIVAL_PWA_URL', plugin_dir_url(__FILE__));

require_once FESTIVAL_PWA_DIR . 'includes/class-content-sync.php';
require_once FESTIVAL_PWA_DIR . 'includes/class-rest-api.php';
require_once FESTIVAL_PWA_DIR . 'includes/class-pwa-frontend.php';
require_once FESTIVAL_PWA_DIR . 'includes/class-notifications.php';
require_once FESTIVAL_PWA_DIR . 'includes/class-music.php';

class Festival_PWA {
    /**
     * Migrate old flat-slug storage to new page-object storage.
     */
    private function maybe_migrate() {
        $old = get_option('festival_pwa_selected_pages');
        if ($old === false) return;                 // nothing to migrate
        if (get_option('festival_pwa_pages')) return; // already migrated

        $map = [
            'cashless'     => ['label' => 'Cashless & TOP-UP', 'icon' => '💳'],
            'performances' => ['label' => 'Performances',    'icon' => '🎭'],
            'workshops'    => ['label' => 'Workshops',       'icon' => '🛠️'],
            'info'         => ['label' => 'Info',            'icon' => 'ℹ️'],
            'tickets'      => ['label' => 'Tickets',         'icon' => '🎫'],
            'news'         => ['label' => 'News',            'icon' => '📰'],
            'faq'          => ['label' => 'FAQ',             'icon' => '❓'],
            'kontakt'      => ['label' => 'Kontakt',         'icon' => '📧'],
        ];

        $pages = [];
        foreach ((array) $old as $slug) {
            $meta = $map[$slug] ?? ['label' => ucfirst($slug), 'icon' => '📄'];
            $pages[] = [
                'slug'         => $slug,
                'label'        => $meta['label'],
                'icon'         => $meta['icon'],
                'source_type'  => 'source',
                'source_value' => $slug,
            ];
        }
        update_option('festival_pwa_pages', $pages);
        delete_option('festival_pwa_selected_pages');
    }

    public function __construct() {
        add_action('init', [$this, 'init']);
        add_action('admin_menu', [$this, 'admin_menu']);
        add_action('admin_init', [$this, 'handle_form_submission']);
        add_action('admin_enqueue_scripts', [$this, 'admin_scripts']);
        add_action('wp_enqueue_scripts', [$this, 'enqueue_assets']);
    }

    public function init() {
        $this->maybe_migrate();
        new Festival_PWA_REST_API();
        new Festival_PWA_Frontend();
    }

    public function admin_menu() {
        add_options_page(
            'Festival PWA',
            'Festival PWA',
            'manage_options',
            'festival-pwa',
            [$this, 'render_admin_page']
        );
    }

    public function admin_scripts($hook) {
        if ($hook !== 'settings_page_festival-pwa') return;
        wp_enqueue_style('festival-pwa-admin', FESTIVAL_PWA_URL . 'admin/admin.css', [], FESTIVAL_PWA_VERSION);
        wp_enqueue_script('festival-pwa-admin', FESTIVAL_PWA_URL . 'admin/admin.js', ['jquery'], FESTIVAL_PWA_VERSION, true);
        wp_localize_script('festival-pwa-admin', 'festivalPWA', [
            'version' => FESTIVAL_PWA_VERSION,
            'apiBase' => esc_url_raw(rest_url('festival/v1')),
            'nonce'   => wp_create_nonce('wp_rest'),
            'wpPages' => $this->get_wp_pages_for_js(),
        ]);
    }

    private function get_wp_pages_for_js() {
        $pages = get_pages(['sort_column' => 'post_title', 'posts_per_page' => -1]);
        $out = [];
        foreach ($pages as $p) {
            $out[] = ['id' => $p->ID, 'title' => $p->post_title];
        }
        return $out;
    }

    public function enqueue_assets() {
        if (!is_page('pwa')) return;
    }

    public function handle_form_submission() {
        if (!isset($_POST['festival_pwa_save'])) return;
        if (!wp_verify_nonce($_POST['festival_pwa_nonce'], 'festival_pwa_settings')) return;
        if (!current_user_can('manage_options')) return;

        // ── Source mode ──
        $source_mode = sanitize_text_field($_POST['source_mode'] ?? 'current');
        update_option('festival_pwa_source_mode', $source_mode);
        if ($source_mode === 'custom') {
            $url = esc_url_raw($_POST['source_url'] ?? '');
            update_option('festival_pwa_source_url', rtrim($url, '/'));
        } else {
            delete_option('festival_pwa_source_url');
        }

        // ── Sync secret ──
        update_option('festival_pwa_sync_secret', sanitize_text_field($_POST['sync_secret'] ?? ''));

        // ── App name ──
        update_option('festival_pwa_app_name', sanitize_text_field($_POST['app_name'] ?? get_bloginfo('name')));

        // ── Start page ──
        update_option('festival_pwa_start_page', sanitize_text_field($_POST['start_page'] ?? ''));

        // ── Pages builder ──
        $pages = [];
        if (!empty($_POST['pages']) && is_array($_POST['pages'])) {
            foreach ($_POST['pages'] as $page) {
                if (empty($page['slug'])) continue;
                $type = in_array($page['source_type'] ?? '', ['internal', 'remote', 'source'])
                    ? $page['source_type'] : 'source';
                $mode = in_array($page['mode'] ?? '', ['snapshot', 'raw', 'structured'])
                    ? $page['mode'] : 'raw';
                $pages[] = [
                    'slug'         => sanitize_title($page['slug']),
                    'label'        => sanitize_text_field($page['label']),
                    'icon'         => sanitize_text_field($page['icon'] ?? '📄'),
                    'source_type'  => $type,
                    'source_value' => sanitize_text_field($page['source_value'] ?? ''),
                    'mode'         => $mode,
                ];
            }
        }
        update_option('festival_pwa_pages', $pages);

        wp_redirect(admin_url('options-general.php?page=festival-pwa&saved=1'));
        exit;
    }

    /* ================================================================
       ADMIN PAGE RENDERER
       ================================================================ */
    public function render_admin_page() {
        $source_mode = get_option('festival_pwa_source_mode', 'current');
        $source_url   = get_option('festival_pwa_source_url', '');
        $sync_secret  = get_option('festival_pwa_sync_secret', '');
        $app_name     = get_option('festival_pwa_app_name', get_bloginfo('name'));
        $start_page   = get_option('festival_pwa_start_page', '');
        $pages        = (array) get_option('festival_pwa_pages', []);
                $last_sync   = get_option('festival_pwa_last_sync');
        $pwa_url     = home_url('/pwa/');
        $api_base    = home_url('/wp-json/festival/v1/');
        $sync_log    = (array) get_option('festival_pwa_sync_log', []);

        $wp_pages = get_pages(['sort_column' => 'post_title', 'posts_per_page' => -1]);
        ?>
        <div class="wrap festival-pwa-admin">

            <?php if (isset($_GET['saved'])): ?>
                <div class="notice notice-success is-dismissible"><p>✅ Settings saved successfully.</p></div>
            <?php endif; ?>
            <?php if (isset($_GET['sync'])): ?>
                <div class="notice notice-<?php echo esc_attr($_GET['sync']); ?> is-dismissible">
                    <p><?php echo $_GET['sync'] === 'success'
                        ? '✅ Content synced successfully!'
                        : '❌ Sync failed. Check the <a href="' . admin_url('options-general.php?page=festival-pwa') . '">status section</a> or server error log.'; ?></p>
                </div>
            <?php endif; ?>

            <h1>🎪 Festival PWA Settings</h1>

            <!-- ── QUICK LINKS ── -->
            <div class="pwa-card quick-links">
                <h2>🚀 Quick Links</h2>
                <div class="link-grid">
                    <a href="<?php echo esc_url($pwa_url); ?>" target="_blank" class="button button-primary">
                        📱 Open PWA
                    </a>
                    <a href="<?php echo esc_url($api_base . 'manifest'); ?>" target="_blank" class="button">
                        📋 View Manifest JSON
                    </a>
                    <a href="<?php echo esc_url($api_base . 'design'); ?>" target="_blank" class="button">
                        🎨 View Design JSON
                    </a>
                </div>
            </div>

            <form method="post" action="">
                <?php wp_nonce_field('festival_pwa_settings', 'festival_pwa_nonce'); ?>

                <!-- ── SOURCE WEBSITE ── -->
                <div class="pwa-card">
                    <h2>🔗 Source Website</h2>
                    <p class="description">Where should the plugin fetch content from?</p>
                    <div class="radio-group">
                        <label class="radio-label">
                            <input type="radio" name="source_mode" value="current"
                                <?php checked($source_mode, 'current'); ?>>
                            <strong>Use this WordPress site</strong><br>
                            <span class="radio-desc"><?php echo esc_html(get_site_url()); ?> — pages are fetched directly from this installation (no HTTP requests).</span>
                        </label>
                        <label class="radio-label">
                            <input type="radio" name="source_mode" value="custom"
                                <?php checked($source_mode, 'custom'); ?>>
                            <strong>Custom URL</strong><br>
                            <span class="radio-desc">Fetch from a different WordPress site.</span>
                        </label>
                    </div>
                    <input type="url" name="source_url" id="source_url_input"
                        value="<?php echo esc_attr($source_url); ?>"
                        placeholder="https://bucht-der-traeumer.de"
                        class="regular-text"
                        style="margin-top:10px;<?php echo $source_mode === 'current' ? 'display:none;' : ''; ?>">
                </div>

                <!-- ── SYNC SECRET ── -->
                <div class="pwa-card">
                    <h2>🔐 Sync Secret</h2>
                    <p class="description">Shared secret used by the external sync service to push content. Keep it long and random.</p>
                    <input type="text" name="sync_secret" value="<?php echo esc_attr($sync_secret); ?>"
                        class="regular-text" placeholder="random-long-string">
                    <p class="description" style="margin-top:8px;">Endpoint: <code><?php echo esc_html($api_base . 'sync-batch'); ?></code></p>
                </div>

                <!-- ── APP NAME ── -->
                <div class="pwa-card">
                    <h2>📱 App Name</h2>
                    <p class="description">Shown in the PWA title bar and install prompt.</p>
                    <input type="text" name="app_name" value="<?php echo esc_attr($app_name); ?>"
                        class="regular-text" placeholder="Festival Guide">
                </div>

                <!-- ── START PAGE ── -->
                <div class="pwa-card">
                    <h2>🏠 Start / Entry Page</h2>
                    <p class="description">Which page opens when guests launch the PWA?</p>
                    <select name="start_page" id="start_page_select">
                        <option value="">— First page in list —</option>
                        <?php foreach ($pages as $page): ?>
                            <option value="<?php echo esc_attr($page['slug']); ?>"
                                <?php selected($start_page, $page['slug']); ?>>
                                <?php echo esc_html($page['icon'] . ' ' . $page['label'] . ' (/' . $page['slug'] . ')'); ?>
                            </option>
                        <?php endforeach; ?>
                    </select>
                </div>

                <!-- ── PAGES BUILDER ── -->
                <div class="pwa-card">
                    <h2>📄 PWA Pages</h2>
                    <p class="description">
                        Add the pages you want in the offline app. Each page can come from
                        <strong>this site</strong>, the <strong>source site</strong>, or a
                        <strong>remote URL</strong> anywhere on the web.
                    </p>

                    <div id="page-builder">
                        <?php foreach ($pages as $i => $page):
                            $this->render_page_row($i, $page, $wp_pages);
                        endforeach; ?>
                    </div>

                    <button type="button" class="button" id="add-page-btn">➕ Add Page</button>
                </div>

                <!-- ── ANNOUNCEMENT ── -->
                <div class="pwa-card">
                    <h2>📢 Urgent Announcement</h2>
                    <p class="description">Shown as a dismissible banner when users open the PWA.</p>
                    <textarea name="announcement" rows="2" class="large-text" placeholder="e.g. The main stage has moved to the north field!"><?php
                        echo esc_textarea(get_option('festival_pwa_announcement', ''));
                    ?></textarea>
                </div>

                <?php submit_button('💾 Save Settings', 'primary', 'festival_pwa_save'); ?>
            </form>

            <!-- ── SYNC ── -->
            <div class="pwa-card">
                <h2>🔄 Content Sync</h2>
                <p class="description">
                    Syncs all configured pages. For large pages (e.g. snapshots with many images) use
                    <strong>Background Sync</strong> — it runs one page per cron step and won't time out.
                </p>

                <?php
                $status = Festival_PWA_Content_Sync::get_sync_status();
                if ($status['state'] === 'running'): ?>
                    <div class="notice notice-info inline" style="margin-bottom:12px;">
                        <p>⏳ Background sync running: <?php echo count($status['synced']); ?> / <?php echo $status['total']; ?> pages done.</p>
                        <p style="font-size:12px;color:#646970;">Current: <code><?php echo esc_html($status['current']); ?></code></p>
                    </div>
                <?php elseif ($status['state'] === 'finished'): ?>
                    <div class="notice notice-success inline" style="margin-bottom:12px;">
                        <p>✅ Background sync finished: <?php echo count($status['synced']); ?> synced, <?php echo count($status['failed']); ?> failed.</p>
                    </div>
                <?php endif; ?>

                <div class="sync-actions" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
                    <a href="<?php echo wp_nonce_url(admin_url('admin-post.php?action=festival_pwa_sync_async'), 'festival_pwa_sync_async'); ?>"
                       class="button button-primary button-hero">
                        🔄 Sync in Background
                    </a>
                    <a href="<?php echo wp_nonce_url(admin_url('admin-post.php?action=festival_pwa_sync'), 'festival_pwa_sync'); ?>"
                       class="button">
                        ⚡ Sync Now (one request)
                    </a>
                </div>

                <?php if ($last_sync): ?>
                    <p class="sync-time">Last sync: <strong><?php echo human_time_diff($last_sync, time()); ?> ago</strong></p>
                <?php else: ?>
                    <p class="sync-time" style="color:#b0327a;"><strong>⚠️ Never synced — start a background sync above.</strong></p>
                <?php endif; ?>
            </div>

            <!-- ── STATUS & LINKS ── -->
            <div class="pwa-card">
                <h2>📊 Status & Cached Files</h2>

                <div class="status-grid">
                    <div class="status-item">
                        <strong><?php echo count($pages); ?></strong>
                        <span>pages configured</span>
                    </div>
                    <div class="status-item">
                        <strong><?php echo count(glob(FESTIVAL_PWA_DIR . 'pwa/data/*.json')); ?></strong>
                        <span>cached JSON files</span>
                    </div>
                    <div class="status-item">
                        <strong><?php echo file_exists(FESTIVAL_PWA_DIR . 'pwa/images/bg.jpg') ? '✅' : '❌'; ?></strong>
                        <span>background image</span>
                    </div>
                    <div class="status-item">
                        <strong><?php echo file_exists(FESTIVAL_PWA_DIR . 'pwa/images/datum.png') ? '✅' : '❌'; ?></strong>
                        <span>logo image</span>
                    </div>
                </div>

                <h3 style="margin-top:24px;">Cached JSON Files                </h3>
                <p class="description">Click to view raw JSON. These are what the PWA serves offline.</p>

                <?php if (!empty($sync_log)): ?>
                    <h4>Latest sync log</h4>
                    <pre class="sync-log"><?php echo esc_html(implode("\n", array_slice($sync_log, -10))); ?></pre>
                <?php endif; ?>

                <table class="wp-list-table widefat fixed striped">
                    <thead>
                        <tr>
                            <th>File</th>
                            <th>PWA Page</th>
                            <th>Size</th>
                            <th>Modified</th>
                            <th>REST Endpoint</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php
                        $data_dir = FESTIVAL_PWA_DIR . 'pwa/data/';
                        $files = glob($data_dir . '*.json');
                        if ($files):
                            foreach ($files as $file):
                                $name = basename($file);
                                $slug = str_replace('.json', '', $name);
                                $size = size_format(filesize($file));
                                $mtime = date('Y-m-d H:i', filemtime($file));
                                $raw_url = FESTIVAL_PWA_URL . 'pwa/data/' . $name;
                                $rest_url = $api_base . 'pages/' . sanitize_file_name($slug);
                                // Find label from pages config
                                $label = '';
                                foreach ($pages as $p) {
                                    if ($p['slug'] === $slug) {
                                        $label = $p['icon'] . ' ' . $p['label'];
                                        break;
                                    }
                                }
                                ?>
                                <tr>
                                    <td><a href="<?php echo esc_url($raw_url); ?>" target="_blank"><?php echo esc_html($name); ?></a></td>
                                    <td><?php echo $label ? esc_html($label) : '<em>' . esc_html($slug) . '</em>'; ?></td>
                                    <td><?php echo esc_html($size); ?></td>
                                    <td><?php echo esc_html($mtime); ?></td>
                                    <td><a href="<?php echo esc_url($rest_url); ?>" target="_blank">REST API</a></td>
                                </tr>
                            <?php endforeach; ?>
                        <?php else: ?>
                            <tr><td colspan="5"><em>No cached files yet. Run a sync first.</em></td></tr>
                        <?php endif; ?>
                    </tbody>
                </table>

                <h3 style="margin-top:24px;">PWA Access URLs</h3>
                <table class="wp-list-table widefat fixed striped">
                    <tbody>
                        <tr>
                            <td><strong>PWA App</strong></td>
                            <td><a href="<?php echo esc_url($pwa_url); ?>" target="_blank"><?php echo esc_html($pwa_url); ?></a></td>
                        </tr>
                        <tr>
                            <td><strong>Manifest</strong></td>
                            <td><a href="<?php echo esc_url($api_base . 'manifest'); ?>" target="_blank"><?php echo esc_html($api_base . 'manifest'); ?></a></td>
                        </tr>
                        <tr>
                            <td><strong>Design Tokens</strong></td>
                            <td><a href="<?php echo esc_url($api_base . 'design'); ?>" target="_blank"><?php echo esc_html($api_base . 'design'); ?></a></td>
                        </tr>
                        <tr>
                            <td><strong>Manual Sync (POST)</strong></td>
                            <td><code><?php echo esc_html($api_base . 'sync'); ?></code> (admin only)</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <!-- ── HOW TO USE ── -->
            <div class="pwa-card">
                <h2>❓ How to Use</h2>
                <ol class="howto-list">
                    <li><strong>Choose your source</strong> — pick "this site" or enter a custom URL.</li>
                    <li><strong>Add pages</strong> — click "Add Page", give it a label, slug, and icon. Choose where the content comes from.</li>
                    <li><strong>Set start page</strong> — pick which page guests see first.</li>
                    <li><strong>Save settings</strong> — hit "Save Settings".</li>
                    <li><strong>Sync content</strong> — click "Sync Content Now". This fetches and caches everything.</li>
                    <li><strong>Test the PWA</strong> — open the "Open PWA" link on your phone.</li>
                    <li><strong>Add to home screen</strong> — Chrome will show an install prompt; iOS users tap Share → "Add to Home Screen".</li>
                    <li><strong>Go offline</strong> — turn on airplane mode and reload. Everything still works.</li>
                </ol>
                <p style="margin-top:16px;">
                    <a href="<?php echo FESTIVAL_PWA_URL . 'SETUP-GUIDE.md'; ?>" target="_blank">📖 Full Setup Guide</a>
                </p>
            </div>

        </div><!-- /wrap -->

        <!-- Hidden template for new page rows -->
        <script type="text/template" id="page-row-template">
            <div class="page-row" data-index="__INDEX__">
                <div class="row-grid">
                    <input type="text" name="pages[__INDEX__][icon]" value="📄"
                        class="page-icon-input" placeholder="📄" title="Emoji icon">
                    <input type="text" name="pages[__INDEX__][label]" value=""
                        class="page-label-input" placeholder="Page Label" title="Display name">
                    <input type="text" name="pages[__INDEX__][slug]" value=""
                        class="page-slug-input" placeholder="page-slug" title="URL slug for PWA">
                    <select name="pages[__INDEX__][source_type]" class="source-type-select">
                        <option value="internal">Internal WP Page</option>
                        <option value="source" selected>From Source Site</option>
                        <option value="remote">Remote URL</option>
                    </select>
                    <select name="pages[__INDEX__][mode]" class="page-mode-select" title="Extraction mode: snapshot = full offline mirror; raw = original HTML/CSS; structured = FAQ/Grid/text">
                        <option value="snapshot" selected>Snapshot (full offline mirror)</option>
                        <option value="raw">Raw HTML (keep original design)</option>
                        <option value="structured">Structured (FAQ / Grid / Text)</option>
                    </select>
                    <div class="source-value-wrap">
                        <input type="text" name="pages[__INDEX__][source_value]" value=""
                            class="regular-text source-value-text" placeholder="page-slug (relative to source)">
                    </div>
                    <button type="button" class="button-link remove-page" title="Remove page">🗑️</button>
                </div>
            </div>
        </script>
        <?php
    }

    /**
     * Render a single page-builder row.
     */
    private function render_page_row($i, $page, $wp_pages) {
        $type = $page['source_type'] ?? 'source';
        ?>
        <div class="page-row" data-index="<?php echo $i; ?>">
            <div class="row-grid">
                <input type="text" name="pages[<?php echo $i; ?>][icon]"
                    value="<?php echo esc_attr($page['icon'] ?? '📄'); ?>"
                    class="page-icon-input" placeholder="📄" title="Emoji icon">
                <input type="text" name="pages[<?php echo $i; ?>][label]"
                    value="<?php echo esc_attr($page['label'] ?? ''); ?>"
                    class="page-label-input" placeholder="Page Label" title="Display name">
                <input type="text" name="pages[<?php echo $i; ?>][slug]"
                    value="<?php echo esc_attr($page['slug'] ?? ''); ?>"
                    class="page-slug-input" placeholder="page-slug" title="URL slug for PWA">
                <select name="pages[<?php echo $i; ?>][source_type]" class="source-type-select">
                    <option value="internal" <?php selected($type, 'internal'); ?>>Internal WP Page</option>
                    <option value="source" <?php selected($type, 'source'); ?>>From Source Site</option>
                    <option value="remote" <?php selected($type, 'remote'); ?>>Remote URL</option>
                </select>
                <select name="pages[<?php echo $i; ?>][mode]" class="page-mode-select" title="Extraction mode: snapshot = full offline mirror; raw = original HTML/CSS">
                    <option value="snapshot" <?php selected(($page['mode'] ?? 'raw'), 'snapshot'); ?>>Snapshot (full offline mirror)</option>
                    <option value="raw" <?php selected(($page['mode'] ?? 'raw'), 'raw'); ?>>Raw HTML (keep original design)</option>
                </select>
                <div class="source-value-wrap">
                    <?php if ($type === 'internal'): ?>
                        <select name="pages[<?php echo $i; ?>][source_value]" class="source-value-select">
                            <option value="">— Select WP page —</option>
                            <?php foreach ($wp_pages as $wp_page): ?>
                                <option value="<?php echo esc_attr($wp_page->ID); ?>"
                                    <?php selected(($page['source_value'] ?? ''), $wp_page->ID); ?>>
                                    <?php echo esc_html($wp_page->post_title); ?> (ID: <?php echo $wp_page->ID; ?>)
                                </option>
                            <?php endforeach; ?>
                        </select>
                    <?php else: ?>
                        <input type="text" name="pages[<?php echo $i; ?>][source_value]"
                            value="<?php echo esc_attr($page['source_value'] ?? ''); ?>"
                            class="regular-text source-value-text"
                            placeholder="<?php echo $type === 'source' ? 'page-slug (relative to source)' : 'https://example.com/page'; ?>">
                    <?php endif; ?>
                </div>
                <button type="button" class="button-link remove-page" title="Remove page">🗑️</button>
            </div>
        </div>
        <?php
    }
}

new Festival_PWA();

/* ================================================================
   SYNC ACTION
   ================================================================ */
add_action('admin_post_festival_pwa_sync', function() {
    if (!current_user_can('manage_options')) wp_die('Unauthorized');
    if (!wp_verify_nonce($_GET['_wpnonce'], 'festival_pwa_sync')) wp_die('Invalid nonce');

    $sync = new Festival_PWA_Content_Sync();
    $result = $sync->sync_all();

    wp_redirect(admin_url('options-general.php?page=festival-pwa&sync=' . ($result ? 'success' : 'error')));
    exit;
});

/* ================================================================
   ASYNC SYNC ACTION
   ================================================================ */
add_action('admin_post_festival_pwa_sync_async', function() {
    if (!current_user_can('manage_options')) wp_die('Unauthorized');
    if (!wp_verify_nonce($_GET['_wpnonce'], 'festival_pwa_sync_async')) wp_die('Invalid nonce');

    $sync = new Festival_PWA_Content_Sync();
    $sync->sync_all_async();

    wp_redirect(admin_url('options-general.php?page=festival-pwa&async=started'));
    exit;
});

add_action('festival_pwa_async_step', function() {
    $sync = new Festival_PWA_Content_Sync();
    $sync->async_step();
});

/* ================================================================
   CRON
   ================================================================ */
add_filter('cron_schedules', function($schedules) {
    $schedules['every_6_hours'] = ['interval' => 21600, 'display' => 'Every 6 hours'];
    return $schedules;
});

if (!wp_next_scheduled('festival_pwa_sync')) {
    wp_schedule_event(time(), 'every_6_hours', 'festival_pwa_sync');
}

add_action('festival_pwa_sync', function() {
    $sync = new Festival_PWA_Content_Sync();
    $sync->sync_all();
});
