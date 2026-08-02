<?php
/**
 * CSV import for pwa_music_event — see
 * docs/superpowers/specs/2026-08-02-music-csv-import-design.md for the
 * full design (upsert-by-external-ID, weekday+rollover datetime math,
 * why the CSV's free-text Playtime column is ignored).
 */

if (!defined('ABSPATH')) exit;

class Festival_PWA_Music_Import {
    const PAGE_SLUG = 'pwa-music-import';

    // This festival edition's fixed dates — confirmed by the CSV's own
    // Playtime text throughout. Mirrors how STAGES is a hardcoded const
    // on Festival_PWA_Music for the same reason (this is edition-specific
    // data, not something to build UI around).
    const WEEKDAY_DATES = [
        'thursday' => '2026-08-13',
        'friday'   => '2026-08-14',
        'saturday' => '2026-08-15',
        'sunday'   => '2026-08-16',
        'monday'   => '2026-08-17',
    ];

    /* ── Pure helpers (no WordPress calls except sanitize_title) ──────── */

    public static function normalize_time($raw) {
        $raw = trim((string) $raw);
        if ($raw === '' || $raw === '30.12.1899') return null;
        $raw = str_replace('.', ':', $raw);
        if (!preg_match('/^([01]?\d|2[0-3]):([0-5]\d)$/', $raw, $m)) return null;
        return sprintf('%02d:%02d', (int) $m[1], (int) $m[2]);
    }

    public static function resolve_datetimes($day, $start_raw, $end_raw) {
        $day_key = strtolower(trim((string) $day));
        if (!isset(self::WEEKDAY_DATES[$day_key])) {
            return ['start' => null, 'end' => null];
        }
        $base_date = self::WEEKDAY_DATES[$day_key];

        $start_time = self::normalize_time($start_raw);
        if ($start_time === null) {
            return ['start' => null, 'end' => null];
        }

        $start_dt = new DateTime($base_date . ' ' . $start_time);
        if ((int) $start_dt->format('H') < Festival_PWA_Music::DAY_ROLLOVER_HOUR) {
            $start_dt->modify('+1 day');
        }

        $end = null;
        $end_time = self::normalize_time($end_raw);
        if ($end_time !== null) {
            $end_dt = new DateTime($base_date . ' ' . $end_time);
            if ((int) $end_dt->format('H') < Festival_PWA_Music::DAY_ROLLOVER_HOUR) {
                $end_dt->modify('+1 day');
            }
            if ($end_dt <= $start_dt) {
                $end_dt->modify('+1 day');
            }
            $end = $end_dt->format('Y-m-d\TH:i');
        }

        return [
            'start' => $start_dt->format('Y-m-d\TH:i'),
            'end'   => $end,
        ];
    }

    public static function resolve_stage($raw_stage) {
        $raw_stage = trim((string) $raw_stage);
        if ($raw_stage === '') return null;
        $slug = sanitize_title($raw_stage);
        foreach (Festival_PWA_Music::STAGES as $label) {
            if (sanitize_title($label) === $slug) return $slug;
        }
        return null;
    }

    /**
     * Parse the uploaded CSV into an array of column-keyed rows.
     *
     * Returns null — not [] — when the file cannot be read, has no header
     * row, or the header is missing a column the import fundamentally needs
     * (ID and Dein Artist Name; import_row() skips any row lacking either).
     * That lets run_import() tell "malformed upload, abort" apart from the
     * legitimate "valid header, zero data rows" case, which returns [].
     *
     * fgetcsv() takes every argument explicitly: PHP 8.5+ deprecates relying
     * on the default $escape, and '' is the right value for an Excel-style
     * export, which has no backslash-escaping convention.
     */
    const REQUIRED_COLUMNS = ['ID', 'Dein Artist Name'];

    public static function parse_csv_file($path) {
        $handle = @fopen($path, 'r');
        if (!$handle) return null;

        $header = fgetcsv($handle, 0, ',', '"', '');
        if (!$header) { fclose($handle); return null; }

        $header = array_map(static function ($col) {
            // Strip a UTF-8 BOM off the first column and trim stray padding.
            return trim(preg_replace('/^\xEF\xBB\xBF/', '', (string) $col));
        }, $header);

        foreach (self::REQUIRED_COLUMNS as $required) {
            if (!in_array($required, $header, true)) {
                fclose($handle);
                return null;
            }
        }

        $rows = [];
        while (($line = fgetcsv($handle, 0, ',', '"', '')) !== false) {
            if (count($line) < count($header)) {
                $line = array_pad($line, count($header), '');
            }
            $rows[] = array_combine($header, array_slice($line, 0, count($header)));
        }
        fclose($handle);
        return $rows;
    }

