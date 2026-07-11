<?php
/**
 * Fetches and caches content from multiple sources:
 *   - internal   : WP pages on the same site (uses get_post())
 *   - source     : Pages from the configured source site (HTTP fetch)
 *   - remote     : Any absolute URL on the web (HTTP fetch)
 *
 * Writes structured JSON to pwa/data/ for the PWA frontend.
 *
 * Extraction modes:
 *   - snapshot   : Full offline mirror: downloads HTML, CSS, images and rewrites URLs locally
 *   - raw        : Preserve original HTML + styles (best for complex layouts like timetable)
 *   - structured : Heuristic FAQ / Grid / Generic text extraction
 */

if (!defined('ABSPATH')) exit;

class Festival_PWA_Content_Sync {
    private $source_mode;
    private $source_url;
    private $cache_dir;
    private $snapshot_dir;
    private $asset_dir;
    private $asset_url_base;
    private $pages;

    // Sync limits to keep admin requests from timing out.
    private $max_assets_per_snapshot = 80;
    private $asset_timeout           = 20;
    private $max_asset_size_bytes    = 2097152; // 2 MB
    private $sync_log                = [];
    private $assets_downloaded_this_page = 0;

    public function __construct() {
        $this->source_mode  = get_option('festival_pwa_source_mode', 'current');
        $this->source_url   = rtrim(get_option('festival_pwa_source_url', ''), '/');
        $this->cache_dir    = FESTIVAL_PWA_DIR . 'pwa/data/';
        $this->snapshot_dir = FESTIVAL_PWA_DIR . 'pwa/snapshots/';
        $this->asset_dir    = FESTIVAL_PWA_DIR . 'pwa/cache/';
        $this->asset_url_base = FESTIVAL_PWA_URL . 'pwa/cache/';
        $this->pages        = (array) get_option('festival_pwa_pages', []);

        foreach ([$this->cache_dir, $this->snapshot_dir, $this->asset_dir] as $dir) {
            if (!is_dir($dir)) {
                wp_mkdir_p($dir);
            }
        }
    }

    /**
     * Sync all configured pages + design assets.
     */
    /**
     * Sync all configured pages synchronously. Kept for backwards compatibility.
     */
    public function sync_all() {
        if (function_exists('set_time_limit')) {
            @set_time_limit(300);
        }

        $success = true;
        $synced  = [];

        foreach ($this->pages as $page) {
            if (function_exists('set_time_limit')) {
                @set_time_limit(300);
            }
            $this->assets_downloaded_this_page = 0;

            $slug = $page['slug'] ?? '';
            if (!$slug) continue;

            $data = $this->fetch_and_extract($page);
            if ($data) {
                $this->save_json($slug . '.json', $data);
                $synced[] = $slug;
            } else {
                $success = false;
                error_log("Festival PWA: failed to sync page '{$slug}'");
            }
        }

        $this->write_manifest($synced);
        $this->sync_design_assets();

        update_option('festival_pwa_last_sync', time());
        update_option('festival_pwa_synced_pages', $synced);
        update_option('festival_pwa_sync_log', array_slice($this->sync_log, -50));

        return $success;
    }

    /**
     * Start an asynchronous, background sync.
     * Queues all pages and schedules the first processing step.
     */
    public function sync_all_async() {
        $queue = array_filter(array_map(function ($page) {
            return $page['slug'] ?? '';
        }, $this->pages));

        if (empty($queue)) {
            return false;
        }

        update_option('festival_pwa_async_queue', $queue);
        update_option('festival_pwa_async_synced', []);
        update_option('festival_pwa_async_failed', []);
        update_option('festival_pwa_async_current', '');
        update_option('festival_pwa_async_started', time());
        update_option('festival_pwa_async_finished', 0);
        update_option('festival_pwa_async_log', []);

        // Schedule the first step immediately.
        if (!wp_next_scheduled('festival_pwa_async_step')) {
            wp_schedule_single_event(time(), 'festival_pwa_async_step');
        }

        $this->log("Background sync started: " . count($queue) . " pages queued");
        return true;
    }

    /**
     * Process the next page in the async queue.
     * Called by WP Cron.
     */
    public function async_step() {
        $queue  = (array) get_option('festival_pwa_async_queue', []);
        $synced = (array) get_option('festival_pwa_async_synced', []);
        $failed = (array) get_option('festival_pwa_async_failed', []);
        $log    = (array) get_option('festival_pwa_async_log', []);

        if (empty($queue)) {
            $this->async_finish();
            return;
        }

        $slug  = array_shift($queue);
        $page  = $this->find_page($slug);

        update_option('festival_pwa_async_current', $slug);
        update_option('festival_pwa_async_queue', $queue);

        if (!$page) {
            $failed[] = $slug;
            $log[] = "Page config not found: {$slug}";
            update_option('festival_pwa_async_failed', $failed);
            update_option('festival_pwa_async_log', array_slice($log, -50));
            $this->schedule_next_step();
            return;
        }

        $this->assets_downloaded_this_page = 0;

        $data = $this->fetch_and_extract($page);
        if ($data) {
            $this->save_json($slug . '.json', $data);
            $synced[] = $slug;
            $log[] = "Synced: {$slug}";
        } else {
            $failed[] = $slug;
            $log[] = "Failed: {$slug}";
        }

        update_option('festival_pwa_async_synced', $synced);
        update_option('festival_pwa_async_failed', $failed);
        update_option('festival_pwa_async_log', array_slice($log, -50));

        if (empty($queue)) {
            $this->async_finish();
        } else {
            $this->schedule_next_step();
        }
    }

