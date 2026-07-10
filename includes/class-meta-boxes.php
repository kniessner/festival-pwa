<?php
class Festival_Meta_Boxes {
    public static function init() {
        add_action('add_meta_boxes', [__CLASS__, 'add']);
        add_action('save_post', [__CLASS__, 'save']);
    }

    public static function add() {
        add_meta_box('festival_event_details', 'Event Details', [__CLASS__, 'render'], 'festival_event');
    }

    public static function render($post) {
        $day      = get_post_meta($post->ID, '_festival_day', true);
        $start    = get_post_meta($post->ID, '_festival_start', true);
        $end      = get_post_meta($post->ID, '_festival_end', true);
        $category = get_post_meta($post->ID, '_festival_category', true);
        wp_nonce_field('festival_event_nonce', 'festival_event_nonce');
        ?>
        <style>
            .festival-meta-box p { margin: 8px 0; }
            .festival-meta-box label { display: inline-block; width: 80px; font-weight: 600; }
            .festival-meta-box input, .festival-meta-box select {
                padding: 6px 10px; border: 1px solid #ccc; border-radius: 4px; min-width: 200px;
            }
        </style>
        <div class="festival-meta-box">
            <p><label>Day</label>
                <select name="festival_day">
                    <option value="mi" <?php selected($day, 'mi'); ?>>Mi (Wed)</option>
                    <option value="do" <?php selected($day, 'do'); ?>>Do (Thu)</option>
                    <option value="fr" <?php selected($day, 'fr'); ?>>Fr (Fri)</option>
                    <option value="sa" <?php selected($day, 'sa'); ?>>Sa (Sat)</option>
                    <option value="so" <?php selected($day, 'so'); ?>>So (Sun)</option>
                    <option value="mo" <?php selected($day, 'mo'); ?>>Mo (Mon)</option>
                </select>
            </p>
            <p><label>Start</label><input type="time" name="festival_start" value="<?php echo esc_attr($start); ?>"></p>
            <p><label>End</label><input type="time" name="festival_end" value="<?php echo esc_attr($end); ?>"></p>
            <p><label>Category</label><input type="text" name="festival_category" value="<?php echo esc_attr($category); ?>" placeholder="DJ, Live, Workshop..."></p>
        </div>
        <?php
    }

    public static function save($post_id) {
        if (!wp_verify_nonce($_POST['festival_event_nonce'] ?? '', 'festival_event_nonce')) return;
        if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) return;
        if (!current_user_can('edit_post', $post_id)) return;

        update_post_meta($post_id, '_festival_day',      sanitize_text_field($_POST['festival_day'] ?? ''));
        update_post_meta($post_id, '_festival_start',    sanitize_text_field($_POST['festival_start'] ?? ''));
        update_post_meta($post_id, '_festival_end',      sanitize_text_field($_POST['festival_end'] ?? ''));
        update_post_meta($post_id, '_festival_category', sanitize_text_field($_POST['festival_category'] ?? ''));
    }
}
Festival_Meta_Boxes::init();
