#!/usr/bin/env bash
# Festival PWA Standalone — Content Updater v2
# Comprehensive logging, trace IDs, and detailed error reporting.
#
# Usage:
#   ./scripts/update.sh --rest    https://host-site.com/wp-json/festival/v1
#   ./scripts/update.sh --source  https://bucht-der-traeumer.de

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DATA_DIR="$ROOT_DIR/data"
SCRIPTS_DIR="$SCRIPT_DIR"
LOG_DIR="$ROOT_DIR/.log"
mkdir -p "$LOG_DIR"

# ── Logging ──
TRACE_ID="$(date +%s)-$(printf '%04x' $RANDOM)"
LOG_FILE="$LOG_DIR/update-${TRACE_ID}.log"
ERR_FILE="$LOG_DIR/update-${TRACE_ID}-errors.log"
SUMMARY_FILE="$LOG_DIR/update-${TRACE_ID}-summary.json"
TMP_PAGES="$LOG_DIR/.pages-${TRACE_ID}.json"

exec 5>>"$LOG_FILE"   # FD 5 = full trace
exec 6>>"$ERR_FILE"   # FD 6 = errors only

log() {
    local level="$1" msg="$2"
    local ts="$(date -Iseconds)"
    echo "[$ts] [$TRACE_ID] [$level] $msg" >&5
}
info()  { log INFO "$1"; }
warn()  { log WARN "$1"; echo "   ⚠️  $1" >&2; }
error() { log ERROR "$1"; echo "   ❌ $1" >&2; echo "[$TRACE_ID] $1" >&6; }
ok()    { log OK "$1"; }

# ── Arg parsing ──
MODE=""
URL=""
while [[ $# -gt 0 ]]; do
    case $1 in
        --rest)   MODE="rest";   URL="$2"; shift 2 ;;
        --source) MODE="source"; URL="$2"; shift 2 ;;
        *)        URL="$1"; shift ;;
    esac
done