    private function schedule_next_step() {
        if (!wp_next_scheduled('festival_pwa_async_step')) {
            wp_schedule_single_event(time() + 5, 'festival_pwa_async_step');
        }
    }

    private function async_finish() {
        $synced = (array) get_option('festival_pwa_async_synced', []);
        $failed = (array) get_option('festival_pwa_async_failed', []);

        $this->write_manifest($synced);
        $this->sync_design_assets();

        update_option('festival_pwa_last_sync', time());
        update_option('festival_pwa_synced_pages', $synced);
        update_option('festival_pwa_async_current', '');
        update_option('festival_pwa_async_finished', time());

        $this->log("Background sync finished. Synced: " . count($synced) . ", Failed: " . count($failed));
    }

    private function find_page($slug) {
        foreach ($this->pages as $page) {
            if (($page['slug'] ?? '') === $slug) {
                return $page;
            }
        }
        return null;
    }

    /**
     * Get current async sync status for admin / REST.
     */
    public static function get_sync_status() {
        $queue     = (array) get_option('festival_pwa_async_queue', []);
        $synced    = (array) get_option('festival_pwa_async_synced', []);
        $failed    = (array) get_option('festival_pwa_async_failed', []);
        $current   = get_option('festival_pwa_async_current', '');
        $started   = (int) get_option('festival_pwa_async_started', 0);
        $finished  = (int) get_option('festival_pwa_async_finished', 0);

        $total = count($queue) + count($synced) + count($failed);
        $done  = count($synced) + count($failed);

        if ($finished > 0) {
            $state = 'finished';
        } elseif ($started > 0) {
            $state = 'running';
        } else {
            $state = 'idle';
        }

        return [
            'state'     => $state,
            'total'     => $total,
            'done'      => $done,
            'queued'    => count($queue),
            'synced'    => $synced,
            'failed'    => $failed,
            'current'   => $current,
            'started'   => $started,
            'finished'  => $finished,
            'log'       => (array) get_option('festival_pwa_async_log', []),
        ];
    }

    /**
     * Route to the correct fetch strategy based on source_type.
     */
    private function fetch_and_extract($page) {
        $type = $page['source_type'] ?? 'source';
        $slug = $page['slug'];

        switch ($type) {
            case 'internal':
                return $this->fetch_internal($page);
            case 'remote':
                return $this->fetch_remote($page);
            case 'source':
            default:
                return $this->fetch_source($page);
        }
    }

    /* ── INTERNAL: same-site WP page ── */
    private function fetch_internal($page) {
        $post_id = intval($page['source_value'] ?? 0);
        if (!$post_id) return false;

        $post = get_post($post_id);
        if (!$post) return false;

        // Snapshot mode needs the fully rendered page (theme CSS + blocks), so fetch public URL.
        if (($page['mode'] ?? 'raw') === 'snapshot') {
            $url = get_permalink($post_id) ?: home_url('/' . $post->post_name . '/');
            return $this->fetch_http($url, $page);
        }

        // Build fake HTML from post content so extract_content() can parse it
        $html = "<html><head><title>" . esc_html($post->post_title) . "</title></head>
                <body><main>" . apply_filters('the_content', $post->post_content) . "</main></body></html>";

        return $this->extract_content($html, $page);
    }

    /* ── SOURCE: configured source site ── */
    private function fetch_source($page) {
        $source_slug = $page['source_value'] ?: $page['slug'];

        if ($this->source_mode === 'current') {
            $post = get_page_by_path($source_slug);
            if (!$post) {
                $post_id = url_to_postid(home_url('/' . $source_slug . '/'));
                if ($post_id) {
                    $post = get_post($post_id);
                }
            }
            if ($post) {
                return $this->fetch_internal([
                    'slug'         => $page['slug'],
                    'source_value' => $post->ID,
                    'mode'         => $page['mode'] ?? 'raw',
                ]);
            }
            error_log("Festival PWA: could not resolve internal page for slug '{$source_slug}'");
            return false;
        }

        $url = $this->source_url . '/' . $source_slug;
        return $this->fetch_http($url, $page);
    }

    /* ── REMOTE: any absolute URL ── */
    private function fetch_remote($page) {
        $url = $page['source_value'] ?? '';
        if (!filter_var($url, FILTER_VALIDATE_URL)) return false;
        return $this->fetch_http($url, $page);
    }

