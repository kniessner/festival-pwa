<?php
/**
 * Fetches and caches content from multiple sources:
 *   - internal   : WP pages on the same site (uses get_post())
 *   - source     : Pages from the configured source site (HTTP fetch)
 *   - remote     : Any absolute URL on the web (HTTP fetch)
 *
 * Writes structured JSON to pwa/data/ for the PWA frontend.
 */

if (!defined('ABSPATH')) exit;

class Festival_PWA_Content_Sync {
    private $source_mode;
    private $source_url;
    private $cache_dir;
    private $pages;

    public function __construct() {
        $this->source_mode = get_option('festival_pwa_source_mode', 'current');
        $this->source_url  = rtrim(get_option('festival_pwa_source_url', ''), '/');
        $this->cache_dir   = FESTIVAL_PWA_DIR . 'pwa/data/';
        $this->pages      = (array) get_option('festival_pwa_pages', []);
        if (!is_dir($this->cache_dir)) {
            wp_mkdir_p($this->cache_dir);
        }
    }

    /**
     * Sync all configured pages + design assets.
     */
    public function sync_all() {
        $success = true;
        $synced  = [];

        foreach ($this->pages as $page) {
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

        return $success;
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

        // Build fake HTML from post content so extract_content() can parse it
        $html = "<html><head><title>" . esc_html($post->post_title) . "</title></head>
                <body><main>" . apply_filters('the_content', $post->post_content) . "</main></body></html>";

        return $this->extract_content($html, $page);
    }

    /* ── SOURCE: configured source site ── */
    private function fetch_source($page) {
        $source_slug = $page['source_value'] ?: $page['slug'];

        if ($this->source_mode === 'current') {
            // Same site — treat as internal lookup
            $post = get_page_by_path($source_slug);
            if ($post) {
                return $this->fetch_internal([
                    'slug'         => $page['slug'],
                    'source_value' => $post->ID,
                ]);
            }
            // Fallback: maybe it's a custom route; try HTTP
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
        return $this->extract_content($html, $page);
    }

    /**
     * Extract structured content from raw HTML.
     */
    private function extract_content($html, $page) {
        $html = preg_replace('#<script[^>]*>.*?</script>#is', '', $html);
        $html = preg_replace('#<style[^>]*>.*?</style>#is', '', $html);

        $doc = new DOMDocument();
        libxml_use_internal_errors(true);
        $doc->loadHTML('<?xml encoding="UTF-8"?>' . $html);
        libxml_clear_errors();

        $xpath = new DOMXPath($doc);
        $type  = $this->guess_page_type($xpath, $page['slug']);

        switch ($type) {
            case 'faq':  return $this->extract_faq($xpath, $page);
            case 'grid': return $this->extract_grid($xpath, $page);
            default:     return $this->extract_generic($xpath, $page);
        }
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
        
        // Try WordPress accordion block structure first (eb-accordion-content)
        $accordion_contents = $xpath->query('//div[contains(@class, "eb-accordion-content")]');
        if ($accordion_contents->length >= 3) {
            // Find the parent li.wp-block-post for each accordion
            foreach ($accordion_contents as $content) {
                // Walk up to find the containing post item
                $post_item = $content;
                while ($post_item && $post_item->nodeName !== 'li') {
                    $post_item = $post_item->parentNode;
                    if (!$post_item || $post_item->nodeName === 'body') {
                        $post_item = null;
                        break;
                    }
                }
                if (!$post_item) continue;
                
                // Find h2.wp-block-post-title within this post item
                $title_nodes = $xpath->query('.//h2[contains(@class, "wp-block-post-title")]', $post_item);
                if ($title_nodes->length === 0) continue;
                
                $question = trim($title_nodes->item(0)->textContent);
                if (strlen($question) < 10) continue;
                if (stripos($question, 'destinations') !== false) continue; // Skip generic placeholder
                
                // Extract answer paragraphs from the accordion content
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
        
        // Fallback: standard heading + sibling paragraphs
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

        $this->download_file(
            rtrim($source, '/') . '/wp-content/uploads/2026/01/scrollpage_1920_3.jpg',
            FESTIVAL_PWA_DIR . 'pwa/images/bg.jpg'
        );
        $this->download_file(
            rtrim($source, '/') . '/wp-content/uploads/2026/06/Datum.png',
            FESTIVAL_PWA_DIR . 'pwa/images/datum.png'
        );
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
