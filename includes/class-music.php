<?php
/**
 * "Music" — a custom post type for the DJ/live-act lineup (title + start/end
 * datetime + a fixed stage dropdown). Mirrors class-notifications.php's
 * pattern closely: saving regenerates music.json and writes it to the same
 * two places (this plugin's pwa/data/, and the standalone webapp's data/).
 *
 * Unlike notifications, music.json isn't read as its own page — its
 * events/stages are merged into store.pageData.timetable client-side (see
 * standalone/js/music.js), because that's the one array both the Program
 * list and the grid Timetable already read from. There's no build-time
 * equivalent (scripts/_build_timetable.py runs locally, offline from this
 * plugin), so the merge has to happen in the browser after every fetch.
 */

if (!defined('ABSPATH')) exit;

if (!defined('FESTIVAL_PWA_WEBAPP_DATA_DIR_DEFAULT')) {
    define('FESTIVAL_PWA_WEBAPP_DATA_DIR_DEFAULT', '/srv/htdocs/webapp/data');
}

class Festival_PWA_Music {
    const POST_TYPE = 'pwa_music_event';

    // Fixed list — the dropdown in the editor, and the stage filter/rows the
    // grid Timetable will show once at least one event references them.
    const STAGES = [
        'Atlantis',
        'Porto Loco',
        'Seeblick',
        'Schlupfloch',
        'Stroboklo',
        'Waldtraut',
        'Unterholz',
        'Neustockland',
        'Mirage Outdoor',
        'Mirage Indoor',
        'Schweißperle',
        'Strandflitzer',
        'Zirkus Mond draußen',
        'Zirkus Mond drinnen',
        'Sektamt',
    ];

    // Stage acts run around the clock — same rollover convention the
    // standalone app already uses (DAY_ROLLOVER_HOUR in timetable-grid.js):
    // hours before this belong to the previous festival night, not a new
    // calendar day.
    const DAY_ROLLOVER_HOUR = 6;

    public function __construct() {
        add_action('init', [$this, 'register_post_type']);
        add_action('add_meta_boxes', [$this, 'add_meta_box']);
        add_action('save_post_' . self::POST_TYPE, [$this, 'save']);
        add_action('trashed_post', [$this, 'on_status_change']);
        add_action('untrashed_post', [$this, 'on_status_change']);
        add_action('before_delete_post', [$this, 'on_status_change']);
        add_action('rest_api_init', [$this, 'register_routes']);
    }

    public function register_post_type() {
        register_post_type(self::POST_TYPE, [
            'labels' => [
                'name'          => 'Music',
                'singular_name' => 'Music Event',
                'add_new'       => 'Add Music Event',
                'add_new_item'  => 'Add New Music Event',
                'edit_item'     => 'Edit Music Event',
                'all_items'     => 'All Music Events',
                'menu_name'     => 'Music',
            ],
            'public'       => false,
            'show_ui'      => true,
            'supports'     => ['title'],
            'menu_icon'    => 'dashicons-format-audio',
            'has_archive'  => false,
            // A purpose-built REST route below serves the shape the PWA
            // expects — the default post-type REST controller wouldn't.
            'show_in_rest' => false,
        ]);
    }

    /* ── Meta box: start/end datetime + stage dropdown ───────────────── */

    public function add_meta_box() {
        add_meta_box(
            'pwa_music_details',
            'Event Details',
            [$this, 'render_meta_box'],
            self::POST_TYPE,
            'normal',
            'high'
        );
    }

    public function render_meta_box($post) {
        $start = get_post_meta($post->ID, '_pwa_music_start', true);
        $end   = get_post_meta($post->ID, '_pwa_music_end', true);
        $stage = get_post_meta($post->ID, '_pwa_music_stage', true);
        wp_nonce_field('pwa_music_nonce', 'pwa_music_nonce');
        ?>
        <p>
            <label for="pwa_music_start"><strong>Start</strong></label><br>
            <input type="datetime-local" id="pwa_music_start" name="pwa_music_start"
                value="<?php echo esc_attr($start); ?>">
        </p>
        <p>
            <label for="pwa_music_end"><strong>End</strong></label><br>
            <input type="datetime-local" id="pwa_music_end" name="pwa_music_end"
                value="<?php echo esc_attr($end); ?>">
        </p>
        <p>
            <label for="pwa_music_stage"><strong>Stage</strong></label><br>
            <select id="pwa_music_stage" name="pwa_music_stage">
                <option value="">— Select a stage —</option>
                <?php foreach (self::STAGES as $label): $value = sanitize_title($label); ?>
                    <option value="<?php echo esc_attr($value); ?>" <?php selected($stage, $value); ?>>
                        <?php echo esc_html($label); ?>
                    </option>
                <?php endforeach; ?>
            </select>
        </p>
        <?php
    }

