const DB_NAME = 'FestivalPWA';
const DB_VERSION = 1;

function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('events')) db.createObjectStore('events', { keyPath: 'id' });
            if (!db.objectStoreNames.contains('saved')) db.createObjectStore('saved', { keyPath: 'id' });
        };
    });
}

async function toggleSaved(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('saved', 'readwrite');
        const store = tx.objectStore('saved');
        const getReq = store.get(id);
        getReq.onsuccess = () => {
            if (getReq.result) { store.delete(id); resolve(false); }
            else { store.put({ id, savedAt: Date.now() }); resolve(true); }
        };
        getReq.onerror = () => reject(getReq.error);
    });
}

async function getSavedIds() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('saved', 'readonly');
        const req = tx.objectStore('saved').getAll();
        req.onsuccess = () => resolve(req.result.map(s => s.id));
        req.onerror = () => reject(req.error);
    });
}