    /* ── HTTP fetch (shared for source + remote) ── */
    private function fetch_http($url, $page) {
        $response = wp_remote_get($url, [
            'timeout'    => 30,
            'sslverify'  => false,
            'headers'    => ['User-Agent' => 'Festival-PWA-Sync/1.3'],
        ]);

        if (is_wp_error($response)) {
            error_log('Festival PWA fetch error: ' . $response->get_error_message());
            return false;
        }

        $code = wp_remote_retrieve_response_code($response);
        if ($code !== 200) {
            error_log("Festival PWA fetch HTTP {$code} for {$url}");
            return false;
        }

        $html = wp_remote_retrieve_body($response);
        return $this->extract_content($html, $page, $url);
    }

    /**
     * Extract content based on mode.
     */
    private function extract_content($html, $page, $fetched_url = '') {
        $mode = $page['mode'] ?? 'raw';

        if ($mode === 'snapshot') {
            return $this->extract_snapshot($html, $page, $fetched_url);
        }

        if ($mode === 'raw') {
            return $this->extract_raw($html, $page, $fetched_url);
        }

        // Structured mode: strip scripts/styles and run heuristic extractors
        $clean_html = preg_replace('#<script[^>]*>.*?</script>#is', '', $html);
        $clean_html = preg_replace('#<style[^>]*>.*?</style>#is', '', $clean_html);

        $doc = new DOMDocument();
        libxml_use_internal_errors(true);
        $doc->loadHTML('<?xml encoding="UTF-8"?>' . $clean_html);
        libxml_clear_errors();

        $xpath = new DOMXPath($doc);
        $type  = $this->guess_page_type($xpath, $page['slug']);

        switch ($type) {
            case 'faq':  return $this->extract_faq($xpath, $page);
            case 'grid': return $this->extract_grid($xpath, $page);
            default:     return $this->extract_generic($xpath, $page);
        }
    }

    /* ── SNAPSHOT extraction: full offline mirror ── */
    private function extract_snapshot($html, $page, $fetched_url = '') {
        $base_url = $this->resolve_base_url($page, $fetched_url);

        // Strip dangerous scripts and event handlers from the source immediately.
        $html = preg_replace('#<script[^>]*>.*?</script>#is', '', $html);
        $html = preg_replace('#\son\w+="[^"]*"#i', '', $html);
        $html = preg_replace("#\son\w+='[^']*'#i", '', $html);

        $doc = new DOMDocument();
        libxml_use_internal_errors(true);
        $doc->loadHTML('<?xml encoding="UTF-8"?>' . $html);
        libxml_clear_errors();
        $xpath = new DOMXPath($doc);

        // Find main content area to make sure the page actually has content.
        $main = $xpath->query('//main')->item(0)
            ?: $xpath->query("//div[contains(@class,'entry-content')]")->item(0)
            ?: $xpath->query('//article')->item(0)
            ?: $xpath->query('//body')->item(0);
        if (!$main) {
            return false;
        }

        $inline_css = [];
        $used_urls  = [];

        // Inline all external stylesheets (critical, bypass asset cap).
        $links = $xpath->query('//link[@rel="stylesheet"]');
        foreach ($links as $link) {
            $href = $link->getAttribute('href');
            if (!$href) continue;
            $abs = $this->absolutize_url($href, $base_url);
            $local = $this->cache_asset($abs, $base_url, true);
            if ($local) {
                $used_urls[] = $local['url'];
                $css = $this->load_cached_asset($local, $base_url, $used_urls);
                if ($css) {
                    $inline_css[] = $css;
                    // Remove the original <link> since we inlined its CSS.
                    $link->parentNode->removeChild($link);
                } else {
                    // Keep the link if we couldn't inline it (e.g. not CSS)
                    $link->setAttribute('href', $local['url']);
                }
            }
        }

        // Rewrite inline <style> url(...) references.
        $style_blocks = $xpath->query('//style');
        foreach ($style_blocks as $style) {
            $css = $this->absolutize_css_urls($style->textContent, $base_url);
            $style->textContent = $this->cache_css_urls($css, $base_url, $used_urls);
        }

        // Inject a base tag so any remaining relative links resolve.
        $head = $xpath->query('//head')->item(0);
        if ($head) {
            $base_exists = $xpath->query('//base')->length > 0;
            if (!$base_exists) {
                $base = $doc->createElement('base');
                $base->setAttribute('href', $base_url . '/');
                $first = $head->firstChild;
                if ($first) {
                    $head->insertBefore($base, $first);
                } else {
                    $head->appendChild($base);
                }
            }
        }

        // Add our snapshot isolation styles: hide site chrome, fix viewport, scroll.
        $hide_chrome_css = $this->snapshot_isolation_css();
        if ($head) {
            $extra_style = $doc->createElement('style');
            $extra_style->textContent = $hide_chrome_css;
            $head->appendChild($extra_style);
        } else {
            $inline_css[] = $hide_chrome_css;
        }

        // Append collected inlined stylesheet CSS as one block at the end of <head>.
        if ($head) {
            $inlined_style = $doc->createElement('style');
            $inlined_style->textContent = implode("\n\n", array_filter($inline_css));
            $head->appendChild($inlined_style);
        }

        // Serialize the full document, then rewrite/cache remaining asset URLs.
        $snapshot_html = $doc->saveHTML();
        $snapshot_html = $this->snapshot_rewrite_html($snapshot_html, $base_url, $used_urls);

        // Title fallback.
        $title = $page['label'];
        $titleNode = $xpath->query('//title')->item(0);
        if ($titleNode) {
            $title = preg_replace('/\s*[-–|]\s*Bucht der Träumer\*?/i', '', $titleNode->nodeValue);
            $title = trim($title);
        }
        $h1 = $xpath->query('//main//h1 | //h1')->item(0);
        if ($h1 && trim($h1->textContent)) {
            $title = trim($h1->textContent);
        }

        $snapshot_file = $this->snapshot_dir . sanitize_file_name($page['slug']) . '.html';
        file_put_contents($snapshot_file, $snapshot_html);

        // Also build a lightweight fragment for direct injection into the PWA shell.
        $main_inner = $this->get_inner_html($main);
        $main_inner = $this->snapshot_rewrite_html($main_inner, $base_url, $used_urls);
        $fragment_css = implode("\n\n", array_filter($inline_css)) . "\n\n" . $hide_chrome_css;
        $fragment_html = '<style>' . "\n" . $fragment_css . "\n" . '</style>' . "\n" .
            '<div class="snapshot-content">' . "\n" . $main_inner . "\n" . '</div>';
        $fragment_file = $this->snapshot_dir . sanitize_file_name($page['slug']) . '.fragment.html';
        file_put_contents($fragment_file, $fragment_html);

        return [
            'type'          => 'snapshot',
            'slug'          => $page['slug'],
            'title'         => $title ?: $page['label'],
            'snapshot_url'  => FESTIVAL_PWA_URL . 'pwa/snapshots/' . sanitize_file_name($page['slug']) . '.html',
            'fragment_url'  => FESTIVAL_PWA_URL . 'pwa/snapshots/' . sanitize_file_name($page['slug']) . '.fragment.html',
            'snapshot_path' => $snapshot_file,
            'base_url'      => $base_url,
            'cached_assets' => array_values(array_unique($used_urls)),
        ];
    }