    public function save($post_id) {
        if (!isset($_POST['pwa_music_nonce']) || !wp_verify_nonce($_POST['pwa_music_nonce'], 'pwa_music_nonce')) return;
        if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) return;
        if (!current_user_can('edit_post', $post_id)) return;

        update_post_meta($post_id, '_pwa_music_start', sanitize_text_field($_POST['pwa_music_start'] ?? ''));
        update_post_meta($post_id, '_pwa_music_end', sanitize_text_field($_POST['pwa_music_end'] ?? ''));
        update_post_meta($post_id, '_pwa_music_stage', sanitize_text_field($_POST['pwa_music_stage'] ?? ''));

        $this->rebuild_json();
    }

    public function on_status_change($post_id) {
        if (get_post_type($post_id) !== self::POST_TYPE) return;
        $this->rebuild_json();
    }

    /* ── JSON generation ──────────────────────────────────────────────── */

    private function derive_day($datetime_local) {
        if (!$datetime_local) return '';
        try {
            $dt = new DateTime($datetime_local);
        } catch (Exception $e) {
            return '';
        }
        if ((int) $dt->format('H') < self::DAY_ROLLOVER_HOUR) {
            $dt->modify('-1 day');
        }
        return $dt->format('Y-m-d');
    }

    public function rebuild_json() {
        $posts = get_posts([
            'post_type'      => self::POST_TYPE,
            'post_status'    => 'publish',
            'posts_per_page' => -1,
            'orderby'        => 'meta_value',
            'meta_key'       => '_pwa_music_start',
            'order'          => 'ASC',
        ]);

        $stageLabelByValue = [];
        foreach (self::STAGES as $label) {
            $stageLabelByValue[sanitize_title($label)] = $label;
        }

        $events = [];
        foreach ($posts as $post) {
            $start = get_post_meta($post->ID, '_pwa_music_start', true);
            $end   = get_post_meta($post->ID, '_pwa_music_end', true);
            $stageValue = get_post_meta($post->ID, '_pwa_music_stage', true);
            if (!$start || !$stageValue) continue;

            try {
                $startDt = new DateTime($start);
                $endDt = $end ? new DateTime($end) : null;
            } catch (Exception $e) {
                continue;
            }

            $events[] = [
                'id'          => $post->ID,
                'title'       => get_the_title($post),
                'day'         => $this->derive_day($start),
                'start_time'  => $startDt->format('H:i'),
                'end_time'    => $endDt ? $endDt->format('H:i') : '',
                'stage'       => $stageValue,
                'stage_label' => $stageLabelByValue[$stageValue] ?? $stageValue,
                'category'    => 'Music',
            ];
        }

        // Always the full fixed list, not just stages with events yet — so
        // they're selectable/visible as soon as the CPT exists, matching
        // how the other festival stages are already handled.
        $stages = array_map(function ($label) {
            return ['value' => sanitize_title($label), 'label' => $label];
        }, self::STAGES);

        $data = [
            'type'   => 'music',
            'slug'   => 'music',
            'events' => $events,
            'stages' => $stages,
        ];

        $json = wp_json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);

        wp_mkdir_p(FESTIVAL_PWA_DIR . 'pwa/data/');
        file_put_contents(FESTIVAL_PWA_DIR . 'pwa/data/music.json', $json);

        $webapp_dir = rtrim(get_option('festival_pwa_webapp_data_dir', FESTIVAL_PWA_WEBAPP_DATA_DIR_DEFAULT), '/');
        if ($webapp_dir && is_dir($webapp_dir) && is_writable($webapp_dir)) {
            file_put_contents($webapp_dir . '/music.json', $json);
        }

        return $data;
    }

    /* ── REST ─────────────────────────────────────────────────────────── */

    public function register_routes() {
        register_rest_route('festival/v1', '/music', [
            'methods'             => 'GET',
            'callback'            => [$this, 'get_music'],
            'permission_callback' => '__return_true',
        ]);
    }

    public function get_music() {
        $file = FESTIVAL_PWA_DIR . 'pwa/data/music.json';
        $data = file_exists($file)
            ? json_decode(file_get_contents($file), true)
            : $this->rebuild_json();

        $data['_synced'] = file_exists($file) ? filemtime($file) : time();
        return new WP_REST_Response($data, 200);
    }
}

new Festival_PWA_Music();
