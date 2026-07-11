<?php
class Festival_Admin {
    public static function init() {
        add_action('admin_menu', [__CLASS__, 'menu']);
        add_action('admin_init', [__CLASS__, 'settings']);
    }

    public static function menu() {
        add_submenu_page(
            'edit.php?post_type=festival_event',
            'PWA Settings',
            'PWA Settings',
            'manage_options',
            'festival-pwa-settings',
            [__CLASS__, 'page']
        );
    }

    public static function settings() {
        register_setting('festival_pwa', 'festival_pwa_name');
        register_setting('festival_pwa', 'festival_pwa_announcement');
    }

    public static function page() {
        ?>
        <div class="wrap">
            <h1>Festival PWA Settings</h1>
            <form method="post" action="options.php">
                <?php settings_fields('festival_pwa'); do_settings_sections('festival_pwa'); ?>
                <table class="form-table">
                    <tr>
                        <th>PWA Name</th>
                        <td>
                            <input type="text" name="festival_pwa_name"
                                   value="<?php echo esc_attr(get_option('festival_pwa_name', 'Festival')); ?>"
                                   class="regular-text">
                        </td>
                    </tr>
                    <tr>
                        <th>Urgent Announcement</th>
                        <td>
                            <textarea name="festival_pwa_announcement" rows="4" cols="50"
                                      placeholder="Leave empty for no announcement"><?php echo esc_textarea(get_option('festival_pwa_announcement', '')); ?></textarea>
                            <p class="description">This appears as an overlay when users open the PWA.</p>
                        </td>
                    </tr>
                </table>
                <?php submit_button(); ?>
            </form>
        </div>
        <?php
    }
}
Festival_Admin::init();