    private function snapshot_isolation_css() {
        return <<<'CSS'
/* --- PWA snapshot isolation --- */
html, body {
    margin: 0 !important;
    padding: 0 !important;
    overflow-x: hidden !important;
}

/* Hide common site chrome so only the page content is visible */
header,
.site-header,
.wp-block-template-part,
.wp-block-navigation,
.wp-block-site-logo,
.wp-block-site-title,
.wp-block-site-tagline,
footer,
.site-footer,
#colophon,
.admin-bar,
#wpadminbar,
.skip-link,
.festival-global-header,
.festival-page-header,
.rhrn-page-header,
.rhrn-global-header {
    display: none !important;
    visibility: hidden !important;
    height: 0 !important;
    min-height: 0 !important;
    max-height: 0 !important;
    overflow: hidden !important;
}

/* Make main content area full-width */
main,
.wp-block-group,
.entry-content,
.wp-block-post-content {
    max-width: 100% !important;
    width: 100% !important;
    margin-left: 0 !important;
    margin-right: 0 !important;
    padding-left: 0 !important;
    padding-right: 0 !important;
}

img {
    max-width: 100%;
    height: auto;
}

a {
    word-break: break-word;
}
CSS;
    }

    private function snapshot_rewrite_html($html, $base_url, &$used_urls) {
        $self = $this;

        $looks_like_asset = function ($url) {
            if (preg_match('#^(data:|mailto:|tel:|#|javascript:)#i', $url)) return false;
            // Common static asset extensions
            if (preg_match('#\.(jpg|jpeg|png|gif|webp|svg|css|js|woff2?|ttf|otf|eot)(\?.*)?$#i', $url)) return true;
            // WordPress uploads are almost always images/files
            if (strpos($url, '/wp-content/uploads/') !== false) return true;
            if (strpos($url, '/wp-content/') !== false && preg_match('#\.(jpg|jpeg|png|gif|webp|svg|css|js|woff2?|ttf|otf|eot)(\?.*)?$#i', $url)) return true;
            return false;
        };

        // href and src attributes
        $html = preg_replace_callback('#(href|src)=["\']([^"\']+)["\']#i', function ($m) use ($self, $base_url, &$used_urls, $looks_like_asset) {
            $original = $m[2];
            if (strpos($original, '/pwa/cache/') === 0) {
                if (!in_array($original, $used_urls)) $used_urls[] = $original;
                return $m[1] . '="' . $original . '"';
            }
            $abs = $self->absolutize_url($original, $base_url);
            if (!$looks_like_asset($abs)) {
                return $m[1] . '="' . $abs . '"';
            }
            $local = $self->cache_asset($abs, $base_url);
            if ($local) {
                if (!in_array($local['url'], $used_urls)) $used_urls[] = $local['url'];
                return $m[1] . '="' . $local['url'] . '"';
            }
            return $m[1] . '="' . $abs . '"';
        }, $html);

        // url(...) in inline style attributes
        $html = preg_replace_callback('#url\(["\']?([^"\')]+)["\']?\)#i', function ($m) use ($self, $base_url, &$used_urls, $looks_like_asset) {
            $original = $m[1];
            if (!$looks_like_asset($original)) {
                if (strpos($original, '/pwa/cache/') === 0 && !in_array($original, $used_urls)) $used_urls[] = $original;
                return 'url("' . $original . '")';
            }
            $abs = $self->absolutize_url($original, $base_url);
            $local = $self->cache_asset($abs, $base_url);
            if ($local) {
                if (!in_array($local['url'], $used_urls)) $used_urls[] = $local['url'];
                return 'url("' . $local['url'] . '")';
            }
            return 'url("' . $abs . '")';
        }, $html);

        // srcset: rewrite each URL
        $html = preg_replace_callback('#srcset=["\']([^"\']+)["\']#i', function ($m) use ($self, $base_url, &$used_urls, $looks_like_asset) {
            $parts = array_map('trim', explode(',', $m[1]));
            $out = [];
            foreach ($parts as $part) {
                $tokens = preg_split('#\s+#', $part, 2);
                $url = $tokens[0];
                $descriptor = $tokens[1] ?? '';
                if (!$looks_like_asset($url)) {
                    if (strpos($url, '/pwa/cache/') === 0 && !in_array($url, $used_urls)) $used_urls[] = $url;
                    $out[] = $url . ($descriptor ? ' ' . $descriptor : '');
                    continue;
                }
                $abs = $self->absolutize_url($url, $base_url);
                $local = $self->cache_asset($abs, $base_url);
                if ($local) {
                    if (!in_array($local['url'], $used_urls)) $used_urls[] = $local['url'];
                    $out[] = $local['url'] . ($descriptor ? ' ' . $descriptor : '');
                } else {
                    $out[] = $abs . ($descriptor ? ' ' . $descriptor : '');
                }
            }
            return 'srcset="' . implode(', ', $out) . '"';
        }, $html);

        return $html;
    }

