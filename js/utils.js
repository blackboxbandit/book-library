/* ===== Utility Functions ===== */
const Utils = (() => {
    /**
     * Generate a simple unique ID
     */
    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
    }

    function normalise(str) {
        if (!str) return '';
        return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    }

    /**
     * Create a match key from title + author for deduplication
     */
    function matchKey(title, author) {
        if (!title) title = '';
        if (!author) author = '';

        // 1. Clean Title
        let t = title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

        // Remove text in parentheses or brackets (often contains formats, series, narrator info)
        t = t.replace(/\([^)]*\)/g, '').replace(/\[[^\]]*\]/g, '');

        // Remove subtitles (everything after a colon or hyphen)
        const subtitleMatch = t.match(/^([^:-]+)/);
        if (subtitleMatch) {
            t = subtitleMatch[1];
        }

        // Handle 'The', 'A', 'An' at the end (e.g. "Martian, The")
        t = t.replace(/,\s*(the|a|an)\s*$/i, '');

        // Remove leading 'The', 'A', 'An'
        t = t.replace(/^(the|a|an)\s+/i, '');

        // Remove all non-alphanumeric characters
        t = t.replace(/[^a-z0-9]/g, '');

        // 2. Clean Author
        let a = author.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

        // Replace periods with spaces to handle initials consistently (J.K. -> J K)
        a = a.replace(/\./g, ' ');

        let aParts = a.split(/[\s,]+/).filter(Boolean);
        aParts.sort();
        a = aParts.join('').replace(/[^a-z0-9]/g, '');

        return t + '|||' + a;
    }

    /**
     * Debounce a function
     */
    function debounce(fn, delay = 300) {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => fn(...args), delay);
        };
    }

    /**
     * Show a toast notification
     */
    function toast(message, type = 'info', duration = 3000) {
        const container = document.getElementById('toast-container');
        const el = document.createElement('div');
        el.className = `toast toast-${type}`;
        el.textContent = message;
        container.appendChild(el);
        setTimeout(() => {
            el.classList.add('toast-exit');
            el.addEventListener('animationend', () => el.remove());
        }, duration);
    }

    /**
     * Read a File as ArrayBuffer
     */
    function readFileAsArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result);
            r.onerror = reject;
            r.readAsArrayBuffer(file);
        });
    }

    /**
     * Read a File as text
     */
    function readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result);
            r.onerror = reject;
            r.readAsText(file);
        });
    }

    /**
     * Read a File as data URL (base64)
     */
    function readFileAsDataURL(file) {
        return new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result);
            r.onerror = reject;
            r.readAsDataURL(file);
        });
    }

    /**
     * Compress an image file to a reasonable size for storage
     * Returns a data URL string
     */
    async function compressImage(file, maxWidth = 300, quality = 0.8) {
        return new Promise((resolve) => {
            const img = new Image();
            const url = URL.createObjectURL(file);
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let w = img.width, h = img.height;
                if (w > maxWidth) {
                    h = (maxWidth / w) * h;
                    w = maxWidth;
                }
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                // Fill with white background to prevent transparency = black
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, w, h);
                ctx.drawImage(img, 0, 0, w, h);
                URL.revokeObjectURL(url);
                // Detect source type — use PNG for PNGs to preserve color, JPEG for photos
                const mimeType = (file.type === 'image/png' || file.type === 'image/webp')
                    ? 'image/png' : 'image/jpeg';
                resolve(canvas.toDataURL(mimeType, quality));
            };
            img.onerror = () => {
                URL.revokeObjectURL(url);
                resolve(null);
            };
            img.src = url;
        });
    }

    /**
     * Compress an image from a data URL
     */
    async function compressDataURL(dataURL, maxWidth = 300, quality = 0.8) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let w = img.width, h = img.height;
                if (w > maxWidth) {
                    h = (maxWidth / w) * h;
                    w = maxWidth;
                }
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                // Fill with white background to prevent transparency = black
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, w, h);
                ctx.drawImage(img, 0, 0, w, h);
                // Detect source type from data URL
                const isPng = dataURL.startsWith('data:image/png');
                const isWebp = dataURL.startsWith('data:image/webp');
                const mimeType = (isPng || isWebp) ? 'image/png' : 'image/jpeg';
                resolve(canvas.toDataURL(mimeType, quality));
            };
            img.onerror = () => resolve(null);
            img.src = dataURL;
        });
    }

    /**
     * Fetch a book cover from Open Library by ISBN
     */
    async function fetchCoverByISBN(isbn) {
        if (!isbn) return null;
        const cleanISBN = isbn.replace(/[^0-9X]/gi, '');
        const url = `https://covers.openlibrary.org/b/isbn/${cleanISBN}-L.jpg?default=false`;
        try {
            const resp = await fetch(url);
            if (!resp.ok) return null;
            const blob = await resp.blob();
            if (blob.size < 1000) return null; // too small = placeholder
            const rawDataURL = await new Promise(resolve => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.readAsDataURL(blob);
            });
            if (!rawDataURL) return null;
            // Compress through canvas to apply white background fill and consistent encoding
            return await compressDataURL(rawDataURL, 300, 0.8);
        } catch {
            return null;
        }
    }

    /**
     * Fetch a book cover from any image URL (e.g. Amazon CDN)
     * Returns a compressed data URL, or null on failure.
     */
    async function fetchCoverFromUrl(imageUrl) {
        if (!imageUrl) return null;
        try {
            const resp = await fetch(imageUrl);
            if (!resp.ok) return null;
            const blob = await resp.blob();
            if (blob.size < 500) return null; // too small = broken image
            if (!blob.type.startsWith('image/')) return null;

            // Convert to data URL then compress
            const dataURL = await new Promise(resolve => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => resolve(null);
                reader.readAsDataURL(blob);
            });
            if (!dataURL) return null;
            return await compressDataURL(dataURL, 300, 0.8);
        } catch {
            return null;
        }
    }

    /**
     * Parse OPF XML and extract metadata
     */
    function parseOPF(xmlString) {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(xmlString, 'application/xml');
            const ns = 'http://purl.org/dc/elements/1.1/';
            const opfNs = 'http://www.idpf.org/2007/opf';

            const getText = (tag) => {
                const el = doc.getElementsByTagNameNS(ns, tag)[0]
                    || doc.getElementsByTagName('dc:' + tag)[0]
                    || doc.querySelector(tag);
                return el ? el.textContent.trim() : '';
            };

            const getAllText = (tag) => {
                const els = doc.getElementsByTagNameNS(ns, tag);
                const results = [];
                for (let i = 0; i < els.length; i++) {
                    results.push(els[i].textContent.trim());
                }
                if (!results.length) {
                    const byTag = doc.getElementsByTagName('dc:' + tag);
                    for (let i = 0; i < byTag.length; i++) {
                        results.push(byTag[i].textContent.trim());
                    }
                }
                return results;
            };

            // Get identifiers (ISBN etc)
            const identifiers = [];
            const idEls = doc.getElementsByTagNameNS(ns, 'identifier');
            for (let i = 0; i < idEls.length; i++) {
                identifiers.push({
                    scheme: idEls[i].getAttribute('opf:scheme') || idEls[i].getAttribute('scheme') || '',
                    value: idEls[i].textContent.trim()
                });
            }

            const isbn = identifiers.find(id =>
                id.scheme.toLowerCase() === 'isbn' ||
                /^(97[89])?\d{9}[\dX]$/i.test(id.value.replace(/[^0-9X]/gi, ''))
            );

            // Series info from Calibre custom metadata
            let series = '', seriesIndex = '';
            const metaEls = doc.querySelectorAll('meta[name]');
            for (const m of metaEls) {
                if (m.getAttribute('name') === 'calibre:series') {
                    series = m.getAttribute('content') || '';
                }
                if (m.getAttribute('name') === 'calibre:series_index') {
                    seriesIndex = m.getAttribute('content') || '';
                }
            }

            // Rating
            let rating = 0;
            for (const m of metaEls) {
                if (m.getAttribute('name') === 'calibre:rating') {
                    rating = Math.round(parseFloat(m.getAttribute('content') || '0') / 2);
                }
            }

            return {
                title: getText('title'),
                author: getAllText('creator').join(', ') || getText('creator'),
                description: getText('description'),
                language: getText('language'),
                publisher: getText('publisher'),
                date: getText('date'),
                tags: getAllText('subject'),
                isbn: isbn ? isbn.value : '',
                series,
                seriesIndex,
                rating,
                identifiers
            };
        } catch (e) {
            console.warn('Failed to parse OPF:', e);
            return null;
        }
    }

    /**
     * Strip HTML tags from text
     */
    function stripHTML(html) {
        if (!html) return '';
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        return tmp.textContent || tmp.innerText || '';
    }

    /**
     * Format a date for display
     */
    function formatDate(dateStr) {
        if (!dateStr) return '';
        try {
            return new Date(dateStr).toLocaleDateString();
        } catch {
            return dateStr;
        }
    }

    /**
     * Look up a book by ISBN (supports both ISBN-10 and ISBN-13)
     * Uses Open Library API. Returns { title, author, isbn, tags, coverUrl, description } or null.
     */
    async function lookupByISBN(isbn) {
        if (!isbn) return null;
        const clean = isbn.replace(/[^0-9X]/gi, '');
        if (clean.length !== 10 && clean.length !== 13) return null;

        try {
            // Try the search API first — it returns richer data
            const searchUrl = `https://openlibrary.org/search.json?isbn=${encodeURIComponent(clean)}&limit=1&fields=title,author_name,isbn,subject,cover_i,first_sentence,key`;
            const resp = await fetch(searchUrl);
            if (!resp.ok) return null;
            const data = await resp.json();
            if (!data.docs || !data.docs.length) return null;

            const doc = data.docs[0];
            const coverUrl = doc.cover_i
                ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`
                : null;

            return {
                title: doc.title || '',
                author: (doc.author_name || []).join(', '),
                isbn: clean,
                tags: (doc.subject || []).slice(0, 6),
                coverUrl,
                description: doc.first_sentence ? (Array.isArray(doc.first_sentence) ? doc.first_sentence[0] : doc.first_sentence) : '',
                key: doc.key || ''
            };
        } catch {
            return null;
        }
    }

    /**
     * Search books by a freeform query (title, author, or both).
     * Returns an array of up to 5 results.
     */
    async function searchBooks(query) {
        if (!query || !query.trim()) return [];
        try {
            const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query.trim())}&limit=5&fields=title,author_name,isbn,subject,cover_i,first_sentence,key`;
            const resp = await fetch(url);
            if (!resp.ok) return [];
            const data = await resp.json();
            if (!data.docs || !data.docs.length) return [];

            return data.docs.map(doc => {
                const isbns = doc.isbn || [];
                // Prefer ISBN-13
                const isbn13 = isbns.find(i => i.length === 13) || '';
                const isbn10 = isbns.find(i => i.length === 10) || '';
                const coverUrl = doc.cover_i
                    ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`
                    : null;
                return {
                    title: doc.title || '',
                    author: (doc.author_name || []).join(', '),
                    isbn: isbn13 || isbn10,
                    tags: (doc.subject || []).slice(0, 6),
                    coverUrl,
                    description: doc.first_sentence ? (Array.isArray(doc.first_sentence) ? doc.first_sentence[0] : doc.first_sentence) : '',
                    key: doc.key || ''
                };
            });
        } catch {
            return [];
        }
    }

    /**
     * Get an Oxfam online shop search URL for a book.
     * Returns a URL string that opens the Oxfam search page for the given ISBN or title.
     */
    function getOxfamSearchUrl(isbn, title) {
        const query = isbn || title || '';
        if (!query) return null;
        return `https://onlineshop.oxfam.org.uk/search-results?Ntt=${encodeURIComponent(query)}`;
    }

    /**
     * Look up a book price on Oxfam's online shop.
     * Uses a CORS proxy to query the Oxfam Oracle Commerce Cloud search API.
     * Returns { price: number, url: string } or null on failure.
     *
     * @param {string} isbn  - ISBN to search by (preferred)
     * @param {string} title - Fallback: search by title
     */
    async function lookupOxfamPrice(isbn, title) {
        const queries = [];
        if (isbn) queries.push(isbn.replace(/[^0-9X]/gi, ''));
        if (title) queries.push(title);
        if (!queries.length) return null;

        for (const query of queries) {
            try {
                // The Oxfam shop runs on Oracle Commerce Cloud.
                // The search API endpoint returns JSON with product results.
                const oxfamApiUrl = `https://onlineshop.oxfam.org.uk/ccstoreui/v1/search?Ntt=${encodeURIComponent(query)}&Nrpp=5&No=0&Nr=product.active%3A1`;

                // Use allorigins.win as a CORS proxy
                const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(oxfamApiUrl)}`;

                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 8000);

                const resp = await fetch(proxyUrl, { signal: controller.signal });
                clearTimeout(timeout);

                if (!resp.ok) continue;

                const proxyData = await resp.json();
                if (!proxyData.contents) continue;

                const data = JSON.parse(proxyData.contents);

                // The OCC search API returns results in data.resultsList.records
                const records = data?.resultsList?.records;
                if (!records || !records.length) continue;

                // Extract prices from records and find the cheapest
                let bestPrice = Infinity;
                let bestUrl = null;

                for (const record of records) {
                    const attrs = record.attributes || record.records?.[0]?.attributes || {};
                    // Price fields vary: sku.salePrice, sku.listPrice, product.listPrice
                    const price = parseFloat(
                        attrs['sku.salePrice']?.[0] ||
                        attrs['sku.listPrice']?.[0] ||
                        attrs['product.listPrice']?.[0] ||
                        attrs['sku.maxActivePrice']?.[0] ||
                        '0'
                    );

                    if (price > 0 && price < bestPrice) {
                        bestPrice = price;
                        // Build product URL from the record
                        const route = attrs['product.route']?.[0] || '';
                        bestUrl = route
                            ? `https://onlineshop.oxfam.org.uk${route}`
                            : getOxfamSearchUrl(isbn, title);
                    }
                }

                if (bestPrice < Infinity && bestPrice > 0) {
                    return { price: bestPrice, url: bestUrl };
                }
            } catch (e) {
                // CORS proxy failed, timeout, or parse error — try next query or give up
                console.warn('Oxfam price lookup failed for query:', query, e.message || e);
                continue;
            }
        }

        return null;
    }

    return {
        generateId, normalise, matchKey, debounce, toast,
        readFileAsArrayBuffer, readFileAsText, readFileAsDataURL,
        compressImage, compressDataURL, fetchCoverByISBN, fetchCoverFromUrl,
        parseOPF, stripHTML, formatDate,
        lookupByISBN, searchBooks,
        getOxfamSearchUrl, lookupOxfamPrice
    };
})();
