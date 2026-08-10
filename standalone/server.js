#!/usr/bin/env node
// Zero-dependency static file server for the Festival PWA Standalone app.
// Used by `npm start` and as scripts/start.sh's fallback when Python isn't
// available. Keep this dependency-free — the whole app is build-less, and
// requiring `npm install` just to serve static files would defeat that.

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = __dirname;
const PORT = Number(process.env.PORT) || Number(process.argv[2]) || 8767;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.mp4': 'video/mp4',
    // PMTiles archives (a single-file, HTTP-range-served vector tile
    // store). Served with an octet-stream mime; the important part is
    // that this server honours HTTP Range requests — see the request
    // handler below — without which the pmtiles client can't read tiles.
    '.pmtiles': 'application/octet-stream'
};

// Parse a `bytes=start-end` Range header into concrete indices. Returns
// null on missing / malformed header, `{ start, end }` otherwise, with
// `end` clamped to the file size minus one.
//
// KEEP IN SYNC with standalone/sw.js's parseByteRange — the two run in
// different runtimes (Node vs service worker) so they can't share a
// module directly. The SW version deliberately omits suffix-range
// support (`bytes=-N`) because pmtiles.js never emits them; if that
// ever changes, add it there too.
function parseRange(header, fileSize) {
    if (!header) return null;
    const m = /^bytes=(\d*)-(\d*)$/.exec(header);
    if (!m) return null;
    let start = m[1] ? Number(m[1]) : NaN;
    let end = m[2] ? Number(m[2]) : NaN;
    if (Number.isNaN(start) && Number.isNaN(end)) return null;
    if (Number.isNaN(start)) {
        // "-N" means "the last N bytes"
        start = Math.max(0, fileSize - end);
        end = fileSize - 1;
    } else if (Number.isNaN(end)) {
        end = fileSize - 1;
    } else {
        end = Math.min(end, fileSize - 1);
    }
    if (start > end || start >= fileSize) return null;
    return { start, end };
}

function send404(res) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not found');
}

const server = http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('405 Method not allowed');
        return;
    }

    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    // Resolve against ROOT_DIR and confirm the result is still inside it —
    // blocks path-traversal requests like `/../../etc/passwd`.
    const requestedPath = path.join(ROOT_DIR, urlPath === '/' ? 'index.html' : urlPath);
    if (!requestedPath.startsWith(ROOT_DIR)) {
        send404(res);
        return;
    }

    fs.stat(requestedPath, (err, stats) => {
        const filePath = err ? null : (stats.isDirectory() ? path.join(requestedPath, 'index.html') : requestedPath);
        if (!filePath) {
            send404(res);
            return;
        }

        // If the caller sent a Range header, serve a 206 Partial Content
        // via a streamed read from the requested byte offset. Required by
        // pmtiles (data/basemap.pmtiles). For non-range requests we fall
        // through to the original readFile path.
        if (req.headers.range) {
            fs.stat(filePath, (statErr, fileStat) => {
                if (statErr || !fileStat.isFile()) { send404(res); return; }
                const range = parseRange(req.headers.range, fileStat.size);
                if (!range) {
                    res.writeHead(416, {
                        'Content-Range': `bytes */${fileStat.size}`,
                    });
                    res.end();
                    return;
                }
                const ext = path.extname(filePath).toLowerCase();
                res.writeHead(206, {
                    'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
                    'Accept-Ranges': 'bytes',
                    'Content-Range': `bytes ${range.start}-${range.end}/${fileStat.size}`,
                    'Content-Length': range.end - range.start + 1,
                });
                if (req.method === 'HEAD') { res.end(); return; }
                fs.createReadStream(filePath, {
                    start: range.start, end: range.end,
                }).pipe(res);
            });
            return;
        }

        fs.readFile(filePath, (readErr, data) => {
            if (readErr) {
                send404(res);
                return;
            }
            const ext = path.extname(filePath).toLowerCase();
            res.writeHead(200, {
                'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
                'Accept-Ranges': 'bytes',
            });
            res.end(req.method === 'HEAD' ? undefined : data);
        });
    });
});

server.listen(PORT, () => {
    console.log('🎪 Festival PWA Standalone');
    console.log(`   Directory: ${ROOT_DIR}`);
    console.log(`   URL:       http://localhost:${PORT}/`);
    console.log('');
    console.log('   Press Ctrl+C to stop');
});