    private function cache_css_urls($css, $base_url, &$used_urls) {
        $self = $this;
        return preg_replace_callback('#url\(["\']?([^"\')]+)["\']?\)#i', function ($m) use ($self, $base_url, &$used_urls) {
            $url = $m[1];
            if (preg_match('#^(data:|#)#i', $url)) {
                return 'url("' . $url . '")';
            }
            if (strpos($url, '/pwa/cache/') === 0) {
                if (!in_array($url, $used_urls)) $used_urls[] = $url;
                return 'url("' . $url . '")';
            }
            $abs = $self->absolutize_url($url, $base_url);
            $local = $self->cache_asset($abs, $base_url);
            if ($local) {
                if (!in_array($local['url'], $used_urls)) $used_urls[] = $local['url'];
                return 'url("' . $local['url'] . '")';
            }
            return 'url("' . $abs . '")';
        }, $css);
    }

    /* ── Asset caching helpers ── */
    private function cache_asset($url, $base_url, $is_critical = false) {
        $abs = $this->absolutize_url($url, $base_url);

        // Skip non-cacheable URLs
        if (!preg_match('#^https?://#i', $abs) || preg_match('#^(mailto:|tel:|data:)#i', $abs)) {
            return null;
        }

        $hash = $this->url_hash($abs);
        $ext  = $this->guess_extension($abs);
        $filename = $hash . '.' . $ext;
        $dest = $this->asset_dir . $filename;
        $local_url = $this->asset_url_base . $filename;

        // Already cached?
        if (file_exists($dest) && filesize($dest) > 0) {
            return ['url' => $local_url, 'path' => $dest];
        }

        // Respect per-page asset cap for non-critical assets (images, fonts, etc.)
        if (!$is_critical && $this->assets_downloaded_this_page >= $this->max_assets_per_snapshot) {
            $this->log("Asset cap reached, skipping: {$abs}");
            return null;
        }

        $response = wp_remote_get($abs, [
            'timeout'   => $this->asset_timeout,
            'sslverify' => false,
        ]);
        if (is_wp_error($response)) {
            $this->log("Asset download failed: {$abs} - " . $response->get_error_message());
            return null;
        }
        $code = wp_remote_retrieve_response_code($response);
        if ($code !== 200) {
            $this->log("Asset download HTTP {$code}: {$abs}");
            return null;
        }

        $body = wp_remote_retrieve_body($response);
        $size = strlen($body);
        if ($size === 0) {
            return null;
        }
        if ($size > $this->max_asset_size_bytes) {
            $this->log("Asset too large ({$size} bytes), skipping: {$abs}");
            return null;
        }

        // Refine extension from Content-Type if needed
        $ct = strtolower(wp_remote_retrieve_header($response, 'content-type') ?: '');
        $ext2 = $this->extension_from_content_type($ct, $ext);
        if ($ext2 !== $ext) {
            $ext = $ext2;
            $filename = $hash . '.' . $ext;
            $dest = $this->asset_dir . $filename;
            $local_url = $this->asset_url_base . $filename;
        }

        file_put_contents($dest, $body);
        if (!$is_critical) {
            $this->assets_downloaded_this_page++;
        }
        return ['url' => $local_url, 'path' => $dest];
    }

