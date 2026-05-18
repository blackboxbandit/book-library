/* ===== Physical Books Management ===== */
const PhysicalBooks = (() => {
    // State
    let _fetchedCover = null; // Holds a cover fetched from lookup

    function init() {
        document.getElementById('btn-add-physical').addEventListener('click', () => {
            openForm();
        });

        // Wire up cover suggestions
        const suggestBtn = document.getElementById('btn-suggest-cover');
        if (suggestBtn) {
            suggestBtn.addEventListener('click', handleSuggestCover);
        }
    }

    async function handleSuggestCover() {
        const title = document.getElementById('form-title').value;
        if (!title) {
            Utils.toast('Please enter a title to search for covers', 'error');
            return;
        }

        const btn = document.getElementById('btn-suggest-cover');
        const container = document.getElementById('cover-suggestions');

        btn.disabled = true;
        btn.textContent = 'Searching...';
        container.innerHTML = '';

        try {
            const covers = await Utils.suggestCovers(title);
            if (covers && covers.length > 0) {
                covers.forEach(url => {
                    const img = document.createElement('img');
                    img.src = url;
                    img.style.height = '120px';
                    img.style.cursor = 'pointer';
                    img.style.borderRadius = '4px';
                    img.style.border = '2px solid transparent';

                    img.addEventListener('click', async () => {
                        // Deselect others
                        Array.from(container.children).forEach(c => c.style.borderColor = 'transparent');
                        img.style.borderColor = 'var(--accent)';

                        Utils.toast('Fetching cover...', 'info');
                        const coverData = await Utils.fetchCoverFromUrl(url);
                        if (coverData) {
                            _fetchedCover = coverData;
                            Utils.toast('Cover selected', 'success');
                        } else {
                            Utils.toast('Failed to load cover', 'error');
                        }
                    });

                    container.appendChild(img);
                });
            } else {
                container.textContent = 'No covers found.';
            }
        } catch (e) {
            console.error(e);
            container.textContent = 'Error fetching covers.';
        } finally {
            btn.disabled = false;
            btn.textContent = 'Suggest Cover';
        }
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
        _fetchedCover = null;

        const container = document.getElementById('cover-suggestions');
        if (container) container.innerHTML = '';

        if (book) {
            document.getElementById('form-book-id').value = book.id;
            document.getElementById('form-title').value = book.title || '';
            document.getElementById('form-author').value = book.author || '';
            document.getElementById('form-isbn').value = book.isbn || '';
            document.getElementById('form-genre').value = (book.tags || []).join(', ');
            document.getElementById('form-rating').value = book.rating || 0;
            document.getElementById('form-notes').value = book.notes || '';
            document.getElementById('form-reading-status').value = book.readingStatus || 'unread';
            document.getElementById('form-shelf').value = book.shelf || '';
            updateStarDisplay(book.rating || 0);
        } else {
            document.getElementById('book-form').reset();
            document.getElementById('form-book-id').value = '';
            document.getElementById('form-rating').value = '0';
            document.getElementById('form-reading-status').value = 'unread';
            document.getElementById('form-shelf').value = '';
            updateStarDisplay(0);
        }

        // Clear any previously fetched cover
        _fetchedCover = null;

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
        const shelf = document.getElementById('form-shelf').value || '';
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
            shelf,
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

    function getFetchedCover() {
        return _fetchedCover;
    }

    return { init, openForm, saveBook, deleteBook, updateStarDisplay, lookupBook, getFetchedCover };
})();
