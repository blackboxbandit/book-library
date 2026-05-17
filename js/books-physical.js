/* ===== Physical Books Management ===== */
const PhysicalBooks = (() => {
    let _lookupAborted = false;

    function init() {
        document.getElementById('btn-add-physical').addEventListener('click', () => {
            openForm();
        });

        // Import JSON button
        document.getElementById('btn-import-physical').addEventListener('click', () => {
            document.getElementById('physical-file-input').click();
        });
        document.getElementById('physical-file-input').addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            await importFromJSON(file);
            e.target.value = '';
        });

        // Lookup All Covers button
        document.getElementById('btn-lookup-all-physical').addEventListener('click', () => {
            batchLookupAll();
        });
    }

    function openForm(book = null) {
        const overlay = document.getElementById('form-modal-overlay');
        const titleEl = document.getElementById('form-modal-title');
        const typeEl = document.getElementById('form-book-type');
        const wishlistFields = document.getElementById('form-wishlist-fields');

        titleEl.textContent = book ? 'Edit Book' : 'Add Physical Book';
        typeEl.value = 'physical';
        wishlistFields.hidden = true;

        // Clear lookup results
        const lookupResults = document.getElementById('lookup-results');
        if (lookupResults) {
            lookupResults.innerHTML = '';
            lookupResults.hidden = true;
        }

        if (book) {
            document.getElementById('form-book-id').value = book.id;
            document.getElementById('form-title').value = book.title || '';
            document.getElementById('form-author').value = book.author || '';
            document.getElementById('form-isbn').value = book.isbn || '';
            document.getElementById('form-genre').value = (book.tags || []).join(', ');
            document.getElementById('form-rating').value = book.rating || 0;
            document.getElementById('form-notes').value = book.notes || '';
            document.getElementById('form-reading-status').value = book.readingStatus || 'unread';

            // Set checkboxes for shelves
            const shelves = book.shelves || (book.shelf ? [book.shelf] : []);
            document.querySelectorAll('#form-shelves input[type="checkbox"]').forEach(cb => {
                cb.checked = shelves.includes(cb.value);
            });

            updateStarDisplay(book.rating || 0);
        } else {
            document.getElementById('book-form').reset();
            document.getElementById('form-book-id').value = '';
            document.getElementById('form-rating').value = '0';
            document.getElementById('form-reading-status').value = 'unread';

            document.querySelectorAll('#form-shelves input[type="checkbox"]').forEach(cb => {
                cb.checked = false;
            });

            updateStarDisplay(0);
        }

        // Clear any previously fetched cover
        let _fetchedCover = null;

        overlay.classList.add('open');
    }

    function updateStarDisplay(rating) {
        const stars = document.querySelectorAll('#form-star-rating .star');
        stars.forEach(s => {
            s.classList.toggle('active', parseInt(s.dataset.val) <= rating);
        });
    }

    /**
     * Look up book information via Open Library.
     * Priority: ISBN → title+author search
     */
    async function lookupBook() {
        const isbn = document.getElementById('form-isbn').value.trim();
        const title = document.getElementById('form-title').value.trim();
        const author = document.getElementById('form-author').value.trim();
        const lookupBtn = document.getElementById('btn-lookup-book');
        const resultsEl = document.getElementById('lookup-results');

        // Disable button, show loading state
        lookupBtn.disabled = true;
        lookupBtn.textContent = '⏳ Looking up…';
        resultsEl.innerHTML = '';
        resultsEl.hidden = true;

        try {
            // Strategy 1: ISBN lookup (ISBN-10 or ISBN-13)
            if (isbn) {
                Utils.toast('Looking up ISBN…', 'info');
                const result = await Utils.lookupByISBN(isbn);
                if (result) {
                    applyLookupResult(result);
                    Utils.toast('Book found! Fields populated.', 'success');
                    return;
                } else {
                    Utils.toast('No results for that ISBN. Try title/author instead.', 'error');
                    return;
                }
            }

            // Strategy 2: Title + Author search
            if (!title && !author) {
                Utils.toast('Enter an ISBN, title, or author to look up.', 'error');
                return;
            }

            const query = [title, author].filter(Boolean).join(' ');
            Utils.toast('Searching…', 'info');
            const results = await Utils.searchBooks(query);

            if (!results.length) {
                Utils.toast('No books found. Try a different search.', 'error');
                return;
            }

            // If only one result, apply it directly
            if (results.length === 1) {
                applyLookupResult(results[0]);
                Utils.toast('Book found! Fields populated.', 'success');
                return;
            }

            // Multiple results — show picker
            showLookupResults(results);
        } finally {
            lookupBtn.disabled = false;
            lookupBtn.textContent = '🔍 Look Up';
        }
    }

    /**
     * Show multiple search results for the user to pick from
     */
    function showLookupResults(results) {
        const container = document.getElementById('lookup-results');
        container.innerHTML = `
            <div class="lookup-header">
                <span>Select a book:</span>
                <button type="button" class="lookup-dismiss" id="lookup-dismiss-btn">✕</button>
            </div>
        `;

        document.getElementById('lookup-dismiss-btn').addEventListener('click', () => {
            container.hidden = true;
        });

        results.forEach((r, idx) => {
            const item = document.createElement('div');
            item.className = 'lookup-item';
            item.tabIndex = 0;

            const coverHtml = r.coverUrl && Utils.isValidUrl(r.coverUrl)
                ? `<img src="${Utils.escapeHtml(r.coverUrl)}" alt="" class="lookup-thumb" onerror="this.style.display='none'">`
                : `<div class="lookup-thumb lookup-thumb-placeholder">📖</div>`;

            item.innerHTML = `
                ${coverHtml}
                <div class="lookup-item-info">
                    <div class="lookup-item-title">${escapeHtml(r.title)}</div>
                    <div class="lookup-item-author">${escapeHtml(r.author)}</div>
                    ${r.isbn ? `<div class="lookup-item-isbn">ISBN: ${escapeHtml(r.isbn)}</div>` : ''}
                </div>
            `;

            item.addEventListener('click', () => {
                applyLookupResult(r);
                container.hidden = true;
                Utils.toast('Book selected! Fields populated.', 'success');
            });

            item.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    item.click();
                }
            });

            container.appendChild(item);
        });

        container.hidden = false;
    }

    /**
     * Apply a lookup result to the form fields
     */
    async function applyLookupResult(result) {
        if (result.title) {
            document.getElementById('form-title').value = result.title;
        }
        if (result.author) {
            document.getElementById('form-author').value = result.author;
        }
        if (result.isbn) {
            document.getElementById('form-isbn').value = result.isbn;
        }
        if (result.tags && result.tags.length) {
            document.getElementById('form-genre').value = result.tags.join(', ');
        }
        if (result.description) {
            const notesEl = document.getElementById('form-notes');
            if (!notesEl.value.trim()) {
                notesEl.value = result.description;
            }
        }

        // Fetch and store the cover
        if (result.coverUrl && Utils.isValidUrl(result.coverUrl)) {
            try {
                const coverData = await Utils.fetchCoverFromUrl(result.coverUrl);
                if (coverData) {
                    _fetchedCover = coverData;
                }
            } catch {
                // Cover fetch is best-effort
            }
        }
    }

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    async function saveBook(formData) {
        const id = formData.id || Utils.generateId();
        const isNew = !formData.id;

        let coverId = null;
        let existing = !isNew ? await DB.getById(DB.STORES.PHYSICAL, id) : null;
        const coverInput = document.getElementById('form-cover-upload');
        if (coverInput.files && coverInput.files[0]) {
            coverId = 'cover_' + id;
            const dataURL = await Utils.compressImage(coverInput.files[0]);
            if (dataURL) await DB.saveCover(coverId, dataURL);
        } else if (typeof _fetchedCover !== 'undefined' && _fetchedCover) {
            // Use cover fetched from lookup
            coverId = 'cover_' + id;
            await DB.saveCover(coverId, _fetchedCover);
            _fetchedCover = null;
        } else if (existing) {
            coverId = existing.coverId;
        }

        const readingStatus = document.getElementById('form-reading-status').value || 'unread';
        const shelves = Array.from(document.querySelectorAll('#form-shelves input[type="checkbox"]:checked')).map(cb => cb.value);
        const now = new Date().toISOString();

        const book = {
            id,
            type: 'physical',
            title: formData.title,
            author: formData.author,
            isbn: formData.isbn || '',
            tags: formData.genre ? formData.genre.split(',').map(t => t.trim()).filter(Boolean) : [],
            rating: parseInt(formData.rating) || 0,
            notes: formData.notes || '',
            coverId,
            matchKey: Utils.matchKey(formData.title, formData.author),
            dateAdded: isNew ? now : (existing?.dateAdded || now),
            readingStatus,
            shelves,
            shelf: shelves.length > 0 ? shelves[0] : '', // Keep for backward compatibility
            dateStarted: readingStatus === 'reading' ? (existing?.dateStarted || now) : (existing?.dateStarted || null),
            dateCompleted: readingStatus === 'read' ? (existing?.dateCompleted || now) : null
        };

        await DB.put(DB.STORES.PHYSICAL, book);
        Utils.toast(isNew ? 'Book added!' : 'Book updated!', 'success');
        return book;
    }

    async function deleteBook(id) {
        if (!confirm('Delete this book?')) return false;
        const book = await DB.getById(DB.STORES.PHYSICAL, id);
        if (book && book.coverId) {
            await DB.remove(DB.STORES.COVERS, book.coverId);
        }
        await DB.remove(DB.STORES.PHYSICAL, id);
        Utils.toast('Book deleted.', 'info');
        return true;
    }

    /**
     * Import physical books from a JSON file.
     * Accepts an array of { title, author, isbn } objects.
     * Skips duplicates based on matchKey.
     */
    async function importFromJSON(file) {
        try {
            const text = await Utils.readFileAsText(file);
            const raw = Utils.sanitizeImportedObject(JSON.parse(text));

            // Accept both a bare array or an object with a "books" key
            const items = Array.isArray(raw) ? raw : (Array.isArray(raw.books) ? raw.books : null);
            if (!items || !items.length) {
                Utils.toast('No books found in the file. Expected a JSON array of { title, author }.', 'error');
                return;
            }

            // Get existing match keys for dedup
            const existingKeys = await DB.getMatchKeys(DB.STORES.PHYSICAL);
            const now = new Date().toISOString();
            let added = 0;
            let skipped = 0;

            const booksToAdd = [];
            for (const item of items) {
                const title = (item.title || '').trim();
                const author = (item.author || '').trim();
                if (!title) { skipped++; continue; }

                const key = Utils.matchKey(title, author);
                if (existingKeys.has(key)) {
                    skipped++;
                    continue;
                }

                // Mark as seen so we don't add duplicates within the same import
                existingKeys.add(key);

                const id = Utils.generateId();
                booksToAdd.push({
                    id,
                    type: 'physical',
                    title,
                    author,
                    isbn: (item.isbn || '').toString().trim(),
                    tags: [],
                    rating: 0,
                    notes: '',
                    coverId: null,
                    matchKey: key,
                    dateAdded: now,
                    readingStatus: 'unread',
                    shelf: '',
                    dateStarted: null,
                    dateCompleted: null
                });
                added++;
            }

            if (booksToAdd.length) {
                await DB.putMany(DB.STORES.PHYSICAL, booksToAdd);
            }

            Utils.toast(`Imported ${added} book${added !== 1 ? 's' : ''}${skipped ? ` (${skipped} skipped as duplicates)` : ''}.`, 'success');

            if (typeof App !== 'undefined') {
                App.refreshCurrentTab();
                App.updateStats();
            }
        } catch (err) {
            console.error('Physical books import error:', err);
            Utils.toast('Import failed: ' + err.message, 'error');
        }
    }

    /**
     * Batch lookup ISBNs and cover art for all physical books missing them.
     * Uses Open Library search API. Rate-limited to ~1 request per second
     * to avoid throttling.
     */
    async function batchLookupAll() {
        const books = await DB.getAll(DB.STORES.PHYSICAL);
        // Only process books that need data
        const needsLookup = books.filter(b => !b.isbn || !b.coverId);

        if (!needsLookup.length) {
            Utils.toast('All books already have ISBNs and covers!', 'success');
            return;
        }

        const confirmed = confirm(
            `Look up ${needsLookup.length} book${needsLookup.length !== 1 ? 's' : ''} on Open Library?\n\n` +
            `This will search for ISBNs and cover art for books missing them. ` +
            `It may take a few minutes due to API rate limiting.\n\n` +
            `You can close this tab to cancel at any time.`
        );
        if (!confirmed) return;

        _lookupAborted = false;

        // Show progress bar
        const progressEl = document.getElementById('physical-lookup-progress');
        const fillEl = document.getElementById('physical-progress-fill');
        const textEl = document.getElementById('physical-progress-text');
        const lookupBtn = document.getElementById('btn-lookup-all-physical');

        progressEl.hidden = false;
        lookupBtn.disabled = true;
        lookupBtn.textContent = '⏳ Looking up…';

        let found = 0;
        let notFound = 0;
        let errors = 0;

        for (let i = 0; i < needsLookup.length; i++) {
            if (_lookupAborted) break;

            const book = needsLookup[i];
            const pct = Math.round(((i + 1) / needsLookup.length) * 100);
            fillEl.style.width = pct + '%';
            textEl.textContent = `Looking up "${book.title}" (${i + 1}/${needsLookup.length})…`;

            try {
                // Search by title + author
                const query = [book.title, book.author].filter(Boolean).join(' ');
                const results = await Utils.searchBooks(query);

                if (results && results.length) {
                    const best = results[0];
                    let updated = false;

                    // Update ISBN if missing
                    if (!book.isbn && best.isbn) {
                        book.isbn = best.isbn;
                        updated = true;
                    }

                    // Update tags if missing
                    if ((!book.tags || !book.tags.length) && best.tags && best.tags.length) {
                        book.tags = best.tags;
                        updated = true;
                    }

                    // Fetch cover if missing
                    if (!book.coverId && best.coverUrl && Utils.isValidUrl(best.coverUrl)) {
                        try {
                            const coverData = await Utils.fetchCoverFromUrl(best.coverUrl);
                            if (coverData) {
                                const coverId = 'cover_' + book.id;
                                await DB.saveCover(coverId, coverData);
                                book.coverId = coverId;
                                updated = true;
                            }
                        } catch {
                            // Cover fetch is best-effort
                        }
                    }

                    if (updated) {
                        book.matchKey = Utils.matchKey(book.title, book.author);
                        await DB.put(DB.STORES.PHYSICAL, book);
                        found++;
                    } else {
                        notFound++;
                    }
                } else {
                    notFound++;
                }
            } catch (err) {
                console.warn(`Lookup failed for "${book.title}":`, err.message || err);
                errors++;
            }

            // Rate limit: wait 1.2s between requests to avoid Open Library throttling
            if (i < needsLookup.length - 1 && !_lookupAborted) {
                await new Promise(r => setTimeout(r, 1200));
            }
        }

        // Complete
        fillEl.style.width = '100%';
        textEl.textContent = `Done! ${found} enriched, ${notFound} not found, ${errors} errors.`;
        lookupBtn.disabled = false;
        lookupBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="7" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            Lookup All Covers`;

        Utils.toast(
            `Lookup complete: ${found} enriched, ${notFound} not found${errors ? `, ${errors} errors` : ''}.`,
            found > 0 ? 'success' : 'info'
        );

        // Hide progress after a delay
        setTimeout(() => { progressEl.hidden = true; }, 5000);

        // Refresh the view
        if (typeof App !== 'undefined') {
            App.refreshCurrentTab();
            App.updateStats();
        }
    }

    return { init, openForm, saveBook, deleteBook, updateStarDisplay, lookupBook, importFromJSON, batchLookupAll };
})();