    private function log($message) {
        $this->sync_log[] = '[' . date('Y-m-d H:i:s') . '] ' . $message;
        error_log('Festival PWA: ' . $message);
    }

    private function load_cached_asset($local, $base_url, &$used_urls) {
        if (!$local || empty($local['path']) || !file_exists($local['path'])) return '';
        $content = file_get_contents($local['path']);
        if ($this->is_css_file($local['path'])) {
            return $this->cache_css_urls($content, $base_url, $used_urls);
        }
        return '';
    }

    private function url_hash($url) {
        return substr(md5($url), 0, 16);
    }

    private function guess_extension($url) {
        $path = parse_url($url, PHP_URL_PATH) ?: '';
        $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
        $ext = preg_replace('/[?#].*$/', '', $ext);
        if (in_array($ext, ['css', 'js', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'woff', 'woff2', 'ttf', 'otf', 'eot'])) {
            return $ext;
        }
        return 'bin';
    }

    private function extension_from_content_type($ct, $fallback) {
        if (strpos($ct, 'css') !== false) return 'css';
        if (strpos($ct, 'javascript') !== false || strpos($ct, 'js') !== false) return 'js';
        if (strpos($ct, 'svg') !== false) return 'svg';
        if (strpos($ct, 'png') !== false) return 'png';
        if (strpos($ct, 'jpeg') !== false || strpos($ct, 'jpg') !== false) return 'jpg';
        if (strpos($ct, 'gif') !== false) return 'gif';
        if (strpos($ct, 'webp') !== false) return 'webp';
        if (strpos($ct, 'woff2') !== false) return 'woff2';
        if (strpos($ct, 'woff') !== false) return 'woff';
        if (strpos($ct, 'ttf') !== false) return 'ttf';
        if (strpos($ct, 'otf') !== false) return 'otf';
        if (strpos($ct, 'eot') !== false) return 'eot';
        return $fallback;
    }

    private function is_css_file($path) {
        return strtolower(pathinfo($path, PATHINFO_EXTENSION)) === 'css';
    }

    /* ── RAW extraction: keep original HTML + styles ── */
    private function extract_raw($html, $page, $fetched_url = '') {
        $base_url = $this->resolve_base_url($page, $fetched_url);

        $doc = new DOMDocument();
        libxml_use_internal_errors(true);
        $doc->loadHTML('<?xml encoding="UTF-8"?>' . $html);
        libxml_clear_errors();
        $xpath = new DOMXPath($doc);

        $main = $xpath->query('//main')->item(0);
        if (!$main) {
            foreach (['//article', "//div[contains(@class,'entry-content')]", "//div[contains(@class,'post-content')]", "//div[contains(@class,'site-content')]", '//body'] as $q) {
                $node = $xpath->query($q)->item(0);
                if ($node) {
                    $main = $node;
                    break;
                }
            }
        }

        if (!$main) {
            return false;
        }

        $content_html = $this->get_inner_html($main);
        $content_html = preg_replace('#<script[^>]*>.*?</script>#is', '', $content_html);
        $content_html = $this->absolutize_urls($content_html, $base_url);
        $content_html = preg_replace('#\son\w+="[^"]*"#i', '', $content_html);
        $content_html = preg_replace("#\son\w+='[^']*'#i", '', $content_html);

        $styles = [];
        $links = $xpath->query('//link[@rel="stylesheet"]');
        foreach ($links as $link) {
            $href = $link->getAttribute('href');
            if (!$href) continue;
            if (strpos($href, 'jetpack') !== false && strpos($href, 'related-posts') !== false) continue;
            $styles[] = [
                'type' => 'link',
                'href' => $this->absolutize_url($href, $base_url),
            ];
        }

        $site_selectors = ['festival-accordion', 'eplus-', 'custom-', 'rhrn-', 'title-content-festival'];
        $style_blocks = $xpath->query('//style');
        foreach ($style_blocks as $style) {
            $css = $style->textContent;
            $has_site_selector = false;
            foreach ($site_selectors as $sel) {
                if (strpos($css, $sel) !== false) {
                    $has_site_selector = true;
                    break;
                }
            }
            if ($has_site_selector) {
                $styles[] = [
                    'type' => 'inline',
                    'css'  => $this->absolutize_css_urls($css, $base_url),
                ];
            }
        }

        $title = $page['label'];
        $titleNode = $xpath->query('//title')->item(0);
        if ($titleNode) {
            $title = preg_replace('/\s*[-–|]\s*Bucht der Träumer\*?/i', '', $titleNode->nodeValue);
            $title = trim($title);
        }
        $h1 = $xpath->query('//main//h1 | //h1')->item(0);
        if ($h1 && trim($h1->textContent)) {
            $title = trim($h1->textContent);
        }

        return [
            'type'    => 'raw',
            'slug'    => $page['slug'],
            'title'   => $title ?: $page['label'],
            'html'    => $content_html,
            'styles'  => $styles,
            'base_url'=> $base_url,
        ];
    }

