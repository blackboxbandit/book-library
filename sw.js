/* ===== Service Worker — Offline Cache ===== */
const CACHE_NAME = 'book-library-v4';
const ASSETS = [
    './',
    './index.html',
    './css/variables.css',
    './css/bookshelf.css',
    './css/cards.css',
    './css/main.css',
    './js/utils.js',
    './js/db.js',
    './js/scanner-ebook.js',
    './js/scanner-audiobook.js',
    './js/books-physical.js',
    './js/wishlist.js',
    './js/library-view.js',
    './js/import-export.js',
    './js/app.js',
    './manifest.json'
];

// Install: cache all app assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ASSETS))
            .then(() => self.skipWaiting())
    );
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
            )
        ).then(() => self.clients.claim())
    );
});

// Fetch: cache-first for app assets, network-first for API/external
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Cache-first for same-origin assets
    if (url.origin === self.location.origin) {
        event.respondWith(
            caches.match(event.request).then(cached => {
                return cached || fetch(event.request).then(response => {
                    // Cache the new response
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    return response;
                });
            }).catch(() => {
                // Fallback to index for navigation requests
                if (event.request.mode === 'navigate') {
                    return caches.match('./index.html');
                }
            })
        );
    } else {
        // Network-first for external requests (e.g. Open Library covers, Google Fonts)
        event.respondWith(
            fetch(event.request).then(response => {
                // Cache external resources too for offline
                const clone = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                return response;
            }).catch(() => caches.match(event.request))
        );
    }
});