# ── Read standalone.json config ──
if [ -f "$ROOT_DIR/standalone.json" ]; then
    CONFIG=$(python3 -c "
import json
try:
    with open('$ROOT_DIR/standalone.json') as f:
        d=json.load(f)
        print('API_URL='+repr(d.get('api_url','')))
        print('SOURCE_URL='+repr(d.get('source_url','')))
except: pass
" 2>/dev/null || true)
    eval "$CONFIG" 2>/dev/null || true
fi

# Auto-detect mode
if [ -z "$MODE" ] && [ -n "$URL" ]; then
    if echo "$URL" | grep -q '/wp-json/'; then MODE="rest"; else MODE="source"; fi
fi
if [ -z "$URL" ] && [ -n "$API_URL" ];    then MODE="rest";   URL="$API_URL"; fi
if [ -z "$URL" ] && [ -n "$SOURCE_URL" ]; then MODE="source"; URL="$SOURCE_URL"; fi

if [ -z "$MODE" ] || [ -z "$URL" ]; then
    echo "🔄 Festival PWA Standalone — Content Updater"
    echo ""
    echo "Usage:"
    echo "   ./scripts/update.sh --rest    https://host-site.com/wp-json/festival/v1"
    echo "   ./scripts/update.sh --source  https://bucht-der-traeumer.de"
    echo ""
    echo "Or set in standalone.json:"
    echo "   { \"api_url\": \"...\", \"source_url\": \"...\" }"
    exit 1
fi

URL="${URL%/}"

# ── Header ──
echo "🔄 Festival PWA Standalone — Content Updater"
echo "   Trace ID: $TRACE_ID"
echo "   Mode:     $MODE"
echo "   URL:      $URL"
echo "   Target:   $DATA_DIR"
echo "   Log:      .log/update-${TRACE_ID}.log"
echo ""

info "Starting update — Trace: $TRACE_ID, Mode: $MODE, URL: $URL"

# ── Dep check ──
for cmd in curl python3; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
        error "Required command '$cmd' not found in PATH"
        exit 1
    fi
done
info "Dependencies OK: curl ✅, python3 ✅"

# ═══════════════════════════════════════════════════════════════════
# REST API MODE
# ═══════════════════════════════════════════════════════════════════
if [ "$MODE" = "rest" ]; then
    echo "📋 Fetching manifest from REST API..."
    MANIFEST_URL="$URL/manifest"
    MANIFEST_TMP="$DATA_DIR/_manifest.json.tmp"
    
    HTTP_CODE=$(curl -sfL -o "$MANIFEST_TMP" -w "%{http_code}" "$MANIFEST_URL" 2>/dev/null; echo "")
    HTTP_CODE=$(echo "$HTTP_CODE" | tail -c 4 | head -c 3)
    if [ ! -f "$MANIFEST_TMP" ]; then HTTP_CODE="000"; fi
    
    if [ "$HTTP_CODE" = "200" ]; then
        ok "Manifest fetched (HTTP 200)"
        echo "   ✅ Manifest fetched"
    else
        error "Manifest fetch failed — HTTP $HTTP_CODE"
        error "URL: $MANIFEST_URL"
        error "Possible causes:"
        error "  • The Festival PWA plugin is not installed on this site."
        error "  • The REST endpoint /wp-json/festival/v1 does not exist."
        error "Try: ./scripts/update.sh --source $URL"
        rm -f "$MANIFEST_TMP"
        echo ""
        echo "❌ Failed to fetch manifest (HTTP $HTTP_CODE)"
        echo ""
        echo "   The REST API doesn't exist here. If the source WordPress site"
        echo "   doesn't have the Festival PWA plugin installed, use --source:"
        echo ""
        echo "      ./scripts/update.sh --source $URL"
        echo ""
        echo "   Full log: .log/update-${TRACE_ID}.log"
        exit 1
    fi
    
    PAGES=$(python3 -c "
import json
with open('$MANIFEST_TMP') as f:
    d = json.load(f)
    for p in d.get('pages',[]):
        s = p.get('slug','')
        if s and s not in ('home','favorites'):
            print(s)
")
    
    echo "📄 Fetching page content..."
    for slug in $PAGES; do
        PAGE_URL="$URL/pages/$slug"
        DEST="$DATA_DIR/${slug}.json"
        HTTP_CODE=$(curl -sfL -o "$DEST" -w "%{http_code}" "$PAGE_URL" 2>/dev/null; echo "")
        HTTP_CODE=$(echo "$HTTP_CODE" | tail -c 4 | head -c 3)
        if [ ! -f "$DEST" ]; then HTTP_CODE="000"; SIZE=0; else SIZE=$(wc -c < "$DEST" 2>/dev/null || echo 0); fi
        
        if [ "$HTTP_CODE" = "200" ]; then
            ok "$slug fetched ($SIZE bytes)"
            echo "   ✅ $slug"
            echo "{\"slug\":\"$slug\",\"status\":\"success\",\"detail\":\"HTTP 200\",\"http_code\":\"$HTTP_CODE\",\"bytes\":$SIZE}" >> "$TMP_PAGES"
        else
            error "$slug failed — HTTP $HTTP_CODE ($SIZE bytes)"
            echo "   ❌ $slug (HTTP $HTTP_CODE)"
            [ -f "$DEST" ] && rm -f "$DEST"
            echo "{\"slug\":\"$slug\",\"status\":\"failed\",\"detail\":\"HTTP $HTTP_CODE\",\"http_code\":\"$HTTP_CODE\",\"bytes\":$SIZE}" >> "$TMP_PAGES"
        fi
    done
    mv "$MANIFEST_TMP" "$DATA_DIR/_manifest.json"

# ═══════════════════════════════════════════════════════════════════
# HTML SOURCE SCRAPE MODE
# ═══════════════════════════════════════════════════════════════════
else
    echo "📄 Scraping HTML pages directly from source..."
    echo ""

    # One pass per language — both DE and EN scrape everything the app
    # needs (timetable sources + cashless/faqs/news), then _build_info.py
    # merges cashless/faqs/news into that language's info.json.
    run_scrape_pass() {
        local pass_url="$1" pass_dir="$2" pass_lang="$3"
        shift 3
        local pass_pages="$*"

        mkdir -p "$pass_dir"
        rm -f "$pass_dir"/_manifest.json "$pass_dir"/timetable.json

        info "[$pass_lang] Expected pages: $pass_pages"

        for slug in $pass_pages; do
            PAGE_URL="$pass_url/$slug/"
            DEST="$pass_dir/${slug}.json"
            TMP="$pass_dir/_tmp_${slug}.html"

            echo "   [$pass_lang] Fetching /$slug/ ..."
            info "[$pass_lang] Fetching /$slug/ from $PAGE_URL"

            HTTP_CODE=$(curl -sfL -o "$TMP" -w "%{http_code}" "$PAGE_URL" 2>/dev/null; echo "") || true
            HTTP_CODE=$(echo "$HTTP_CODE" | tail -c 4 | head -c 3)
            if [ ! -f "$TMP" ]; then SIZE=0; else SIZE=$(wc -c < "$TMP" 2>/dev/null || echo 0); fi

            if [ "$HTTP_CODE" = "200" ] && [ "$SIZE" -gt 100 ]; then
                info "[$pass_lang] /$slug/ fetched ($SIZE bytes, HTTP 200)"

                if [ "$slug" = "cashless" ] || [ "$slug" = "faqs" ]; then
                    info "[$pass_lang] Using FAQ extractor for $slug"
                    if python3 "$SCRIPTS_DIR/_extract_faq.py" "$PAGE_URL" "$DEST" >> "$LOG_FILE" 2>&1; then
                        DEST_SIZE=$(wc -c < "$DEST" 2>/dev/null || echo 0)
                        ok "[$pass_lang] /$slug/ FAQ extracted ($DEST_SIZE bytes)"
                        echo "      ✅ FAQ extracted ($DEST_SIZE bytes)"
                        echo "{\"slug\":\"$pass_lang/$slug\",\"status\":\"success\",\"detail\":\"FAQ extracted\",\"http_code\":\"$HTTP_CODE\",\"bytes\":$DEST_SIZE}" >> "$TMP_PAGES"
                    else
                        error "[$pass_lang] /$slug/ FAQ extraction failed (see log)"
                        echo "      ❌ FAQ extraction failed"
                        echo "{\"slug\":\"$pass_lang/$slug\",\"status\":\"failed\",\"detail\":\"FAQ extraction failed\",\"http_code\":\"$HTTP_CODE\",\"bytes\":$SIZE}" >> "$TMP_PAGES"
                    fi
                elif [ "$slug" = "news" ]; then
                    info "[$pass_lang] Using News extractor for $slug"
                    if python3 "$SCRIPTS_DIR/_extract_news.py" "$PAGE_URL" "$DEST" >> "$LOG_FILE" 2>&1; then
                        DEST_SIZE=$(wc -c < "$DEST" 2>/dev/null || echo 0)
                        ok "[$pass_lang] /$slug/ news extracted ($DEST_SIZE bytes)"
                        echo "      ✅ News extracted ($DEST_SIZE bytes)"
                        echo "{\"slug\":\"$pass_lang/$slug\",\"status\":\"success\",\"detail\":\"News extracted\",\"http_code\":\"$HTTP_CODE\",\"bytes\":$DEST_SIZE}" >> "$TMP_PAGES"
                    else
                        error "[$pass_lang] /$slug/ news extraction failed (see log)"
                        echo "      ❌ News extraction failed"
                        echo "{\"slug\":\"$pass_lang/$slug\",\"status\":\"failed\",\"detail\":\"News extraction failed\",\"http_code\":\"$HTTP_CODE\",\"bytes\":$SIZE}" >> "$TMP_PAGES"
                    fi
                elif [ "$slug" = "programm-2026" ]; then
                    info "[$pass_lang] Using Program extractor for $slug"
                    if python3 "$SCRIPTS_DIR/_extract_program.py" "$PAGE_URL" "$DEST" "$pass_lang" >> "$LOG_FILE" 2>&1; then
                        DEST_SIZE=$(wc -c < "$DEST" 2>/dev/null || echo 0)
                        ok "[$pass_lang] /$slug/ program extracted ($DEST_SIZE bytes)"
                        echo "      ✅ Program extracted ($DEST_SIZE bytes)"
                        echo "{\"slug\":\"$pass_lang/$slug\",\"status\":\"success\",\"detail\":\"Program extracted\",\"http_code\":\"$HTTP_CODE\",\"bytes\":$DEST_SIZE}" >> "$TMP_PAGES"
                    else
                        error "[$pass_lang] /$slug/ program extraction failed (see log)"
                        echo "      ❌ Program extraction failed"
                        echo "{\"slug\":\"$pass_lang/$slug\",\"status\":\"failed\",\"detail\":\"Program extraction failed\",\"http_code\":\"$HTTP_CODE\",\"bytes\":$SIZE}" >> "$TMP_PAGES"
                    fi
                else
                    info "[$pass_lang] Using Grid extractor for $slug"
                    if python3 "$SCRIPTS_DIR/_extract_grid.py" "$PAGE_URL" "$DEST" "$slug" >> "$LOG_FILE" 2>&1; then
                        DEST_SIZE=$(wc -c < "$DEST" 2>/dev/null || echo 0)
                        ok "[$pass_lang] /$slug/ grid extracted ($DEST_SIZE bytes)"
                        echo "      ✅ Grid extracted ($DEST_SIZE bytes)"
                        echo "{\"slug\":\"$pass_lang/$slug\",\"status\":\"success\",\"detail\":\"Grid extracted\",\"http_code\":\"$HTTP_CODE\",\"bytes\":$DEST_SIZE}" >> "$TMP_PAGES"
                    else
                        error "[$pass_lang] /$slug/ grid extraction failed (see log)"
                        echo "      ❌ Grid extraction failed"
                        echo "{\"slug\":\"$pass_lang/$slug\",\"status\":\"failed\",\"detail\":\"Grid extraction failed\",\"http_code\":\"$HTTP_CODE\",\"bytes\":$SIZE}" >> "$TMP_PAGES"
                    fi
                fi
                rm -f "$TMP"
            else
                error "[$pass_lang] /$slug/ fetch failed — HTTP $HTTP_CODE, $SIZE bytes"

                if [ "$HTTP_CODE" = "000" ]; then
                    error "  → Network error (DNS or connection refused)"
                elif [ "$HTTP_CODE" = "404" ]; then
                    error "  → Page not found — check if /$slug/ exists on $pass_url"
                elif [ "$HTTP_CODE" = "403" ]; then
                    error "  → Access forbidden — the site may block curl"
                elif [ "$SIZE" -le 100 ]; then
                    error "  → Response body empty — may be a redirect or error page"
                fi

                echo "      ❌ Failed to fetch /$slug/ (HTTP $HTTP_CODE, $SIZE bytes)"
                rm -f "$TMP"
                echo "{\"slug\":\"$pass_lang/$slug\",\"status\":\"failed\",\"detail\":\"HTTP $HTTP_CODE\",\"http_code\":\"$HTTP_CODE\",\"bytes\":$SIZE}" >> "$TMP_PAGES"
            fi
        done

        info "[$pass_lang] Building unified timetable"
        if python3 "$SCRIPTS_DIR/_build_timetable.py" "$pass_dir" "$pass_lang" >> "$LOG_FILE" 2>&1; then
            ok "[$pass_lang] Timetable built"
            echo "      ✅ [$pass_lang] Timetable built"
        else
            warn "[$pass_lang] Timetable build had issues"
            echo "      ⚠️ [$pass_lang] Timetable build had issues"
        fi

        info "[$pass_lang] Building merged info.json"
        if python3 "$SCRIPTS_DIR/_build_info.py" "$pass_dir" >> "$LOG_FILE" 2>&1; then
            ok "[$pass_lang] info.json built"
            echo "      ✅ [$pass_lang] info.json built"
        else
            warn "[$pass_lang] info.json build had issues"
            echo "      ⚠️ [$pass_lang] info.json build had issues"
        fi
    }

    run_scrape_pass "$URL" "$DATA_DIR" "de" cashless faqs news programm-2026 performances workshops
    run_scrape_pass "$URL/en" "$DATA_DIR/en" "en" cashless faqs news programm-2026 performances workshops

    info "Regenerating manifest"
    python3 "$SCRIPTS_DIR/_update_manifest.py" "$DATA_DIR" "Bucht der Träumer" >> "$LOG_FILE" 2>&1 || warn "Manifest regeneration had issues"
fi

# ═══════════════════════════════════════════════════════════════════
# METADATA + CACHE BUST
# ═══════════════════════════════════════════════════════════════════
info "Updating standalone.json"
python3 -c "
import json, os, datetime
path = '$ROOT_DIR/standalone.json'
if os.path.exists(path):
    with open(path) as f: d = json.load(f)
else: d = {}
d['last_synced'] = datetime.datetime.now().isoformat()
if '$MODE' == 'rest': d['api_url'] = '$URL'
else: d['source_url'] = '$URL'
with open(path, 'w') as f:
    json.dump(d, f, indent=2)
    f.write('\n')
" >> "$LOG_FILE" 2>&1

info "Busting Service Worker cache"
echo "🔁 Busting Service Worker cache..."
SW_FILE="$ROOT_DIR/sw.js"
if [ -f "$SW_FILE" ]; then
    NEW_VERSION="$(date +%s)"
    sed -i.bak "s/const CACHE_VERSION = '[^']*'/const CACHE_VERSION = '$NEW_VERSION'/" "$SW_FILE"
    rm -f "$SW_FILE.bak"
    ok "Cache version bumped to $NEW_VERSION"
    echo "   ✅ Cache version bumped to $NEW_VERSION"
else
    warn "sw.js not found"
    echo "   ⚠️  sw.js not found"
fi

# ═══════════════════════════════════════════════════════════════════
# WRITE SUMMARY JSON
# ═══════════════════════════════════════════════════════════════════
python3 -c "
import json, os

pages = []
if os.path.exists('$TMP_PAGES'):
    with open('$TMP_PAGES') as f:
        for line in f:
            line = line.strip()
            if line:
                try: pages.append(json.loads(line))
                except json.JSONDecodeError: pass
    os.remove('$TMP_PAGES')

success = sum(1 for p in pages if p.get('status') == 'success')
failed  = sum(1 for p in pages if p.get('status') == 'failed')

summary = {
    'trace_id': '$TRACE_ID',
    'mode': '$MODE',
    'url': '$URL',
    'timestamp': '$(date -Iseconds)',
    'total_pages': len(pages),
    'success': success,
    'failed': failed,
    'pages': pages,
    'log_file': '.log/update-${TRACE_ID}.log',
    'error_file': '.log/update-${TRACE_ID}-errors.log'
}
with open('$SUMMARY_FILE', 'w') as f:
    json.dump(summary, f, indent=2)
    f.write('\n')
" >> "$LOG_FILE" 2>&1

# ═══════════════════════════════════════════════════════════════════
# FINAL REPORT
# ═══════════════════════════════════════════════════════════════════
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  UPDATE COMPLETE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
printf "  %-20s %s\n" "Trace ID:"     "$TRACE_ID"
printf "  %-20s %s\n" "Mode:"         "$MODE"
printf "  %-20s %s\n" "URL:"          "$URL"
printf "  %-20s %s\n" "Total pages:"  "$(grep -c 'status' "$SUMMARY_FILE" 2>/dev/null || echo '—' )"
printf "  %-20s %s\n" "Success:"      "$(python3 -c "import json; d=json.load(open('$SUMMARY_FILE')); print(d['success'],'✅')" 2>/dev/null || echo '—')"
printf "  %-20s %s\n" "Failed:"       "$(python3 -c "import json; d=json.load(open('$SUMMARY_FILE')); print(d['failed'])" 2>/dev/null || echo '—')"
echo ""

# Show failed pages
python3 -c "
import json
try:
    with open('$SUMMARY_FILE') as f: d = json.load(f)
    failed = [p for p in d.get('pages',[]) if p.get('status') == 'failed']
    if failed:
        print('  Failed pages:')
        for p in failed:
            print(f\"    • /{p['slug']}/ — {p['detail']}\")
            if p.get('http_code') == '404':
                print('      → Page does not exist. Check if slug is correct.')
            elif p.get('http_code') == '000':
                print('      → Network error. Check internet connection.')
            elif p.get('detail') == 'FAQ extraction failed':
                print('      → Parser failed. Check .log/update-${TRACE_ID}.log')
            elif p.get('detail') == 'HTML parsing failed':
                print('      → Parser failed. Check .log/update-${TRACE_ID}.log')
        print()
except: pass
"

echo "  Full log:     .log/update-${TRACE_ID}.log"
echo "  Summary:      .log/update-${TRACE_ID}-summary.json"
echo ""
echo "  Next steps:"
echo "      1. Review any failed pages above"
echo "      2. Test locally:   ./scripts/start.sh"
echo "      3. Deploy:         ./scripts/deploy.sh"
echo ""