    private function resolve_base_url($page, $fetched_url) {
        if ($fetched_url) {
            return $this->url_base($fetched_url);
        }
        if ($this->source_mode === 'current') {
            return get_site_url();
        }
        return $this->source_url ?: get_site_url();
    }

    private function url_base($url) {
        $parts = parse_url($url);
        return ($parts['scheme'] ?? 'https') . '://' . ($parts['host'] ?? '') . (isset($parts['port']) ? ':' . $parts['port'] : '');
    }

    private function get_inner_html($node) {
        $html = '';
        foreach ($node->childNodes as $child) {
            $html .= $node->ownerDocument->saveHTML($child);
        }
        return $html;
    }

    private function absolutize_urls($html, $base_url) {
        $html = preg_replace_callback('#(href|src)=["\']([^"\']+)["\']#i', function ($m) use ($base_url) {
            return $m[1] . '="' . $this->absolutize_url($m[2], $base_url) . '"';
        }, $html);
        $html = preg_replace_callback('#url\(["\']?([^"\')]+)["\']?\)#i', function ($m) use ($base_url) {
            return 'url("' . $this->absolutize_url($m[1], $base_url) . '")';
        }, $html);
        return $html;
    }

    private function absolutize_url($url, $base_url) {
        $url = trim($url);

        // Already absolute or special scheme
        if (stripos($url, 'http://') === 0 || stripos($url, 'https://') === 0) {
            return $url;
        }
        if (substr($url, 0, 2) === '//') {
            return 'https:' . $url;
        }
        if (preg_match('#^(data:|mailto:|tel:|#|javascript:)#i', $url)) {
            return $url;
        }

        // Already a local PWA cache path - never prepend base URL
        if (strpos($url, '/pwa/cache/') === 0) {
            return $url;
        }

        if (substr($url, 0, 1) === '/') {
            return $base_url . $url;
        }

        return $base_url . '/' . $url;
    }

    private function absolutize_css_urls($css, $base_url) {
        return preg_replace_callback('#url\(["\']?([^"\')]+)["\']?\)#i', function ($m) use ($base_url) {
            return 'url("' . $this->absolutize_url($m[1], $base_url) . '")';
        }, $css);
    }

    private function guess_page_type($xpath, $slug) {
        if (strpos($slug, 'faq') !== false || strpos($slug, 'question') !== false) {
            return 'faq';
        }

        $h3s = $xpath->query('//main//h3');
        if ($h3s->length === 0) return 'generic';

        $faq_like = 0;
        foreach ($h3s as $h3) {
            $next = $h3->nextSibling;
            while ($next && $next->nodeName !== 'p') {
                $next = $next->nextSibling;
            }
            if ($next && strlen(trim($next->textContent)) > 80) {
                $faq_like++;
            }
        }
        if ($faq_like >= 3 && $faq_like / $h3s->length >= 0.5) {
            return 'faq';
        }
        return 'grid';
    }

    /* ── Extractors ── */
    private function extract_faq($xpath, $page) {
        $items = [];
        
        $accordion_contents = $xpath->query('//div[contains(@class, "eb-accordion-content")]');
        if ($accordion_contents->length >= 3) {
            foreach ($accordion_contents as $content) {
                $post_item = $content;
                while ($post_item && $post_item->nodeName !== 'li') {
                    $post_item = $post_item->parentNode;
                    if (!$post_item || $post_item->nodeName === 'body') {
                        $post_item = null;
                        break;
                    }
                }
                if (!$post_item) continue;
                
                $title_nodes = $xpath->query('.//h2[contains(@class, "wp-block-post-title")]', $post_item);
                if ($title_nodes->length === 0) continue;
                
                $question = trim($title_nodes->item(0)->textContent);
                if (strlen($question) < 10) continue;
                if (stripos($question, 'destinations') !== false) continue;
                
                $answer_paras = $xpath->query('.//p', $content);
                $answer_parts = [];
                foreach ($answer_paras as $para) {
                    $txt = trim($para->textContent);
                    if ($txt) $answer_parts[] = $txt;
                }
                
                $items[] = [
                    'question' => $question,
                    'answer'   => implode("\n\n", $answer_parts),
                ];
            }
        }
        
        if (empty($items)) {
            $headings = $xpath->query('//main//h2 | //main//h3');
            foreach ($headings as $heading) {
                $question = trim($heading->textContent);
                if (strlen($question) < 10) continue;
                
                $answer_parts = [];
                $next = $heading->nextSibling;
                while ($next) {
                    if (in_array($next->nodeName, ['h2','h3','h4'])) break;
                    if ($next->nodeName === 'p' || $next->nodeName === 'div') {
                        $txt = trim($next->textContent);
                        if ($txt) $answer_parts[] = $txt;
                    }
                    $next = $next->nextSibling;
                }
                
                $items[] = [
                    'question' => $question,
                    'answer'   => implode("\n\n", $answer_parts),
                ];
            }
        }
        
        return [
            'type'   => 'faq',
            'slug'   => $page['slug'],
            'title'  => $page['label'],
            'intro'  => $this->extract_intro($xpath),
            'items'  => $items,
        ];
    }