    /**
     * Pure analysis of one parsed CSV row — no WordPress writes. Stage,
     * start, and end are each resolved independently: a row can have a
     * matching stage but an unparseable time, and vice versa.
     */
    public static function analyze_row($row) {
        $external_id = trim($row['ID'] ?? '');
        $title       = trim($row['Dein Artist Name'] ?? '');
        $stage_raw   = trim($row['Stage'] ?? '');
        $day_raw     = trim($row['day'] ?? '');
        $start_raw   = trim($row['start_time'] ?? '');

        $stage_value = self::resolve_stage($stage_raw);
        $dt = self::resolve_datetimes($day_raw, $start_raw, $row['end_time'] ?? '');

        $flags = [];
        if ($stage_raw !== '' && $stage_value === null) {
            $flags[] = 'no stage match';
        }
        if ($dt['start'] === null) {
            $flags[] = ($day_raw === '' && $start_raw === '') ? 'unscheduled' : 'unparseable time';
        }
        // Flag if start resolved but end_time is non-blank and unparseable
        if ($dt['start'] !== null && $dt['end'] === null && trim($row['end_time'] ?? '') !== '') {
            $flags[] = 'unparseable time';
        }

        return [
            'external_id' => $external_id,
            'title'       => $title,
            'stage_value' => $stage_value,
            'start'       => $dt['start'],
            'end'         => $dt['end'],
            'flags'       => $flags,
        ];
    }

    /* ── WordPress-dependent import ───────────────────────────────────── */

    public static function import_row($analyzed) {
        $external_id = sanitize_text_field($analyzed['external_id']);
        $title       = sanitize_text_field($analyzed['title']);

        if ($external_id === '' || $title === '') {
            return ['status' => 'skipped', 'analyzed' => $analyzed];
        }

        // Explicit status list rather than 'any': 'any' silently excludes
        // statuses registered with exclude_from_search, i.e. 'trash'. Without
        // trash here, trashing an imported event and re-importing would miss
        // the existing post and create a duplicate with the same external ID.
        $existing = get_posts([
            'post_type'      => Festival_PWA_Music::POST_TYPE,
            'post_status'    => ['publish', 'draft', 'pending', 'private', 'trash'],
            'posts_per_page' => 1,
            'meta_key'       => '_pwa_music_external_id',
            'meta_value'     => $external_id,
        ]);

        if ($existing) {
            $post_id = $existing[0]->ID;
            wp_update_post(['ID' => $post_id, 'post_title' => $title]);
            $status = 'updated';
        } else {
            $post_id = wp_insert_post([
                'post_type'   => Festival_PWA_Music::POST_TYPE,
                'post_title'  => $title,
                'post_status' => 'publish',
            ]);
            $status = 'created';
        }

        if (is_wp_error($post_id) || !$post_id) {
            return ['status' => 'error', 'analyzed' => $analyzed];
        }

        update_post_meta($post_id, '_pwa_music_external_id', $external_id);
        if ($analyzed['stage_value'] !== null) {
            update_post_meta($post_id, '_pwa_music_stage', $analyzed['stage_value']);
        }
        if ($analyzed['start'] !== null) {
            update_post_meta($post_id, '_pwa_music_start', $analyzed['start']);
        }
        if ($analyzed['end'] !== null) {
            update_post_meta($post_id, '_pwa_music_end', $analyzed['end']);
        }

        return ['status' => $status, 'post_id' => $post_id, 'analyzed' => $analyzed];
    }

