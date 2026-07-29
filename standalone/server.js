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
    '.mp4': 'video/mp4'
};

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
        fs.readFile(filePath, (readErr, data) => {
            if (readErr) {
                send404(res);
                return;
            }
            const ext = path.extname(filePath).toLowerCase();
            res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
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
