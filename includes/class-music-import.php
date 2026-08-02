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

    public static function parse_csv_file($path) {
        $rows = [];
        $handle = fopen($path, 'r');
        if (!$handle) return $rows;
        $header = fgetcsv($handle);
        if (!$header) { fclose($handle); return $rows; }
        while (($line = fgetcsv($handle)) !== false) {
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
}
