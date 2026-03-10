/* ===== IndexedDB Storage Layer ===== */
const DB = (() => {
    const DB_NAME = 'BookLibraryDB';
    const DB_VERSION = 2;
    let _db = null;

    const STORES = {
        EBOOKS: 'ebooks',
        AUDIOBOOKS: 'audiobooks',
        PHYSICAL: 'physical',
        WISHLIST: 'wishlist',
        COVERS: 'covers',
        SETTINGS: 'settings',
        SHELVES: 'shelves'
    };

    /**
     * Open / create the database
     */
    function open() {
        return new Promise((resolve, reject) => {
            if (_db) return resolve(_db);

            const req = indexedDB.open(DB_NAME, DB_VERSION);

            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                const oldVersion = e.oldVersion;

                if (oldVersion < 1) {
                    // Books stores with indexes
                    [STORES.EBOOKS, STORES.AUDIOBOOKS, STORES.PHYSICAL].forEach(name => {
                        if (!db.objectStoreNames.contains(name)) {
                            const store = db.createObjectStore(name, { keyPath: 'id' });
                            store.createIndex('title', 'title', { unique: false });
                            store.createIndex('author', 'author', { unique: false });
                            store.createIndex('matchKey', 'matchKey', { unique: false });
                            store.createIndex('dateAdded', 'dateAdded', { unique: false });
                        }
                    });

                    // Wishlist
                    if (!db.objectStoreNames.contains(STORES.WISHLIST)) {
                        const ws = db.createObjectStore(STORES.WISHLIST, { keyPath: 'id' });
                        ws.createIndex('title', 'title', { unique: false });
                        ws.createIndex('matchKey', 'matchKey', { unique: false });
                    }

                    // Covers (keyed by cover ID)
                    if (!db.objectStoreNames.contains(STORES.COVERS)) {
                        db.createObjectStore(STORES.COVERS, { keyPath: 'id' });
                    }

                    // Settings (key-value)
                    if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
                        db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
                    }
                }

                if (oldVersion < 2) {
                    // v2: Add readingStatus and shelf indexes to book stores
                    [STORES.EBOOKS, STORES.AUDIOBOOKS, STORES.PHYSICAL].forEach(name => {
                        const store = e.target.transaction.objectStore(name);
                        if (!store.indexNames.contains('readingStatus')) {
                            store.createIndex('readingStatus', 'readingStatus', { unique: false });
                        }
                        if (!store.indexNames.contains('shelf')) {
                            store.createIndex('shelf', 'shelf', { unique: false });
                        }
                    });

                    // Shelves store
                    if (!db.objectStoreNames.contains(STORES.SHELVES)) {
                        const ss = db.createObjectStore(STORES.SHELVES, { keyPath: 'id' });
                        ss.createIndex('name', 'name', { unique: true });
                    }
                }
            };

            req.onsuccess = (e) => {
                _db = e.target.result;
                resolve(_db);
            };

            req.onerror = (e) => reject(e.target.error);
        });
    }

    /**
     * Generic transaction helper
     */
    async function tx(storeName, mode, callback) {
        const db = await open();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, mode);
            const store = transaction.objectStore(storeName);
            const result = callback(store);
            transaction.oncomplete = () => resolve(result._result || result);
            transaction.onerror = (e) => reject(e.target.error);
        });
    }

    /**
     * Get all records from a store
     */
    async function getAll(storeName) {
        const db = await open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readonly');
            const req = tx.objectStore(storeName).getAll();
            req.onsuccess = () => resolve(req.result);
            req.onerror = (e) => reject(e.target.error);
        });
    }

    /**
     * Get a single record by ID
     */
    async function getById(storeName, id) {
        const db = await open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readonly');
            const req = tx.objectStore(storeName).get(id);
            req.onsuccess = () => resolve(req.result);
            req.onerror = (e) => reject(e.target.error);
        });
    }

    /**
     * Put (add or update) a record
     */
    async function put(storeName, record) {
        const db = await open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            tx.objectStore(storeName).put(record);
            tx.oncomplete = () => resolve(record);
            tx.onerror = (e) => reject(e.target.error);
        });
    }

    /**
     * Add multiple records in a single transaction
     */
    async function putMany(storeName, records) {
        const db = await open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            records.forEach(r => store.put(r));
            tx.oncomplete = () => resolve(records.length);
            tx.onerror = (e) => reject(e.target.error);
        });
    }

    /**
     * Delete a record by ID
     */
    async function remove(storeName, id) {
        const db = await open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            tx.objectStore(storeName).delete(id);
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
        });
    }

    /**
     * Clear all records from a store
     */
    async function clearStore(storeName) {
        const db = await open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            tx.objectStore(storeName).clear();
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
        });
    }

    /**
     * Get the count of a store
     */
    async function count(storeName) {
        const db = await open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readonly');
            const req = tx.objectStore(storeName).count();
            req.onsuccess = () => resolve(req.result);
            req.onerror = (e) => reject(e.target.error);
        });
    }

    /**
     * Save a cover image
     */
    async function saveCover(coverId, dataURL) {
        return put(STORES.COVERS, { id: coverId, data: dataURL });
    }

    /**
     * Get a cover image
     */
    async function getCover(coverId) {
        const record = await getById(STORES.COVERS, coverId);
        return record ? record.data : null;
    }

    /**
     * Export all data as a plain object
     */
    async function exportAll() {
        const data = {};
        for (const name of Object.values(STORES)) {
            data[name] = await getAll(name);
        }
        return data;
    }

    /**
     * Import data (merge or replace)
     */
    async function importAll(data, replace = false) {
        for (const name of Object.values(STORES)) {
            if (data[name] && Array.isArray(data[name])) {
                if (replace) await clearStore(name);
                await putMany(name, data[name]);
            }
        }
    }

    /**
     * Get existing match keys for deduplication
     */
    async function getMatchKeys(storeName) {
        const all = await getAll(storeName);
        return new Set(all.map(b => Utils.matchKey(b.title, b.author)).filter(Boolean));
    }

    /**
     * Save a setting
     */
    async function setSetting(key, value) {
        return put(STORES.SETTINGS, { key, value });
    }

    /**
     * Get a setting
     */
    async function getSetting(key) {
        const record = await getById(STORES.SETTINGS, key);
        return record ? record.value : null;
    }

    return {
        STORES, open, getAll, getById, put, putMany, remove,
        clearStore, count, saveCover, getCover,
        exportAll, importAll, getMatchKeys,
        setSetting, getSetting
    };
})();
