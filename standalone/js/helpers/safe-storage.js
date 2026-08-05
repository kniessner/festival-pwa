/**
 * Safe wrappers around localStorage.getItem / setItem that swallow the
 * cases the App-store platform occasionally throws:
 *   - Safari private-browsing mode (some builds throw on write)
 *   - Quota exceeded
 *   - localStorage entirely absent (older browsers, some tests)
 *
 * Every callsite previously reimplemented this with try/catch — 4
 * modules did, one didn't. Centralising ensures consistency (all reads
 * return `fallback` on failure; all writes are best-effort no-op).
 *
 * @param key      localStorage key.
 * @param fallback Value to return if read fails or key isn't present.
 * @returns The stored raw string, or `fallback`.
 */
export function safeGet(key, fallback = null) {
    try {
        const v = localStorage.getItem(key);
        return v == null ? fallback : v;
    } catch {
        return fallback;
    }
}

/**
 * Same-shape safe getter that parses stored JSON. Convenience for the
 * common `try { return JSON.parse(localStorage.getItem(K)) || fallback }
 * catch { return fallback }` pattern.
 *
 * @returns Parsed JSON (any) or `fallback` on missing / parse error / read error.
 */
export function safeGetJSON(key, fallback = null) {
    try {
        const raw = localStorage.getItem(key);
        if (raw == null) return fallback;
        const parsed = JSON.parse(raw);
        return parsed == null ? fallback : parsed;
    } catch {
        return fallback;
    }
}

/**
 * Safe setter. Best-effort: writes the given value coerced to string.
 * Silently returns false on failure (private-mode, quota, no
 * localStorage), true on success.
 *
 * @returns Whether the write succeeded.
 */
export function safeSet(key, value) {
    try {
        localStorage.setItem(key, String(value));
        return true;
    } catch {
        return false;
    }
}

/**
 * JSON-serializing safe setter. Value is `JSON.stringify`'d before
 * write.
 *
 * @returns Whether the write succeeded (false on serialise or write
 *          failure).
 */
export function safeSetJSON(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch {
        return false;
    }
}
