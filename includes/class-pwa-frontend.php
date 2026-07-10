<?php
class Festival_PWA_Frontend {
    public static function serve() {
        // Use only the path component — REQUEST_URI also carries the query
        // string (and could be URL-encoded), neither of which belongs in a
        // filesystem path.
        $path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
        if ($path === false || $path === null) {
            return;
        }
        $path = rawurldecode($path);

        // Only handle /pwa/ paths
        if (strpos($path, '/pwa/') !== 0 && $path !== '/pwa') {
            return;
        }

        // Prevent WordPress from serving 404
        remove_all_actions('template_redirect');

        // Strip the leading "/pwa" prefix specifically (not every occurrence).
        $requested = ltrim(substr($path, strlen('/pwa')), '/');

        // Reject any traversal or null-byte tokens outright.
        if ($requested !== '' &&
            (strpos($requested, '..') !== false || strpos($requested, "\0") !== false)) {
            self::serve_index();
        }

        $baseDir = realpath(FESTIVAL_PWA_DIR . 'pwa');
        if ($baseDir === false) {
            status_header(500);
            exit;
        }

        // Only serve known-good, static asset types. Unknown/empty extensions
        // (e.g. .php) fall through to the SPA index rather than being dumped.
        $mimes = [
            'css'  => 'text/css',
            'js'   => 'application/javascript',
            'json' => 'application/json',
            'png'  => 'image/png',
            'jpg'  => 'image/jpeg',
            'jpeg' => 'image/jpeg',
            'svg'  => 'image/svg+xml',
            'webp' => 'image/webp',
            'ico'  => 'image/x-icon',
            'html' => 'text/html',
            'txt'  => 'text/plain',
            'woff' => 'font/woff',
            'woff2' => 'font/woff2',
            'webmanifest' => 'application/manifest+json',
        ];

        if ($requested !== '') {
            $file = realpath($baseDir . '/' . $requested);
            $ext  = strtolower(pathinfo($requested, PATHINFO_EXTENSION));

            // Resolved path must stay inside the pwa directory, be a readable
            // regular file, and carry an allowlisted extension.
            $withinBase = $file !== false &&
                strncmp($file, $baseDir . DIRECTORY_SEPARATOR, strlen($baseDir) + 1) === 0;

            if ($withinBase && is_file($file) && is_readable($file) && isset($mimes[$ext])) {
                header('Content-Type: ' . $mimes[$ext]);
                readfile($file);
                exit;
            }
        }

        // SPA fallback: serve index.html for any other /pwa/ path.
        self::serve_index();
    }

    private static function serve_index() {
        $index = realpath(FESTIVAL_PWA_DIR . 'pwa/index.html');
        $baseDir = realpath(FESTIVAL_PWA_DIR . 'pwa');
        if ($index === false || $baseDir === false ||
            strncmp($index, $baseDir . DIRECTORY_SEPARATOR, strlen($baseDir) + 1) !== 0) {
            status_header(404);
            exit;
        }
        header('Content-Type: text/html');
        readfile($index);
        exit;
    }
}
