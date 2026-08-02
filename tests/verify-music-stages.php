<?php
define('ABSPATH', '/tmp/');
define('FESTIVAL_PWA_DIR', '/tmp/');

// Stub WordPress functions with actual data flow to exercise rebuild_json() loop
function add_action(...$args) {}
function add_filter(...$args) {}

// Return one fake post object so the loop body executes
function get_posts($args = []) {
    $post = new stdClass();
    $post->ID = 1;
    return [$post];
}

// Return appropriate values for the keys that matter
function get_post_meta($post_id, $meta_key = '', $single = false) {
    if ($meta_key === '_pwa_music_start') {
        return '2026-08-14T20:00:00'; // Valid datetime that passes the guard
    }
    if ($meta_key === '_pwa_music_stage') {
        return 'atlantis'; // Must be a sanitized stage name from STAGES
    }
    return '';
}

function get_the_title($post) {
    return 'Test Event';
}

function wp_json_encode($data, $flags = 0) {
    return json_encode($data, $flags);
}

function wp_mkdir_p($pathname, $mode = 0777) {
    @mkdir($pathname, $mode, true);
}

function get_option($option, $default = false) {
    return $default;
}

function sanitize_title($str) {
    return strtolower(trim(preg_replace('/[^a-zA-Z0-9]+/', '-', $str), '-'));
}

require '/Users/darius.kniessner/Dev/VaultOS/30-projects-active/2026-festival-pwa/includes/class-music.php';

echo "=== Stage Tests ===\n";
$stages = Festival_PWA_Music::STAGES;
$checks = [
    'has Mirage'               => in_array('Mirage', $stages, true),
    'no Mirage Outdoor'        => !in_array('Mirage Outdoor', $stages, true),
    'no Mirage Indoor'         => !in_array('Mirage Indoor', $stages, true),
    'has Zirkus Mond'          => in_array('Zirkus Mond', $stages, true),
    'no Zirkus Mond draußen'   => !in_array('Zirkus Mond draußen', $stages, true),
    'no Zirkus Mond drinnen'   => !in_array('Zirkus Mond drinnen', $stages, true),
    'stage count is 13'        => count($stages) === 13,
];

$fail = false;
foreach ($checks as $label => $ok) {
    echo ($ok ? 'PASS' : 'FAIL') . " - $label\n";
    if (!$ok) $fail = true;
}

echo "\n=== Static Method Tests ===\n";

// derive_day must be callable statically (no instantiation)
try {
    $d1 = Festival_PWA_Music::derive_day('2026-08-14T22:30');
    $d2 = Festival_PWA_Music::derive_day('2026-08-15T01:30');
    echo ($d1 === '2026-08-14' ? 'PASS' : 'FAIL') . " - derive_day(22:30) rolls to same day ($d1)\n";
    echo ($d2 === '2026-08-14' ? 'PASS' : 'FAIL') . " - derive_day(01:30) rolls back a day ($d2)\n";
    if ($d1 !== '2026-08-14' || $d2 !== '2026-08-14') $fail = true;
} catch (Throwable $e) {
    echo "FAIL - derive_day() threw: " . $e->getMessage() . "\n";
    $fail = true;
}

echo "\n=== rebuild_json() Static Call Test (Exercises stage_label()) ===\n";

// This is the critical test — rebuild_json() must be callable statically
// and must not have any fatal errors from using $this in a static context.
// The loop now actually executes because get_posts() returns a post and
// get_post_meta() returns values that pass the guard condition.
try {
    $result = Festival_PWA_Music::rebuild_json();

    // Verify return shape
    $isArray = is_array($result);
    echo ($isArray ? 'PASS' : 'FAIL') . " - rebuild_json() returns array\n";

    $hasType = isset($result['type']) && $result['type'] === 'music';
    echo ($hasType ? 'PASS' : 'FAIL') . " - result has type='music'\n";

    $hasSlug = isset($result['slug']) && $result['slug'] === 'music';
    echo ($hasSlug ? 'PASS' : 'FAIL') . " - result has slug='music'\n";

    $hasEvents = is_array($result['events'] ?? null);
    echo ($hasEvents ? 'PASS' : 'FAIL') . " - result has events array\n";

    // Most important: events array should contain the fake post we stubbed
    $eventCount = count($result['events'] ?? []);
    $hasEvent = $eventCount === 1;
    echo ($hasEvent ? 'PASS' : 'FAIL') . " - result has 1 event from stubbed post (count: $eventCount)\n";

    if (!$hasEvent) {
        echo "   (This means the loop body never executed, so stage_label() was never called)\n";
    }

    // Verify the event has stage_label populated (proves stage_label() was called)
    $eventHasStageLabel = isset($result['events'][0]['stage_label']) && !empty($result['events'][0]['stage_label']);
    echo ($eventHasStageLabel ? 'PASS' : 'FAIL') . " - event has stage_label from stage_label() call\n";

    $hasStages = is_array($result['stages'] ?? null) && count($result['stages']) === 13;
    echo ($hasStages ? 'PASS' : 'FAIL') . " - result has 13 stages\n";

    if (!($isArray && $hasType && $hasSlug && $hasEvents && $hasEvent && $eventHasStageLabel && $hasStages)) {
        $fail = true;
    }
} catch (Throwable $e) {
    echo "FAIL - rebuild_json() threw: " . $e->getMessage() . "\n";
    echo "       This indicates a static method context error (e.g., using \$this in a static method)\n";
    $fail = true;
}

echo "\n=== All Tests ===\n";
echo ($fail ? 'FAILED' : 'PASSED') . " (exit code " . ($fail ? '1' : '0') . ")\n";

exit($fail ? 1 : 0);
