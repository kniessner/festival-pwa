<?php
class Festival_Post_Type {
    public static function register() {
        register_post_type('festival_event', [
            'labels' => [
                'name'          => 'Festival Events',
                'singular_name' => 'Event',
                'add_new'       => 'Add Event',
                'add_new_item'  => 'Add New Event',
                'edit_item'     => 'Edit Event',
            ],
            'public'       => false,
            'show_ui'      => true,
            'supports'     => ['title', 'editor', 'thumbnail'],
            'menu_icon'    => 'dashicons-calendar-alt',
            'has_archive'  => false,
            'show_in_rest' => true,
        ]);

        register_taxonomy('festival_stage', 'festival_event', [
            'labels' => [
                'name'          => 'Stages',
                'singular_name' => 'Stage',
                'add_new_item'  => 'Add Stage',
            ],
            'hierarchical' => false,
            'show_ui'      => true,
            'show_in_rest' => true,
        ]);
    }
}
