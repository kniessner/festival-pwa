#!/usr/bin/env bash
# Start the Festival PWA Standalone server
# Usage: ./scripts/start.sh [port] [--open]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PORT="${1:-8767}"
OPEN=false

# Parse args
for arg in "$@"; do
    if [ "$arg" = "--open" ] || [ "$arg" = "-o" ]; then
        OPEN=true
    fi
done

echo "🎪 Festival PWA Standalone"
echo "   Directory: $ROOT_DIR"
echo "   Port:      $PORT"
echo "   URL:       http://localhost:$PORT/"
echo ""
echo "   Press Ctrl+C to stop"
echo ""

if [ "$OPEN" = true ]; then
    (
        sleep 1.5
        if command -v open >/devdev/null 2>&1; then
            open "http://localhost:$PORT/"
        elif command -v xdg-open >/dev/null 2>&1; then
            xdg-open "http://localhost:$PORT/"
        elif command -v python3 >/dev/null 2>&1; then
            python3 -c "import webbrowser; webbrowser.open('http://localhost:$PORT/')"
        fi
    ) &
fi

# Prefer Python for simple serving
if command -v python3 >/dev/null 2>&1; then
    cd "$ROOT_DIR" && python3 -m http.server "$PORT"
elif command -v python >/dev/null 2>&1; then
    cd "$ROOT_DIR" && python -m SimpleHTTPServer "$PORT"
elif command -v node >/dev/null 2>&1; then
    cd "$ROOT_DIR" && node -e "
        const http = require('http');
        const fs = require('fs');
        const path = require('path');
        const port = $PORT;
        const mime = {
            '.html': 'text/html', '.js': 'application/javascript',
            '.css': 'text/css', '.json': 'application/json',
            '.png': 'image/png', '.jpg': 'image/jpeg',
            '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
        };
        http.createServer((req, res) => {
            let file = path.join(process.cwd(), req.url === '/' ? 'index.html' : req.url);
            if (fs.existsSync(file) && fs.statSync(file).isFile()) {
                const ext = path.extname(file);
                res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' });
                fs.createReadStream(file).pipe(res);
            } else {
                res.writeHead(404); res.end('Not found');
            }
        }).listen(port, () => console.log('Server running on http://localhost:' + port));
    "
else
    echo "❌ No Python or Node found. Cannot start server."
    exit 1
fi
