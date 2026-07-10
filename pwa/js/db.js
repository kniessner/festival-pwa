const DB_NAME = 'FestivalPWA';
const DB_VERSION = 1;

function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('events')) {
                db.createObjectStore('events', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('saved')) {
                db.createObjectStore('saved', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('meta')) {
                db.createObjectStore('meta', { keyPath: 'key' });
            }
        };
    });
}

export async function saveEvents(events) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('events', 'readwrite');
        const store = tx.objectStore('events');
        for (const ev of events) store.put(ev);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

export async function getEvents() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('events', 'readonly');
        const req = tx.objectStore('events').getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

export async function toggleSaved(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('saved', 'readwrite');
        const store = tx.objectStore('saved');
        const getReq = store.get(id);
        getReq.onsuccess = () => {
            if (getReq.result) {
                store.delete(id);
                resolve(false);
            } else {
                store.put({ id, savedAt: Date.now() });
                resolve(true);
            }
        };
        getReq.onerror = () => reject(getReq.error);
    });
}

export async function getSavedIds() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('saved', 'readonly');
        const req = tx.objectStore('saved').getAll();
        req.onsuccess = () => resolve(req.result.map(s => s.id));
        req.onerror = () => reject(req.error);
    });
}

export async function saveMeta(key, value) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('meta', 'readwrite');
        tx.objectStore('meta').put({ key, value, updated: Date.now() });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

export async function getMeta(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('meta', 'readonly');
        const req = tx.objectStore('meta').get(key);
        req.onsuccess = () => resolve(req.result?.value ?? null);
        req.onerror = () => reject(req.error);
    });
}