    private function extract_grid($xpath, $page) {
        $items = [];
        $headings = $xpath->query('//main//h3');
        foreach ($headings as $heading) {
            $title = trim($heading->textContent);
            if (in_array($title, ['KULTUR­PROGRAMM', 'PERFORMANCES', 'WORKSHOPS', ''])) continue;

            $desc = '';
            $parent = $heading->parentNode;
            if ($parent) {
                $allText = $this->clean_text($parent->textContent);
                $desc = trim(str_replace($title, '', $allText));
            }
            if ($title) {
                $items[] = ['title' => $title, 'desc' => $desc];
            }
        }

        return [
            'type'   => 'grid',
            'slug'   => $page['slug'],
            'title'  => $page['label'],
            'intro'  => $this->extract_intro($xpath),
            'items'  => $items,
        ];
    }

    private function extract_generic($xpath, $page) {
        $main = $xpath->query('//main')->item(0)
            ?: $xpath->query('//body')->item(0);

        $title = '';
        $titleNode = $xpath->query('//title')->item(0);
        if ($titleNode) {
            $title = preg_replace('/\s*[-–|]\s*Bucht der Träumer\*?/i', '', $titleNode->nodeValue);
        }

        $text = $main ? $this->clean_text($main->textContent) : '';

        return [
            'type'    => 'generic',
            'slug'    => $page['slug'],
            'title'   => $title ?: $page['label'],
            'content' => substr($text, 0, 3000),
        ];
    }

    private function extract_intro($xpath) {
        $paragraphs = $xpath->query('//main//p');
        $parts = [];
        foreach ($paragraphs as $p) {
            $txt = trim($p->textContent);
            if (strlen($txt) > 15 && count($parts) < 3) {
                $parts[] = $txt;
            }
        }
        return implode("\n\n", $parts);
    }

    /* ── Manifest ── */
    private function write_manifest($synced_slugs) {
        $pages = [];
        foreach ($this->pages as $page) {
            if (in_array($page['slug'], $synced_slugs)) {
                $pages[] = [
                    'slug'  => $page['slug'],
                    'label' => $page['label'],
                    'icon'  => $page['icon'] ?? '📄',
                ];
            }
        }

        $manifest = [
            'pages'       => $pages,
            'app_name'    => get_option('festival_pwa_app_name', 'Festival Guide'),
            'start_page'  => get_option('festival_pwa_start_page', ''),
            'synced_at'   => time(),
        ];

        $this->save_json('_manifest.json', $manifest);
    }

    /* ── Design assets ── */
    private function sync_design_assets() {
        $source = ($this->source_mode === 'current')
            ? get_site_url()
            : $this->source_url;

        if (!$source) return;

        $base = rtrim($source, '/');

        $bg_candidates = [
            '/wp-content/uploads/2026/01/scrollpage_1920_3.jpg',
            '/wp-content/uploads/2025/12/landing-rhrn_ohne.png',
            '/wp-content/uploads/2026/01/scrollpage_1920_2.jpg',
            '/wp-content/uploads/2026/01/scrollpage_1920_1.jpg',
        ];
        $this->download_first($bg_candidates, $base, FESTIVAL_PWA_DIR . 'pwa/images/bg.jpg');

        $logo_candidates = [
            '/wp-content/uploads/2026/06/Datum.png',
            '/wp-content/uploads/2026/06/datum.png',
            '/wp-content/uploads/2025/12/datum.png',
        ];
        $this->download_first($logo_candidates, $base, FESTIVAL_PWA_DIR . 'pwa/images/datum.png');
    }

    private function download_first($candidates, $base, $dest) {
        foreach ($candidates as $path) {
            $url = $base . $path;
            if ($this->download_file($url, $dest)) {
                return true;
            }
        }
        return false;
    }

    private function download_file($url, $dest) {
        $response = wp_remote_get($url, [
            'timeout'   => 60,
            'sslverify' => false,
        ]);
        if (!is_wp_error($response) && wp_remote_retrieve_response_code($response) === 200) {
            $dir = dirname($dest);
            if (!is_dir($dir)) wp_mkdir_p($dir);
            file_put_contents($dest, wp_remote_retrieve_body($response));
            return true;
        }
        return false;
    }

    /* ── Helpers ── */
    private function save_json($filename, $data) {
        $path = $this->cache_dir . $filename;
        file_put_contents($path, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    }

    private function clean_text($text) {
        return trim(preg_replace('/\s+/', ' ', preg_replace('/\n\s*\n/', "\n", $text)));
    }
}