    public static function run_import($csv_path) {
        // ~313 lookups + up to 312 inserts + ~1,250 meta writes in one
        // request. Best-effort only: @ swallows the notice on hosts where
        // set_time_limit is disabled, where this simply does nothing.
        @set_time_limit(0);

        $rows = self::parse_csv_file($csv_path);
        if ($rows === null) {
            // Abort before touching the database or rebuilding the JSON.
            return ['error' => 'The CSV could not be read, or is missing required columns (ID, Dein Artist Name).'];
        }

        $results = ['created' => 0, 'updated' => 0, 'skipped' => 0, 'errors' => 0, 'flagged' => []];

        foreach ($rows as $row) {
            $analyzed = self::analyze_row($row);
            $outcome = self::import_row($analyzed);

            if ($outcome['status'] === 'created') $results['created']++;
            elseif ($outcome['status'] === 'updated') $results['updated']++;
            elseif ($outcome['status'] === 'error') $results['errors']++;
            else $results['skipped']++;

            if (!empty($analyzed['flags'])) {
                $results['flagged'][] = [
                    'external_id' => $analyzed['external_id'],
                    'title'       => $analyzed['title'],
                    'reasons'     => $analyzed['flags'],
                ];
            }
        }

        Festival_PWA_Music::rebuild_json();

        return $results;
    }

    /* ── Admin UI ──────────────────────────────────────────────────────── */

    public function __construct() {
        add_action('admin_menu', [$this, 'add_menu']);
    }

    public function add_menu() {
        add_submenu_page(
            'edit.php?post_type=' . Festival_PWA_Music::POST_TYPE,
            'Import CSV',
            'Import CSV',
            // publish_posts, not edit_posts: import_row() creates posts as
            // 'publish', and this CPT uses capability_type 'post', so a
            // Contributor holds edit_posts but must not be able to publish.
            // Must stay in sync with render_page()'s own check below.
            'publish_posts',
            self::PAGE_SLUG,
            [$this, 'render_page']
        );
    }

    public function render_page() {
        $results = null;

        if (
            isset($_POST['pwa_music_import_submit'])
            && wp_verify_nonce($_POST['pwa_music_import_nonce'] ?? '', 'pwa_music_import')
            && current_user_can('publish_posts') // keep in sync with add_menu()
        ) {
            if (!empty($_FILES['music_csv']['tmp_name']) && is_uploaded_file($_FILES['music_csv']['tmp_name'])) {
                $results = self::run_import($_FILES['music_csv']['tmp_name']);
            } else {
                $results = ['error' => 'No file uploaded.'];
            }
        }
        ?>
        <div class="wrap">
            <h1>Import Music Events (CSV)</h1>

            <?php if ($results !== null): ?>
                <?php if (isset($results['error'])): ?>
                    <div class="notice notice-error"><p><?php echo esc_html($results['error']); ?></p></div>
                <?php else: ?>
                    <div class="notice notice-success">
                        <p><?php echo esc_html(sprintf(
                            'Created %d, updated %d, skipped %d, errors %d.',
                            $results['created'],
                            $results['updated'],
                            $results['skipped'],
                            $results['errors']
                        )); ?></p>
                    </div>
                    <?php if (!empty($results['flagged'])): ?>
                        <h2>Needs review (<?php echo count($results['flagged']); ?>)</h2>
                        <table class="wp-list-table widefat fixed striped">
                            <thead>
                                <tr><th>External ID</th><th>Artist</th><th>Reason</th></tr>
                            </thead>
                            <tbody>
                                <?php foreach ($results['flagged'] as $flag): ?>
                                    <tr>
                                        <td><?php echo esc_html($flag['external_id']); ?></td>
                                        <td><?php echo esc_html($flag['title']); ?></td>
                                        <td><?php echo esc_html(implode(', ', $flag['reasons'])); ?></td>
                                    </tr>
                                <?php endforeach; ?>
                            </tbody>
                        </table>
                    <?php endif; ?>
                <?php endif; ?>
            <?php endif; ?>

            <form method="post" enctype="multipart/form-data">
                <?php wp_nonce_field('pwa_music_import', 'pwa_music_import_nonce'); ?>
                <p><input type="file" name="music_csv" accept=".csv" required></p>
                <p class="description">
                    Expected columns: ID, Dein Artist Name, Stage, Playtime, day, start_time, end_time.
                </p>
                <?php submit_button('Import', 'primary', 'pwa_music_import_submit'); ?>
            </form>
        </div>
        <?php
    }
}

new Festival_PWA_Music_Import();
