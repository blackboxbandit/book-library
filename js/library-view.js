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
                    coverHTML = `<img class="wishlist-card-cover" src="${coverData}" alt="${escapeHtml(item.title)}">`;
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
                    ${item.amazonUrl ? `<a class="btn btn-small btn-primary" href="${escapeHtml(item.amazonUrl)}" target="_blank" rel="noopener">Amazon</a>` : ''}
                    ${(() => { const oxUrl = Utils.getOxfamSearchUrl(item.isbn, item.title); return oxUrl ? `<a class="btn btn-small btn-oxfam" href="${escapeHtml(oxUrl)}" target="_blank" rel="noopener">Oxfam</a>` : ''; })()}
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
                if (!entry.shelf && book.shelf) entry.shelf = book.shelf;
                if (!entry.dateStarted && book.dateStarted) entry.dateStarted = book.dateStarted;
                if (!entry.dateCompleted && book.dateCompleted) entry.dateCompleted = book.dateCompleted;
            }
        };

        addBooks(ebooks, 'ebook');
        addBooks(audiobooks, 'audiobook');
        addBooks(physical, 'physical');

        // --- Fuzzy matching second pass ---
        // Catch entries that didn't merge by exact matchKey but whose titles
        // overlap (e.g. audiobook title contains ebook title or vice versa).
        const entries = Array.from(merged.entries()); // [key, entry]
        const normCache = new Map(); // key → normalised title string

        const normTitle = (entry) => {
            if (normCache.has(entry)) return normCache.get(entry);
            const t = (entry.title || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                .toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().replace(/\s+/g, ' ');
            normCache.set(entry, t);
            return t;
        };

        for (let i = 0; i < entries.length; i++) {
            const [keyA, entryA] = entries[i];
            if (!merged.has(keyA)) continue; // already merged away

            const normA = normTitle(entryA);
            if (normA.length < 4) continue; // too short for reliable matching

            for (let j = i + 1; j < entries.length; j++) {
                const [keyB, entryB] = entries[j];
                if (!merged.has(keyB)) continue; // already merged away

                const normB = normTitle(entryB);
                if (normB.length < 4) continue;

                // Check if one title contains the other
                const aContainsB = normA.includes(normB);
                const bContainsA = normB.includes(normA);
                if (!aContainsB && !bContainsA) continue;

                // Also check author overlap — at least one author word must match
                const authorWordsA = (entryA.author || '').toLowerCase().split(/\s+/).filter(w => w.length > 2);
                const authorWordsB = (entryB.author || '').toLowerCase().split(/\s+/).filter(w => w.length > 2);
                const authorOverlap = authorWordsA.some(w => authorWordsB.includes(w));
                if (!authorOverlap && authorWordsA.length > 0 && authorWordsB.length > 0) continue;

                // Merge B into A (keep the one with the shorter/cleaner title as primary)
                const [primary, secondary, secondaryKey] = normA.length <= normB.length
                    ? [entryA, entryB, keyB]
                    : [entryB, entryA, keyA];

                // Copy format flags
                if (secondary.hasEbook) primary.hasEbook = true;
                if (secondary.hasAudiobook) primary.hasAudiobook = true;
                if (secondary.hasPhysical) primary.hasPhysical = true;
                // Copy cover if missing
                if (!primary.coverId && secondary.coverId) primary.coverId = secondary.coverId;
                // Merge tags
                if (secondary.tags && secondary.tags.length) {
                    primary.tags = [...new Set([...(primary.tags || []), ...secondary.tags])];
                }
                // Merge formats
                if (secondary._allFormats && secondary._allFormats.length) {
                    primary._allFormats = [...new Set([...(primary._allFormats || []), ...secondary._allFormats])];
                }
                if (secondary.formats && secondary.formats.length) {
                    primary._allFormats = [...new Set([...(primary._allFormats || []), ...secondary.formats])];
                }
                // Keep richer metadata
                if (!primary.description && secondary.description) primary.description = secondary.description;
                if (!primary.isbn && secondary.isbn) primary.isbn = secondary.isbn;
                if (!primary.series && secondary.series) primary.series = secondary.series;
                if (!primary.publisher && secondary.publisher) primary.publisher = secondary.publisher;
                if (secondary.rating && (!primary.rating || secondary.rating > primary.rating)) primary.rating = secondary.rating;

                // Remove the secondary entry
                merged.delete(secondaryKey);

                // If we merged B into A (secondaryKey === keyB), entryA is already updated.
                // If we merged A into B (secondaryKey === keyA), we need to stop iterating on i.
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
            books = books.filter(b => b.shelf === shelfFilter);
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
            let key;
            switch (groupBy) {
                case 'shelf':
                    key = book.shelf || 'No Shelf';
                    break;
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
     * Show book detail modal
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

        // Cover
        if (book.coverId) {
            const coverData = await DB.getCover(book.coverId);
            if (coverData) {
                imgEl.src = coverData;
                imgEl.style.display = '';
            } else {
                imgEl.style.display = 'none';
            }
        } else {
            imgEl.style.display = 'none';
        }

        // Formats
        formatsEl.innerHTML = '';
        if (book.hasEbook || book.type === 'ebook') formatsEl.innerHTML += badgeHTML('ebook', 'eBook');
        if (book.hasAudiobook || book.type === 'audiobook') formatsEl.innerHTML += badgeHTML('audiobook', 'Audiobook');
        if (book.hasPhysical || book.type === 'physical') formatsEl.innerHTML += badgeHTML('physical', 'Physical');
        if (book.formats && book.formats.length) {
            formatsEl.innerHTML += `<span style="font-size: var(--text-xs); color: var(--text-tertiary); margin-left: 8px;">${book.formats.join(', ').toUpperCase()}</span>`;
        }

        // Reading status badge
        const currentStatus = book.readingStatus || 'unread';
        formatsEl.innerHTML += `<span class="format-badge badge-status-${currentStatus}" style="margin-left: 4px;">${STATUS_LABELS[currentStatus]}</span>`;

        // Meta
        const metaParts = [];
        if (book.shelf) metaParts.push(`📚 ${book.shelf}`);
        if (book.series) metaParts.push(`Series: ${book.series}${book.seriesIndex ? ' #' + book.seriesIndex : ''}`);
        if (book.publisher) metaParts.push(`Publisher: ${book.publisher}`);
        if (book.publishDate) metaParts.push(`Published: ${Utils.formatDate(book.publishDate)}`);
        if (book.language) metaParts.push(`Language: ${book.language}`);
        if (book.isbn) metaParts.push(`ISBN: ${book.isbn}`);
        if (book.rating) metaParts.push('★'.repeat(book.rating) + '☆'.repeat(5 - book.rating));
        if (book.fileCount) metaParts.push(`${book.fileCount} audio files`);
        if (book.dateStarted) metaParts.push(`Started: ${Utils.formatDate(book.dateStarted)}`);
        if (book.dateCompleted) metaParts.push(`Finished: ${Utils.formatDate(book.dateCompleted)}`);
        metaEl.innerHTML = metaParts.join(' &nbsp;·&nbsp; ');

        // Description
        descEl.textContent = book.description || book.notes || '';
        descEl.style.display = (book.description || book.notes) ? '' : 'none';

        // Tags
        tagsEl.innerHTML = (book.tags || []).map(t => `<span>${escapeHtml(t)}</span>`).join('');

        // Actions
        actionsEl.innerHTML = '';

        // Reading status buttons
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

        // Shelf assignment
        const shelfGroup = document.createElement('div');
        shelfGroup.className = 'modal-shelf-group';
        const shelves = await DB.getAll(DB.STORES.SHELVES);
        shelfGroup.innerHTML = `<span class="modal-status-label">Shelf:</span>`;
        const shelfSelect = document.createElement('select');
        shelfSelect.className = 'modal-shelf-select';
        shelfSelect.innerHTML = `<option value="">No Shelf</option>` +
            shelves.map(s => `<option value="${escapeHtml(s.name)}"${book.shelf === s.name ? ' selected' : ''}>${escapeHtml(s.name)}</option>`).join('');
        shelfSelect.addEventListener('change', async () => {
            await updateBookShelf(book, shelfSelect.value);
            overlay.classList.remove('open');
            App.refreshCurrentTab();
        });
        shelfGroup.appendChild(shelfSelect);
        actionsEl.appendChild(shelfGroup);

        // Type-specific actions
        if (book.type === 'physical') {
            const editDeleteGroup = document.createElement('div');
            editDeleteGroup.className = 'modal-edit-group';
            editDeleteGroup.innerHTML = `
                <button class="btn btn-secondary" id="btn-modal-edit">Edit</button>
                <button class="btn btn-danger" id="btn-modal-delete">Delete</button>
            `;
            actionsEl.appendChild(editDeleteGroup);

            editDeleteGroup.querySelector('#btn-modal-edit').addEventListener('click', () => {
                PhysicalBooks.openForm(book);
                overlay.classList.remove('open');
            });
            editDeleteGroup.querySelector('#btn-modal-delete').addEventListener('click', async () => {
                if (await PhysicalBooks.deleteBook(book.id)) {
                    overlay.classList.remove('open');
                    App.refreshCurrentTab();
                }
            });
        }

        overlay.classList.add('open');
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
    async function updateBookShelf(book, shelfName) {
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
                    b.shelf = shelfName || '';
                    await DB.put(store, b);
                }
            }
        }

        Utils.toast(shelfName ? `Moved to "${shelfName}"` : 'Removed from shelf', 'success');
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    return { renderShelf, renderWishlist, renderUnified, renderCollection, showDetail, updateBookStatus, updateBookShelf };
})();
