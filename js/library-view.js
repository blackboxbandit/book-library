/* ===== Library View (Unified + per-type shelf rendering) ===== */
const LibraryView = (() => {
    /* — SVG Icon Strings — */
    const ICONS = {
        ebook: '<svg viewBox="0 0 24 24"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="9" y1="7" x2="15" y2="7"/><line x1="9" y1="10" x2="15" y2="10"/><line x1="9" y1="13" x2="12" y2="13"/></svg>',
        audiobook: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8 12a4 4 0 0 1 8 0"/><circle cx="12" cy="12" r="1.5"/></svg>',
        physical: '<svg viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
        book: '<svg viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
        check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    };

    const STATUS_LABELS = {
        unread: 'Unread',
        reading: 'Reading',
        read: 'Read'
    };

    function badgeHTML(type, label) {
        return `<span class="format-badge badge-${type}"><span class="badge-icon">${ICONS[type]}</span>${label}</span>`;
    }

    /**
     * Render books on a bookshelf in shelf rows
     */
    async function renderShelf(containerId, books, options = {}) {
        const container = document.getElementById(containerId);
        if (!container) return;

        // Get empty state element
        const emptyEl = container.querySelector('.empty-state');

        // Keep the empty state element but clear everything else
        container.innerHTML = '';

        if (!books.length) {
            if (emptyEl) {
                container.appendChild(emptyEl);
                emptyEl.style.display = '';
            }
            return;
        }

        // Hide empty state
        if (emptyEl) {
            emptyEl.style.display = 'none';
            container.appendChild(emptyEl);
        }

        // Break books into shelf rows (responsive: calculate books per row)
        const booksPerRow = Math.max(3, Math.floor((container.clientWidth || 900) / 170));
        const rows = [];
        for (let i = 0; i < books.length; i += booksPerRow) {
            rows.push(books.slice(i, i + booksPerRow));
        }

        for (const row of rows) {
            const rowEl = document.createElement('div');
            rowEl.className = 'shelf-row';

            for (let i = 0; i < row.length; i++) {
                const book = row[i];
                const card = await createBookCard(book, i * 50, options);
                rowEl.appendChild(card);
            }

            container.appendChild(rowEl);
        }
    }

    /**
     * Create a book card element
     */
    async function createBookCard(book, delay = 0, options = {}) {
        const card = document.createElement('div');
        card.className = 'book-card';
        card.style.animationDelay = delay + 'ms';
        card.dataset.bookId = book.id;
        card.dataset.bookType = book.type || book.sourceType || 'unknown';

        const wrap = document.createElement('div');
        wrap.className = 'book-cover-wrap';

        // Cover image
        let coverData = null;
        if (book.coverId) {
            coverData = await DB.getCover(book.coverId);
        }

        if (coverData) {
            const img = document.createElement('img');
            img.className = 'book-cover-img';
            img.src = coverData;
            img.alt = book.title;
            img.loading = 'lazy';
            wrap.appendChild(img);
        } else {
            const placeholder = document.createElement('div');
            const bookType = book.type || book.sourceType || 'unknown';
            placeholder.className = 'book-cover-placeholder' + (bookType === 'audiobook' ? ' audiobook-cover' : '');

            const placeholderIcon = bookType === 'audiobook' ? ICONS.audiobook : (bookType === 'physical' ? ICONS.physical : ICONS.ebook);
            placeholder.innerHTML = `
                <div class="placeholder-icon">${placeholderIcon}</div>
                <div class="placeholder-title">${escapeHtml(book.title)}</div>
                <div class="placeholder-author">${escapeHtml(book.author)}</div>
            `;
            wrap.appendChild(placeholder);
        }

        card.appendChild(wrap);

        // Hover overlay
        const overlay = document.createElement('div');
        overlay.className = 'book-overlay';
        overlay.innerHTML = `
            <div class="book-overlay-title">${escapeHtml(book.title)}</div>
            <div class="book-overlay-author">${escapeHtml(book.author)}</div>
        `;
        card.appendChild(overlay);

        // Format badges
        if (options.showBadges !== false) {
            const badges = document.createElement('div');
            badges.className = 'book-badges';

            if (book.hasEbook || book.type === 'ebook') {
                badges.innerHTML += badgeHTML('ebook', 'eBook');
            }
            if (book.hasAudiobook || book.type === 'audiobook') {
                badges.innerHTML += badgeHTML('audiobook', 'Audio');
            }
            if (book.hasPhysical || book.type === 'physical') {
                badges.innerHTML += badgeHTML('physical', 'Physical');
            }

            if (badges.innerHTML) card.appendChild(badges);
        }

        // Reading status indicator
        const status = book.readingStatus || 'unread';
        if (status !== 'unread') {
            const statusBadge = document.createElement('div');
            statusBadge.className = `reading-status-badge status-${status}`;
            statusBadge.textContent = status === 'reading' ? '📖' : '✅';
            statusBadge.title = STATUS_LABELS[status];
            card.appendChild(statusBadge);
        }

        // Tick-to-complete button (for currently reading cards)
        if (options.showTickButton && status === 'reading') {
            const tickBtn = document.createElement('button');
            tickBtn.className = 'tick-complete-btn';
            tickBtn.innerHTML = ICONS.check;
            tickBtn.title = 'Mark as Read';
            tickBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await updateBookStatus(book, 'read');
                App.refreshCurrentTab();
            });
            card.appendChild(tickBtn);
        }

        // Sale badge for wishlist
        if (book.onSale) {
            const sale = document.createElement('div');
            sale.className = 'sale-badge';
            sale.textContent = 'SALE';
            card.appendChild(sale);
        }

        // Click handler
        card.addEventListener('click', () => showDetail(book));

        return card;
    }

    /**
     * Render wishlist grid
     */
    async function renderWishlist(items) {
        const container = document.getElementById('wishlist-grid');
        const emptyEl = container.querySelector('.empty-state');
        container.innerHTML = '';

        if (!items.length) {
            if (emptyEl) {
                container.appendChild(emptyEl);
                emptyEl.style.display = '';
            }
            return;
        }

        if (emptyEl) {
            emptyEl.style.display = 'none';
            container.appendChild(emptyEl);
        }

        for (const item of items) {
            const card = document.createElement('div');
            card.className = 'wishlist-card';
            card.style.animation = 'bookSlideIn 0.5s var(--ease-out) both';

            let coverHTML = '';
            if (item.coverId) {
                const coverData = await DB.getCover(item.coverId);
                if (coverData) {
                    const isSafeUrl = coverData.startsWith('data:image/') || Utils.isValidUrl(coverData);
                    if (isSafeUrl) {
                        coverHTML = `<img class="wishlist-card-cover" src="${coverData}" alt="${escapeHtml(item.title)}">`;
                    }
                }
            }
            if (!coverHTML) {
                coverHTML = `<div class="wishlist-card-cover" style="background: var(--bg-tertiary); display: flex; align-items: center; justify-content: center;"><span class="icon" style="width:48px;height:48px;color:var(--text-tertiary)">${ICONS.book}</span></div>`;
            }

            const amazonPriceStr = item.amazonPrice ? `£${item.amazonPrice.toFixed(2)}` : '—';
            const oxfamPriceStr = item.oxfamPrice ? `£${item.oxfamPrice.toFixed(2)}` : '—';
            const saleClass = item.onSale ? 'on-sale' : '';

            card.innerHTML = `
                ${item.onSale ? '<div class="sale-badge">SALE</div>' : ''}
                ${coverHTML}
                <div class="wishlist-card-body">
                    <div class="wishlist-card-title">${escapeHtml(item.title)}</div>
                    <div class="wishlist-card-author">${escapeHtml(item.author)}</div>
                    <div class="wishlist-prices">
                        <div class="price-block">
                            <span class="price-label">Amazon</span>
                            <span class="price-value ${saleClass}">${amazonPriceStr}</span>
                        </div>
                        <div class="price-block">
                            <span class="price-label">Oxfam</span>
                            <span class="price-value ${saleClass}">${oxfamPriceStr}</span>
                        </div>
                    </div>
                </div>
                <div class="wishlist-card-actions">
                    <button class="btn btn-small btn-secondary btn-edit-wishlist" data-id="${item.id}">Edit</button>
                    <button class="btn btn-small btn-danger btn-delete-wishlist" data-id="${item.id}">Delete</button>
                    ${item.amazonUrl && Utils.isValidUrl(item.amazonUrl) ? `<a class="btn btn-small btn-primary" href="${escapeHtml(item.amazonUrl)}" target="_blank" rel="noopener">Amazon</a>` : ''}
                    ${(() => { const oxUrl = Utils.getOxfamSearchUrl(item.isbn, item.title); return oxUrl && Utils.isValidUrl(oxUrl) ? `<a class="btn btn-small btn-oxfam" href="${escapeHtml(oxUrl)}" target="_blank" rel="noopener">Oxfam</a>` : ''; })()}
                </div>
            `;

            // Event listeners
            card.querySelector('.btn-edit-wishlist')?.addEventListener('click', (e) => {
                e.stopPropagation();
                Wishlist.openForm(item);
            });

            card.querySelector('.btn-delete-wishlist')?.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (await Wishlist.deleteItem(item.id)) {
                    App.refreshCurrentTab();
                }
            });

            container.appendChild(card);
        }
    }

    /**
     * Merge books from all three stores by matchKey, deduplicating and
     * carrying hasEbook / hasAudiobook / hasPhysical flags + best cover.
     */
    function mergeBooks(ebooks, audiobooks, physical) {
        const merged = new Map();

        const addBooks = (list, type) => {
            for (const book of list) {
                // Always recalculate matchKey on merge to apply the latest robust matching logic
                const key = Utils.matchKey(book.title, book.author);
                if (!merged.has(key)) {
                    merged.set(key, {
                        ...book,
                        hasEbook: false,
                        hasAudiobook: false,
                        hasPhysical: false,
                        sourceType: type,
                        _allFormats: []
                    });
                }
                const entry = merged.get(key);
                if (type === 'ebook') entry.hasEbook = true;
                if (type === 'audiobook') entry.hasAudiobook = true;
                if (type === 'physical') entry.hasPhysical = true;
                // Use the entry with the best cover
                if (!entry.coverId && book.coverId) {
                    entry.coverId = book.coverId;
                }
                // Merge tags
                if (book.tags && book.tags.length) {
                    entry.tags = [...new Set([...(entry.tags || []), ...book.tags])];
                }
                // Merge file formats (epub, pdf, mp3, etc.)
                if (book.formats && book.formats.length) {
                    entry._allFormats = [...new Set([...(entry._allFormats || []), ...book.formats])];
                }
                // Keep the richer metadata
                if (!entry.description && book.description) entry.description = book.description;
                if (!entry.isbn && book.isbn) entry.isbn = book.isbn;
                if (!entry.series && book.series) entry.series = book.series;
                if (!entry.publisher && book.publisher) entry.publisher = book.publisher;
                if (book.rating && (!entry.rating || book.rating > entry.rating)) entry.rating = book.rating;
                // Merge reading status (prefer 'reading' > 'read' > 'unread')
                const statusPriority = { reading: 3, read: 2, unread: 1 };
                const bookStatus = book.readingStatus || 'unread';
                const entryStatus = entry.readingStatus || 'unread';
                if ((statusPriority[bookStatus] || 0) > (statusPriority[entryStatus] || 0)) {
                    entry.readingStatus = bookStatus;
                }
                // Merge shelves
                const entryShelves = entry.shelves || (entry.shelf ? [entry.shelf] : []);
                const bookShelves = book.shelves || (book.shelf ? [book.shelf] : []);
                if (bookShelves.length > 0) {
                    entry.shelves = [...new Set([...entryShelves, ...bookShelves])];
                    entry.shelf = entry.shelves.length > 0 ? entry.shelves[0] : '';
                } else if (!entry.shelves) {
                    entry.shelves = entryShelves;
                }
                if (!entry.dateStarted && book.dateStarted) entry.dateStarted = book.dateStarted;
                if (!entry.dateCompleted && book.dateCompleted) entry.dateCompleted = book.dateCompleted;
            }
        };

        addBooks(ebooks, 'ebook');
        addBooks(audiobooks, 'audiobook');
        addBooks(physical, 'physical');

        // --- Helper to merge secondary entry into primary ---
        function mergeEntryInto(primary, secondary) {
            if (secondary.hasEbook) primary.hasEbook = true;
            if (secondary.hasAudiobook) primary.hasAudiobook = true;
            if (secondary.hasPhysical) primary.hasPhysical = true;
            if (!primary.coverId && secondary.coverId) primary.coverId = secondary.coverId;
            if (secondary.tags && secondary.tags.length) {
                primary.tags = [...new Set([...(primary.tags || []), ...secondary.tags])];
            }
            if (secondary._allFormats && secondary._allFormats.length) {
                primary._allFormats = [...new Set([...(primary._allFormats || []), ...secondary._allFormats])];
            }
            if (secondary.formats && secondary.formats.length) {
                primary._allFormats = [...new Set([...(primary._allFormats || []), ...secondary.formats])];
            }
            if (!primary.description && secondary.description) primary.description = secondary.description;
            if (!primary.isbn && secondary.isbn) primary.isbn = secondary.isbn;
            if (!primary.series && secondary.series) primary.series = secondary.series;
            if (!primary.publisher && secondary.publisher) primary.publisher = secondary.publisher;
            if (secondary.rating && (!primary.rating || secondary.rating > primary.rating)) primary.rating = secondary.rating;
            const statusPriority = { reading: 3, read: 2, unread: 1 };
            const bs = secondary.readingStatus || 'unread';
            const ps = primary.readingStatus || 'unread';
            if ((statusPriority[bs] || 0) > (statusPriority[ps] || 0)) {
                primary.readingStatus = bs;
            }
            if (!primary.shelf && secondary.shelf) primary.shelf = secondary.shelf;
        }

        // --- ISBN-based merge pass ---
        // Books with the same non-empty ISBN should always merge, even if
        // matchKey didn't align (e.g. different subtitle formatting).
        const isbnIndex = new Map(); // isbn → first matchKey
        const entries = Array.from(merged.entries());
        for (const [key, entry] of entries) {
            if (!entry.isbn) continue;
            const cleanIsbn = entry.isbn.replace(/[^0-9X]/gi, '');
            if (cleanIsbn.length < 10) continue;
            if (isbnIndex.has(cleanIsbn)) {
                const primaryKey = isbnIndex.get(cleanIsbn);
                if (primaryKey === key) continue;
                const primary = merged.get(primaryKey);
                if (!primary) continue;
                mergeEntryInto(primary, entry);
                merged.delete(key);
            } else {
                isbnIndex.set(cleanIsbn, key);
            }
        }

        // --- Fuzzy matching second pass ---
        // Use Levenshtein-based scoring to catch entries that didn't merge by
        // exact matchKey but are clearly the same work (e.g. slightly different
        // editions, author-in-title audiobook naming, format words in title).
        const currentEntries = Array.from(merged.entries()); // [key, entry]
        const FUZZY_THRESHOLD = 0.72;

        for (let i = 0; i < currentEntries.length; i++) {
            const [keyA, entryA] = currentEntries[i];
            if (!merged.has(keyA)) continue; // already merged away

            for (let j = i + 1; j < currentEntries.length; j++) {
                const [keyB, entryB] = currentEntries[j];
                if (!merged.has(keyB)) continue; // already merged away

                // ISBN conflict guard: if both books have different ISBNs,
                // they are definitely different books — skip fuzzy merge.
                if (entryA.isbn && entryB.isbn) {
                    const isbnA = entryA.isbn.replace(/[^0-9X]/gi, '');
                    const isbnB = entryB.isbn.replace(/[^0-9X]/gi, '');
                    if (isbnA.length >= 10 && isbnB.length >= 10 && isbnA !== isbnB) {
                        continue;
                    }
                }

                const score = Utils.fuzzyMatchScore(
                    entryA.title, entryA.author,
                    entryB.title, entryB.author
                );

                if (score < FUZZY_THRESHOLD) continue;

                // Merge B into A (keep the one with the shorter/cleaner title as primary)
                const normTA = Utils.fuzzyNormaliseTitle(entryA.title);
                const normTB = Utils.fuzzyNormaliseTitle(entryB.title);
                const [primary, secondary, secondaryKey] = (normTA.length <= normTB.length)
                    ? [entryA, entryB, keyB]
                    : [entryB, entryA, keyA];

                mergeEntryInto(primary, secondary);

                // Remove the secondary entry
                merged.delete(secondaryKey);

                // If we merged A into B (secondaryKey === keyA), stop iterating on i
                if (secondaryKey === keyA) break;
            }
        }

        // Write the merged formats list back to the standard field
        for (const entry of merged.values()) {
            if (entry._allFormats.length) {
                entry.formats = entry._allFormats;
            }
            delete entry._allFormats;
        }

        return Array.from(merged.values());
    }

    /**
     * Build unified view merging all collections
     */
    async function renderUnified(ebooks, audiobooks, physical, search, sort, formatFilter, statusFilter, groupBy, shelfFilter) {
        let books = mergeBooks(ebooks, audiobooks, physical);

        // Filter by search
        if (search) {
            const q = Utils.normalise(search);
            books = books.filter(b =>
                Utils.normalise(b.title).includes(q) ||
                Utils.normalise(b.author).includes(q) ||
                (b.tags || []).some(t => Utils.normalise(t).includes(q))
            );
        }

        // Filter by format
        if (formatFilter && formatFilter !== 'all') {
            books = books.filter(b => {
                if (formatFilter === 'ebook') return b.hasEbook;
                if (formatFilter === 'audiobook') return b.hasAudiobook;
                if (formatFilter === 'physical') return b.hasPhysical;
                return true;
            });
        }

        // Filter by reading status
        if (statusFilter && statusFilter !== 'all') {
            books = books.filter(b => (b.readingStatus || 'unread') === statusFilter);
        }

        // Filter by shelf
        if (shelfFilter && shelfFilter !== 'all') {
            books = books.filter(b => b.shelves && b.shelves.includes(shelfFilter));
        }

        // Sort
        books = sortBooks(books, sort);

        // Currently Reading section (only when no status filter is active, or filter is 'all')
        const crSection = document.getElementById('currently-reading-section');
        if (crSection && (!statusFilter || statusFilter === 'all') && (!groupBy || groupBy === 'none')) {
            const readingBooks = books.filter(b => (b.readingStatus || 'unread') === 'reading');
            if (readingBooks.length > 0) {
                crSection.hidden = false;
                await renderShelf('currently-reading-shelf', readingBooks, { showBadges: true, showTickButton: true });
            } else {
                crSection.hidden = true;
            }
        } else if (crSection) {
            crSection.hidden = true;
        }

        // Group-by mode
        if (groupBy && groupBy !== 'none') {
            await renderGroupedShelf('unified-shelf', books, groupBy);
        } else {
            await renderShelf('unified-shelf', books, { showBadges: true });
        }
    }

    /**
     * Render books in groups with section headers
     */
    async function renderGroupedShelf(containerId, books, groupBy) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const emptyEl = container.querySelector('.empty-state');
        container.innerHTML = '';

        if (!books.length) {
            if (emptyEl) {
                container.appendChild(emptyEl);
                emptyEl.style.display = '';
            }
            return;
        }

        if (emptyEl) {
            emptyEl.style.display = 'none';
            container.appendChild(emptyEl);
        }

        // Group books
        const groups = new Map();
        for (const book of books) {
            if (groupBy === 'shelf') {
                const keys = (book.shelves && book.shelves.length > 0) ? book.shelves : ['No Shelf'];
                for (const key of keys) {
                    if (!groups.has(key)) groups.set(key, []);
                    groups.get(key).push(book);
                }
                continue;
            }

            let key;
            switch (groupBy) {
                case 'genre':
                    key = (book.tags && book.tags.length) ? book.tags[0] : 'Untagged';
                    break;
                case 'author':
                    key = book.author || 'Unknown Author';
                    break;
                case 'status':
                    key = STATUS_LABELS[book.readingStatus || 'unread'];
                    break;
                default:
                    key = 'All';
            }
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(book);
        }

        // Sort group keys
        const sortedKeys = Array.from(groups.keys()).sort((a, b) => {
            // Put "No Shelf" / "Untagged" etc. last
            if (a === 'No Shelf' || a === 'Untagged' || a === 'Unknown Author') return 1;
            if (b === 'No Shelf' || b === 'Untagged' || b === 'Unknown Author') return -1;
            return a.localeCompare(b);
        });

        for (const key of sortedKeys) {
            const groupBooks = groups.get(key);

            // Group header
            const header = document.createElement('div');
            header.className = 'shelf-group-header';
            header.innerHTML = `<h3>${escapeHtml(key)}</h3><span class="shelf-group-count">${groupBooks.length} book${groupBooks.length !== 1 ? 's' : ''}</span>`;
            container.appendChild(header);

            // Render the group's books as a grid
            const booksPerRow = Math.max(3, Math.floor((container.clientWidth || 900) / 170));
            const rows = [];
            for (let i = 0; i < groupBooks.length; i += booksPerRow) {
                rows.push(groupBooks.slice(i, i + booksPerRow));
            }

            for (const row of rows) {
                const rowEl = document.createElement('div');
                rowEl.className = 'shelf-row';
                for (let i = 0; i < row.length; i++) {
                    const card = await createBookCard(row[i], i * 50, { showBadges: true });
                    rowEl.appendChild(card);
                }
                container.appendChild(rowEl);
            }
        }
    }

    /**
     * Sort books array
     */
    function sortBooks(books, sortBy) {
        return books.sort((a, b) => {
            switch (sortBy) {
                case 'author':
                    return (a.author || '').localeCompare(b.author || '');
                case 'dateAdded':
                    return new Date(b.dateAdded || 0) - new Date(a.dateAdded || 0);
                case 'rating':
                    return (b.rating || 0) - (a.rating || 0);
                case 'title':
                default:
                    return (a.title || '').localeCompare(b.title || '');
            }
        });
    }

    /**
     * Filter + render a single collection, merged with other stores
     * so cross-format badges appear on every card.
     */
    async function renderCollection(primaryType, shelfId, allBooks, search = '') {
        // allBooks = { ebooks, audiobooks, physical }
        let books = mergeBooks(allBooks.ebooks, allBooks.audiobooks, allBooks.physical);

        // Only show books that exist in the requested type
        books = books.filter(b => {
            if (primaryType === 'ebooks') return b.hasEbook;
            if (primaryType === 'audiobooks') return b.hasAudiobook;
            if (primaryType === 'physical') return b.hasPhysical;
            return true;
        });

        if (search) {
            const q = Utils.normalise(search);
            books = books.filter(b =>
                Utils.normalise(b.title).includes(q) ||
                Utils.normalise(b.author).includes(q)
            );
        }
        books = sortBooks(books, 'title');
        await renderShelf(shelfId, books, { showBadges: true });
    }

    /**
     * Helper: determine which DB store a book lives in
     */
    function storeForBook(book) {
        const type = book.type || book.sourceType;
        if (type === 'ebook') return DB.STORES.EBOOKS;
        if (type === 'audiobook') return DB.STORES.AUDIOBOOKS;
        return DB.STORES.PHYSICAL;
    }

    /**
     * Persist a field change to a book across all its source stores
     */
    async function persistBookField(book, fields) {
        const stores = [
            { flag: book.hasEbook, store: DB.STORES.EBOOKS },
            { flag: book.hasAudiobook, store: DB.STORES.AUDIOBOOKS },
            { flag: book.hasPhysical || book.type === 'physical', store: DB.STORES.PHYSICAL }
        ];

        const matchKey = Utils.matchKey(book.title, book.author);

        for (const { flag, store } of stores) {
            if (!flag) continue;
            const all = await DB.getAll(store);
            for (const b of all) {
                const bKey = Utils.matchKey(b.title, b.author);
                if (bKey === matchKey || b.id === book.id) {
                    Object.assign(b, fields);
                    await DB.put(store, b);
                }
            }
        }

        // Also update the live book object
        Object.assign(book, fields);
    }

    /**
     * Show book detail modal — with inline editing capabilities
     */
    async function showDetail(book) {
        const overlay = document.getElementById('modal-overlay');
        const imgEl = document.getElementById('modal-cover-img');
        const titleEl = document.getElementById('modal-title');
        const authorEl = document.getElementById('modal-author');
        const formatsEl = document.getElementById('modal-formats');
        const metaEl = document.getElementById('modal-meta');
        const descEl = document.getElementById('modal-description');
        const tagsEl = document.getElementById('modal-tags');
        const actionsEl = document.getElementById('modal-actions');

        titleEl.textContent = book.title;
        authorEl.textContent = book.author;

        // ── Cover ──
        async function refreshCover() {
            if (book.coverId) {
                const coverData = await DB.getCover(book.coverId);
                if (coverData) {
                    imgEl.src = coverData;
                    imgEl.style.display = '';
                    return;
                }
            }
            imgEl.style.display = 'none';
        }
        await refreshCover();

        // ── Formats ──
        formatsEl.innerHTML = '';
        if (book.hasEbook || book.type === 'ebook') formatsEl.innerHTML += badgeHTML('ebook', 'eBook');
        if (book.hasAudiobook || book.type === 'audiobook') formatsEl.innerHTML += badgeHTML('audiobook', 'Audiobook');
        if (book.hasPhysical || book.type === 'physical') formatsEl.innerHTML += badgeHTML('physical', 'Physical');
        if (book.formats && book.formats.length) {
            formatsEl.innerHTML += `<span style="font-size: var(--text-xs); color: var(--text-tertiary); margin-left: 8px;">${escapeHtml(book.formats.join(', ').toUpperCase())}</span>`;
        }

        // Reading status badge
        const currentStatus = book.readingStatus || 'unread';
        formatsEl.innerHTML += `<span class="format-badge badge-status-${currentStatus}" style="margin-left: 4px;">${STATUS_LABELS[currentStatus]}</span>`;

        // ── Meta (static info) ──
        const metaParts = [];
        if (book.shelves && book.shelves.length) {
            metaParts.push(`📚 ${escapeHtml(book.shelves.join(', '))}`);
        } else if (book.shelf) {
            metaParts.push(`📚 ${escapeHtml(book.shelf)}`);
        }
        if (book.series) metaParts.push(`Series: ${escapeHtml(book.series)}${book.seriesIndex ? ' #' + escapeHtml(book.seriesIndex) : ''}`);
        if (book.publisher) metaParts.push(`Publisher: ${escapeHtml(book.publisher)}`);
        if (book.publishDate) metaParts.push(`Published: ${escapeHtml(Utils.formatDate(book.publishDate))}`);
        if (book.language) metaParts.push(`Language: ${escapeHtml(book.language)}`);
        if (book.fileCount) metaParts.push(`${book.fileCount} audio files`);
        if (book.dateAdded) metaParts.push(`Added: ${escapeHtml(Utils.formatDate(book.dateAdded))}`);
        if (book.dateStarted) metaParts.push(`Started: ${escapeHtml(Utils.formatDate(book.dateStarted))}`);
        if (book.dateCompleted) metaParts.push(`Finished: ${escapeHtml(Utils.formatDate(book.dateCompleted))}`);
        metaEl.innerHTML = metaParts.join(' &nbsp;·&nbsp; ');

        // ── Description / Notes ──
        descEl.textContent = book.description || book.notes || '';
        descEl.style.display = (book.description || book.notes) ? '' : 'none';

        // ── Tags (read-only display of existing tags goes here) ──
        tagsEl.innerHTML = '';

        // ── Actions (all the interactive controls) ──
        actionsEl.innerHTML = '';

        // ────────────────────────────────────────
        // 1. ISBN + Lookup row
        // ────────────────────────────────────────
        const isbnGroup = document.createElement('div');
        isbnGroup.className = 'modal-enrichment-row';
        isbnGroup.innerHTML = `
            <span class="modal-status-label">ISBN:</span>
            <input type="text" class="modal-inline-input" id="modal-isbn-input"
                   value="${escapeHtml(book.isbn || '')}" placeholder="Enter ISBN…"
                   style="width:160px; font-variant-numeric: tabular-nums;">
            <button class="btn btn-small btn-primary" id="btn-modal-isbn-lookup" title="Look up book by ISBN">🔍 Lookup</button>
            <button class="btn btn-small btn-secondary" id="btn-modal-isbn-save" title="Save ISBN">💾 Save</button>
        `;
        actionsEl.appendChild(isbnGroup);

        // ISBN save
        isbnGroup.querySelector('#btn-modal-isbn-save').addEventListener('click', async () => {
            const newIsbn = isbnGroup.querySelector('#modal-isbn-input').value.trim();
            await persistBookField(book, { isbn: newIsbn });
            Utils.toast('ISBN saved.', 'success');
        });

        // ISBN lookup — searches Open Library, populates ISBN + optionally fetches cover
        isbnGroup.querySelector('#btn-modal-isbn-lookup').addEventListener('click', async () => {
            const isbn = isbnGroup.querySelector('#modal-isbn-input').value.trim();
            const lookupBtn = isbnGroup.querySelector('#btn-modal-isbn-lookup');
            lookupBtn.disabled = true;
            lookupBtn.textContent = '⏳…';

            try {
                let result = null;
                if (isbn) {
                    result = await Utils.lookupByISBN(isbn);
                }
                if (!result) {
                    // Fallback: search by title + author
                    const query = [book.title, book.author].filter(Boolean).join(' ');
                    const results = await Utils.searchBooks(query);
                    result = results && results.length ? results[0] : null;
                }

                if (result) {
                    // Populate ISBN
                    if (result.isbn) {
                        isbnGroup.querySelector('#modal-isbn-input').value = result.isbn;
                        await persistBookField(book, { isbn: result.isbn });
                    }
                    // Populate tags if empty
                    if (result.tags && result.tags.length && (!book.tags || !book.tags.length)) {
                        await persistBookField(book, { tags: result.tags });
                        renderInlineTags();
                    }
                    // Fetch cover if missing
                    if (!book.coverId && result.coverUrl && Utils.isValidUrl(result.coverUrl)) {
                        Utils.toast('Fetching cover…', 'info');
                        const coverData = await Utils.fetchCoverFromUrl(result.coverUrl);
                        if (coverData) {
                            const coverId = 'cover_' + book.id;
                            await DB.saveCover(coverId, coverData);
                            await persistBookField(book, { coverId });
                            await refreshCover();
                        }
                    }
                    Utils.toast('Book info updated!', 'success');
                    App.refreshCurrentTab();
                } else {
                    Utils.toast('No results found.', 'error');
                }
            } catch (err) {
                Utils.toast('Lookup failed: ' + err.message, 'error');
            } finally {
                lookupBtn.disabled = false;
                lookupBtn.textContent = '🔍 Lookup';
            }
        });

        // ────────────────────────────────────────
        // 2. Cover Management toolbar
        // ────────────────────────────────────────
        const coverGroup = document.createElement('div');
        coverGroup.className = 'modal-enrichment-section';
        coverGroup.innerHTML = `
            <div class="modal-enrichment-label">Cover Art</div>
            <div class="modal-enrichment-row">
                <button class="btn btn-small btn-secondary" id="btn-modal-fetch-cover" title="Fetch cover from Open Library by ISBN">
                    📥 Fetch by ISBN
                </button>
                <button class="btn btn-small btn-secondary" id="btn-modal-cover-upload" title="Upload a cover image from your computer">
                    📁 Upload
                </button>
                <button class="btn btn-small btn-danger" id="btn-modal-remove-cover" title="Remove current cover" ${!book.coverId ? 'disabled' : ''}>
                    🗑 Remove
                </button>
                <a class="btn btn-small btn-secondary" id="btn-modal-google-cover"
                   href="https://www.google.com/search?tbm=isch&q=${encodeURIComponent(book.title + ' ' + book.author + ' book cover')}"
                   target="_blank" rel="noopener" title="Search Google Images for this cover">
                    🌐 Google
                </a>
            </div>
            <div class="modal-enrichment-row" style="margin-top: 6px;">
                <input type="text" class="modal-inline-input" id="modal-cover-url"
                       placeholder="Paste cover image URL…" style="flex:1;">
                <button class="btn btn-small btn-primary" id="btn-modal-apply-cover-url" title="Download and save cover from URL">Apply</button>
            </div>
            <input type="file" id="modal-cover-file-input" accept="image/*" hidden>
        `;
        actionsEl.appendChild(coverGroup);

        // Fetch cover by ISBN
        coverGroup.querySelector('#btn-modal-fetch-cover').addEventListener('click', async () => {
            const isbn = isbnGroup.querySelector('#modal-isbn-input').value.trim() || book.isbn;
            if (!isbn) {
                Utils.toast('Enter an ISBN first.', 'error');
                return;
            }
            Utils.toast('Fetching cover by ISBN…', 'info');
            const coverData = await Utils.fetchCoverByISBN(isbn);
            if (coverData) {
                const coverId = 'cover_' + book.id;
                await DB.saveCover(coverId, coverData);
                await persistBookField(book, { coverId });
                await refreshCover();
                coverGroup.querySelector('#btn-modal-remove-cover').disabled = false;
                Utils.toast('Cover updated!', 'success');
                App.refreshCurrentTab();
            } else {
                Utils.toast('No cover found for this ISBN.', 'error');
            }
        });

        // Upload cover from file
        const fileInput = coverGroup.querySelector('#modal-cover-file-input');
        coverGroup.querySelector('#btn-modal-cover-upload').addEventListener('click', () => {
            fileInput.click();
        });
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            Utils.toast('Processing cover…', 'info');
            const dataURL = await Utils.compressImage(file);
            if (dataURL) {
                const coverId = 'cover_' + book.id;
                await DB.saveCover(coverId, dataURL);
                await persistBookField(book, { coverId });
                await refreshCover();
                coverGroup.querySelector('#btn-modal-remove-cover').disabled = false;
                Utils.toast('Cover uploaded!', 'success');
                App.refreshCurrentTab();
            }
            e.target.value = '';
        });

        // Remove cover
        coverGroup.querySelector('#btn-modal-remove-cover').addEventListener('click', async () => {
            if (!confirm('Remove the cover image?')) return;
            if (book.coverId) {
                await DB.remove(DB.STORES.COVERS, book.coverId);
            }
            await persistBookField(book, { coverId: null });
            await refreshCover();
            coverGroup.querySelector('#btn-modal-remove-cover').disabled = true;
            Utils.toast('Cover removed.', 'info');
            App.refreshCurrentTab();
        });

        // Apply cover from URL
        coverGroup.querySelector('#btn-modal-apply-cover-url').addEventListener('click', async () => {
            const url = coverGroup.querySelector('#modal-cover-url').value.trim();
            if (!url) {
                Utils.toast('Paste an image URL first.', 'error');
                return;
            }
            if (!Utils.isValidUrl(url)) {
                Utils.toast('Invalid URL. Must start with http:// or https://', 'error');
                return;
            }
            Utils.toast('Downloading cover…', 'info');
            try {
                const coverData = await Utils.fetchCoverFromUrl(url);
                if (coverData) {
                    const coverId = 'cover_' + book.id;
                    await DB.saveCover(coverId, coverData);
                    await persistBookField(book, { coverId });
                    await refreshCover();
                    coverGroup.querySelector('#btn-modal-remove-cover').disabled = false;
                    coverGroup.querySelector('#modal-cover-url').value = '';
                    Utils.toast('Cover updated!', 'success');
                    App.refreshCurrentTab();
                } else {
                    Utils.toast('Could not download image from that URL.', 'error');
                }
            } catch (err) {
                Utils.toast('Failed: ' + err.message, 'error');
            }
        });

        // ────────────────────────────────────────
        // 3. Inline Star Rating
        // ────────────────────────────────────────
        const ratingGroup = document.createElement('div');
        ratingGroup.className = 'modal-enrichment-row';
        const currentRating = book.rating || 0;
        ratingGroup.innerHTML = `
            <span class="modal-status-label">Rating:</span>
            <div class="modal-star-rating" id="modal-star-rating">
                ${[1,2,3,4,5].map(v => `<span class="modal-star ${v <= currentRating ? 'active' : ''}" data-val="${v}">★</span>`).join('')}
            </div>
            <button class="btn btn-small btn-secondary" id="btn-modal-clear-rating" title="Clear rating" style="margin-left: 4px; padding: 4px 6px; font-size: 11px;">✕</button>
        `;
        actionsEl.appendChild(ratingGroup);

        const starContainer = ratingGroup.querySelector('#modal-star-rating');
        const modalStars = starContainer.querySelectorAll('.modal-star');

        function setStarDisplay(rating) {
            modalStars.forEach(s => {
                s.classList.toggle('active', parseInt(s.dataset.val) <= rating);
            });
        }

        modalStars.forEach(star => {
            star.addEventListener('click', async () => {
                const val = parseInt(star.dataset.val);
                setStarDisplay(val);
                await persistBookField(book, { rating: val });
                Utils.toast(`Rated ${val} star${val !== 1 ? 's' : ''}.`, 'success');
            });
            star.addEventListener('mouseenter', () => {
                setStarDisplay(parseInt(star.dataset.val));
            });
        });
        starContainer.addEventListener('mouseleave', () => {
            setStarDisplay(book.rating || 0);
        });

        ratingGroup.querySelector('#btn-modal-clear-rating').addEventListener('click', async () => {
            setStarDisplay(0);
            await persistBookField(book, { rating: 0 });
            Utils.toast('Rating cleared.', 'info');
        });

        // ────────────────────────────────────────
        // 4. Inline Tag Editing
        // ────────────────────────────────────────
        const tagSection = document.createElement('div');
        tagSection.className = 'modal-enrichment-section';
        tagSection.innerHTML = `
            <div class="modal-enrichment-label">Tags</div>
            <div class="modal-tag-list" id="modal-tag-list"></div>
            <div class="modal-enrichment-row" style="margin-top: 6px;">
                <input type="text" class="modal-inline-input" id="modal-tag-input"
                       placeholder="Add tag…" style="flex:1;" maxlength="40">
                <button class="btn btn-small btn-primary" id="btn-modal-add-tag">+ Add</button>
            </div>
        `;
        actionsEl.appendChild(tagSection);

        function renderInlineTags() {
            const tagList = tagSection.querySelector('#modal-tag-list');
            const tags = book.tags || [];
            if (!tags.length) {
                tagList.innerHTML = '<span style="font-size: var(--text-xs); color: var(--text-tertiary);">No tags yet</span>';
                return;
            }
            tagList.innerHTML = tags.map((t, i) => `
                <span class="modal-tag-chip">
                    ${escapeHtml(t)}
                    <button class="modal-tag-remove" data-index="${i}" title="Remove tag">✕</button>
                </span>
            `).join('');

            tagList.querySelectorAll('.modal-tag-remove').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const idx = parseInt(btn.dataset.index);
                    const newTags = [...(book.tags || [])];
                    newTags.splice(idx, 1);
                    await persistBookField(book, { tags: newTags });
                    renderInlineTags();
                    Utils.toast('Tag removed.', 'info');
                });
            });
        }
        renderInlineTags();

        const tagInput = tagSection.querySelector('#modal-tag-input');
        const addTagBtn = tagSection.querySelector('#btn-modal-add-tag');

        async function addTag() {
            const val = tagInput.value.trim();
            if (!val) return;
            const newTags = [...new Set([...(book.tags || []), val])];
            await persistBookField(book, { tags: newTags });
            tagInput.value = '';
            renderInlineTags();
            Utils.toast(`Tag "${val}" added.`, 'success');
        }
        addTagBtn.addEventListener('click', addTag);
        tagInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); addTag(); }
        });

        // ────────────────────────────────────────
        // 5. Inline Notes Editing
        // ────────────────────────────────────────
        const notesSection = document.createElement('div');
        notesSection.className = 'modal-enrichment-section';
        notesSection.innerHTML = `
            <div class="modal-enrichment-label">Notes</div>
            <textarea class="modal-inline-textarea" id="modal-notes-input" rows="3"
                      placeholder="Add notes…">${escapeHtml(book.notes || '')}</textarea>
            <div style="display: flex; justify-content: flex-end; margin-top: 4px;">
                <button class="btn btn-small btn-primary" id="btn-modal-save-notes">💾 Save Notes</button>
            </div>
        `;
        actionsEl.appendChild(notesSection);

        notesSection.querySelector('#btn-modal-save-notes').addEventListener('click', async () => {
            const notes = notesSection.querySelector('#modal-notes-input').value.trim();
            await persistBookField(book, { notes });
            descEl.textContent = book.description || notes || '';
            descEl.style.display = (book.description || notes) ? '' : 'none';
            Utils.toast('Notes saved.', 'success');
        });

        // ────────────────────────────────────────
        // 6. Reading Status Buttons
        // ────────────────────────────────────────
        const statusGroup = document.createElement('div');
        statusGroup.className = 'modal-status-group';
        statusGroup.innerHTML = `<span class="modal-status-label">Status:</span>`;

        const statuses = ['unread', 'reading', 'read'];
        for (const s of statuses) {
            const btn = document.createElement('button');
            btn.className = `btn btn-small ${currentStatus === s ? 'btn-primary' : 'btn-secondary'} btn-status-toggle`;
            btn.textContent = STATUS_LABELS[s];
            btn.dataset.status = s;
            if (currentStatus === s) btn.disabled = true;
            btn.addEventListener('click', async () => {
                await updateBookStatus(book, s);
                overlay.classList.remove('open');
                App.refreshCurrentTab();
            });
            statusGroup.appendChild(btn);
        }
        actionsEl.appendChild(statusGroup);

        // ────────────────────────────────────────
        // 7. Shelf Assignment
        // ────────────────────────────────────────
        const shelfGroup = document.createElement('div');
        shelfGroup.className = 'modal-shelf-group';
        const dbShelves = await DB.getAll(DB.STORES.SHELVES);
        shelfGroup.innerHTML = `<span class="modal-status-label" style="display:block;margin-bottom:8px;">Shelves:</span>`;

        const shelfCheckboxes = document.createElement('div');
        shelfCheckboxes.className = 'checkbox-group';

        const currentShelves = book.shelves || (book.shelf ? [book.shelf] : []);

        shelfCheckboxes.innerHTML = dbShelves.map(s => {
            const isChecked = currentShelves.includes(s.name) ? 'checked' : '';
            return `
                <label>
                    <input type="checkbox" value="${escapeHtml(s.name)}" ${isChecked}>
                    ${escapeHtml(s.name)}
                </label>
            `;
        }).join('');

        const saveShelvesBtn = document.createElement('button');
        saveShelvesBtn.className = 'btn btn-small btn-secondary';
        saveShelvesBtn.textContent = 'Save Shelves';
        saveShelvesBtn.style.marginTop = '8px';
        saveShelvesBtn.addEventListener('click', async () => {
            const selectedShelves = Array.from(shelfCheckboxes.querySelectorAll('input:checked')).map(cb => cb.value);
            await updateBookShelves(book, selectedShelves);
            overlay.classList.remove('open');
            App.refreshCurrentTab();
        });

        shelfGroup.appendChild(shelfCheckboxes);
        shelfGroup.appendChild(saveShelvesBtn);
        actionsEl.appendChild(shelfGroup);

        // ────────────────────────────────────────
        // 8. External Links
        // ────────────────────────────────────────
        const linksGroup = document.createElement('div');
        linksGroup.className = 'modal-enrichment-row modal-external-links';
        const searchQuery = encodeURIComponent(book.title + ' ' + book.author);
        const isbnQuery = book.isbn ? encodeURIComponent(book.isbn) : '';
        linksGroup.innerHTML = `
            <span class="modal-status-label">Links:</span>
            <a class="btn btn-small btn-secondary" href="https://openlibrary.org/search?q=${searchQuery}" target="_blank" rel="noopener" title="Search on Open Library">📚 Open Library</a>
            <a class="btn btn-small btn-secondary" href="https://www.google.com/search?q=${searchQuery}+book" target="_blank" rel="noopener" title="Search on Google">🔎 Google</a>
            <a class="btn btn-small btn-secondary" href="https://www.goodreads.com/search?q=${searchQuery}" target="_blank" rel="noopener" title="Search on Goodreads">📖 Goodreads</a>
            ${book.isbn ? `<a class="btn btn-small btn-secondary" href="https://www.amazon.co.uk/s?k=${isbnQuery}" target="_blank" rel="noopener" title="Search on Amazon">🛒 Amazon</a>` : ''}
        `;
        actionsEl.appendChild(linksGroup);

        // ────────────────────────────────────────
        // 9. Edit / Delete (all book types)
        // ────────────────────────────────────────
        const editDeleteGroup = document.createElement('div');
        editDeleteGroup.className = 'modal-edit-group';

        // Physical books get the Full Edit button
        if (book.type === 'physical') {
            const editBtn = document.createElement('button');
            editBtn.className = 'btn btn-secondary';
            editBtn.id = 'btn-modal-edit';
            editBtn.textContent = '✏️ Full Edit';
            editBtn.addEventListener('click', () => {
                PhysicalBooks.openForm(book);
                overlay.classList.remove('open');
            });
            editDeleteGroup.appendChild(editBtn);
        }

        // For merged books with multiple formats, show per-format remove buttons
        const formatEntries = [];
        if (book.hasEbook || book.type === 'ebook') formatEntries.push({ type: 'ebook', store: DB.STORES.EBOOKS, label: 'eBook' });
        if (book.hasAudiobook || book.type === 'audiobook') formatEntries.push({ type: 'audiobook', store: DB.STORES.AUDIOBOOKS, label: 'Audiobook' });
        if (book.hasPhysical || book.type === 'physical') formatEntries.push({ type: 'physical', store: DB.STORES.PHYSICAL, label: 'Physical' });

        if (formatEntries.length > 1) {
            // Multiple formats — show individual remove buttons
            for (const fmt of formatEntries) {
                const btn = document.createElement('button');
                btn.className = 'btn btn-small btn-danger';
                btn.textContent = `🗑 Remove ${fmt.label}`;
                btn.title = `Remove the ${fmt.label} copy from your library`;
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (!confirm(`Remove the ${fmt.label} copy of "${book.title}"?`)) return;
                    await removeBookFromStore(book, fmt.store);
                    overlay.classList.remove('open');
                    App.refreshCurrentTab();
                    App.updateStats();
                });
                editDeleteGroup.appendChild(btn);
            }
        }

        // Always show a main Remove / Remove All button
        const removeAllBtn = document.createElement('button');
        removeAllBtn.className = 'btn btn-danger';
        removeAllBtn.id = 'btn-modal-delete';
        removeAllBtn.textContent = formatEntries.length > 1 ? '🗑 Remove All' : '🗑 Remove Book';
        removeAllBtn.title = 'Remove this book from your library entirely';
        removeAllBtn.addEventListener('click', async () => {
            const msg = formatEntries.length > 1
                ? `Remove "${book.title}" from ALL formats (${formatEntries.map(f => f.label).join(', ')})?`
                : `Remove "${book.title}" from your library?`;
            if (!confirm(msg)) return;
            await removeBookAllStores(book);
            overlay.classList.remove('open');
            App.refreshCurrentTab();
            App.updateStats();
        });
        editDeleteGroup.appendChild(removeAllBtn);

        actionsEl.appendChild(editDeleteGroup);

        overlay.classList.add('open');
    }

    /**
     * Remove a book from a specific store
     */
    async function removeBookFromStore(book, storeName) {
        const all = await DB.getAll(storeName);
        const matchKey = Utils.matchKey(book.title, book.author);
        let removed = 0;

        for (const b of all) {
            const bKey = Utils.matchKey(b.title, b.author);
            if (bKey === matchKey || b.id === book.id) {
                // Clean up cover if it exists
                if (b.coverId) {
                    await DB.remove(DB.STORES.COVERS, b.coverId);
                }
                await DB.remove(storeName, b.id);
                removed++;
            }
        }

        const storeLabel = storeName === DB.STORES.EBOOKS ? 'eBook'
            : storeName === DB.STORES.AUDIOBOOKS ? 'Audiobook'
            : 'Physical';
        Utils.toast(`${storeLabel} copy removed.`, 'info');
        return removed;
    }

    /**
     * Remove a book from ALL stores (ebooks, audiobooks, physical)
     */
    async function removeBookAllStores(book) {
        const stores = [DB.STORES.EBOOKS, DB.STORES.AUDIOBOOKS, DB.STORES.PHYSICAL];
        const matchKey = Utils.matchKey(book.title, book.author);
        let totalRemoved = 0;

        for (const storeName of stores) {
            const all = await DB.getAll(storeName);
            for (const b of all) {
                const bKey = Utils.matchKey(b.title, b.author);
                if (bKey === matchKey || b.id === book.id) {
                    if (b.coverId) {
                        await DB.remove(DB.STORES.COVERS, b.coverId);
                    }
                    await DB.remove(storeName, b.id);
                    totalRemoved++;
                }
            }
        }

        Utils.toast(`"${book.title}" removed from library.`, 'info');
        return totalRemoved;
    }

    /**
     * Update reading status for a book across all its source stores
     */
    async function updateBookStatus(book, newStatus) {
        const now = new Date().toISOString();
        const stores = [
            { flag: book.hasEbook, store: DB.STORES.EBOOKS },
            { flag: book.hasAudiobook, store: DB.STORES.AUDIOBOOKS },
            { flag: book.hasPhysical || book.type === 'physical', store: DB.STORES.PHYSICAL }
        ];

        // Find the book across all stores and update
        for (const { flag, store } of stores) {
            if (!flag) continue;
            const all = await DB.getAll(store);
            const matchKey = Utils.matchKey(book.title, book.author);
            for (const b of all) {
                const bKey = Utils.matchKey(b.title, b.author);
                if (bKey === matchKey || b.id === book.id) {
                    b.readingStatus = newStatus;
                    if (newStatus === 'reading' && !b.dateStarted) {
                        b.dateStarted = now;
                    }
                    if (newStatus === 'read') {
                        b.dateCompleted = now;
                        if (!b.dateStarted) b.dateStarted = now;
                    }
                    if (newStatus === 'unread') {
                        b.dateStarted = null;
                        b.dateCompleted = null;
                    }
                    await DB.put(store, b);
                }
            }
        }

        Utils.toast(`Marked as "${STATUS_LABELS[newStatus]}"`, 'success');
    }

    /**
     * Update shelf assignment for a book across all its source stores
     */
    async function updateBookShelves(book, shelvesArray) {
        const stores = [
            { flag: book.hasEbook, store: DB.STORES.EBOOKS },
            { flag: book.hasAudiobook, store: DB.STORES.AUDIOBOOKS },
            { flag: book.hasPhysical || book.type === 'physical', store: DB.STORES.PHYSICAL }
        ];

        for (const { flag, store } of stores) {
            if (!flag) continue;
            const all = await DB.getAll(store);
            const matchKey = Utils.matchKey(book.title, book.author);
            for (const b of all) {
                const bKey = Utils.matchKey(b.title, b.author);
                if (bKey === matchKey || b.id === book.id) {
                    b.shelves = shelvesArray;
                    b.shelf = shelvesArray.length > 0 ? shelvesArray[0] : '';
                    await DB.put(store, b);
                }
            }
        }

        Utils.toast('Shelves updated', 'success');
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    return { renderShelf, renderWishlist, renderUnified, renderCollection, showDetail, updateBookStatus, updateBookShelves };
})();

