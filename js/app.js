/* ===== Main App Controller ===== */
const App = (() => {
    let currentTab = 'unified';

    function init() {
        // Init DB first
        DB.open().then(async () => {
            // Init all modules
            EbookScanner.init();
            AudiobookScanner.init();
            PhysicalBooks.init();
            Wishlist.init();
            ImportExport.init();

            // Tab navigation
            initTabs();

            // Modal close handlers
            initModals();

            // Form handling
            initForm();

            // Star rating
            initStarRating();

            // Clear data buttons
            initClearButtons();

            // Fetch cover button
            initFetchCover();

            // Search handlers
            initSearch();

            // Shelf management
            initShelfManager();

            // Register service worker
            registerSW();

            // Populate dropdowns that depend on DB data
            await populateShelfDropdowns();

            // Load initial view
            refreshCurrentTab();
            updateStats();
        }).catch(err => {
            console.error('Failed to init DB:', err);
            Utils.toast('Database error: ' + err.message, 'error');
        });
    }

    function initTabs() {
        const tabBtns = document.querySelectorAll('.tab-btn');
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                switchTab(tab);
            });
        });

        // Handle hash routing
        const hash = window.location.hash.slice(1);
        if (hash && document.getElementById('section-' + hash)) {
            switchTab(hash);
        }
    }

    function switchTab(tab) {
        currentTab = tab;
        window.location.hash = tab;

        // Update buttons
        document.querySelectorAll('.tab-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.tab === tab);
            b.setAttribute('aria-selected', b.dataset.tab === tab);
        });

        // Update sections
        document.querySelectorAll('.tab-section').forEach(s => {
            s.classList.toggle('active', s.id === 'section-' + tab);
        });

        refreshCurrentTab();
    }

    async function refreshCurrentTab() {
        // Fetch all stores once — needed for unified and per-type merged views
        const ebooks = await DB.getAll(DB.STORES.EBOOKS);
        const audiobooks = await DB.getAll(DB.STORES.AUDIOBOOKS);
        const physical = await DB.getAll(DB.STORES.PHYSICAL);
        const allBooks = { ebooks, audiobooks, physical };

        switch (currentTab) {
            case 'unified':
                const search = document.getElementById('unified-search').value;
                const sort = document.getElementById('unified-sort').value;
                const filter = document.getElementById('unified-filter-format').value;
                const statusFilter = document.getElementById('unified-filter-status').value;
                const groupBy = document.getElementById('unified-group-by').value;
                const shelfFilter = document.getElementById('unified-filter-shelf').value;
                await LibraryView.renderUnified(ebooks, audiobooks, physical, search, sort, filter, statusFilter, groupBy, shelfFilter);
                break;
            case 'ebooks':
                await LibraryView.renderCollection('ebooks', 'ebooks-shelf', allBooks, document.getElementById('ebooks-search').value);
                break;
            case 'audiobooks':
                await LibraryView.renderCollection('audiobooks', 'audiobooks-shelf', allBooks, document.getElementById('audiobooks-search').value);
                break;
            case 'physical':
                await LibraryView.renderCollection('physical', 'physical-shelf', allBooks, document.getElementById('physical-search').value);
                break;
            case 'wishlist':
                let wishes = await DB.getAll(DB.STORES.WISHLIST);
                const wsearch = document.getElementById('wishlist-search').value;
                if (wsearch) {
                    const q = Utils.normalise(wsearch);
                    wishes = wishes.filter(w => Utils.normalise(w.title).includes(q) || Utils.normalise(w.author).includes(q));
                }
                await LibraryView.renderWishlist(wishes);
                break;
            case 'settings':
                updateStats();
                break;
        }
    }

    async function updateStats() {
        const ebooks = await DB.count(DB.STORES.EBOOKS);
        const audiobooks = await DB.count(DB.STORES.AUDIOBOOKS);
        const physical = await DB.count(DB.STORES.PHYSICAL);
        const wishlist = await DB.count(DB.STORES.WISHLIST);

        document.getElementById('stat-ebooks').textContent = ebooks;
        document.getElementById('stat-audiobooks').textContent = audiobooks;
        document.getElementById('stat-physical').textContent = physical;
        document.getElementById('stat-wishlist').textContent = wishlist;

        // Reading stats
        const allBooks = [
            ...await DB.getAll(DB.STORES.EBOOKS),
            ...await DB.getAll(DB.STORES.AUDIOBOOKS),
            ...await DB.getAll(DB.STORES.PHYSICAL)
        ];
        const readingCount = allBooks.filter(b => b.readingStatus === 'reading').length;
        const readCount = allBooks.filter(b => b.readingStatus === 'read').length;
        const readingEl = document.getElementById('stat-reading');
        const readEl = document.getElementById('stat-read');
        if (readingEl) readingEl.textContent = readingCount;
        if (readEl) readEl.textContent = readCount;
    }

    function initModals() {
        // Book detail modal
        document.getElementById('modal-close').addEventListener('click', () => {
            document.getElementById('modal-overlay').classList.remove('open');
        });
        document.getElementById('modal-overlay').addEventListener('click', (e) => {
            if (e.target.id === 'modal-overlay') {
                document.getElementById('modal-overlay').classList.remove('open');
            }
        });

        // Form modal
        document.getElementById('form-modal-close').addEventListener('click', () => {
            document.getElementById('form-modal-overlay').classList.remove('open');
        });
        document.getElementById('form-modal-overlay').addEventListener('click', (e) => {
            if (e.target.id === 'form-modal-overlay') {
                document.getElementById('form-modal-overlay').classList.remove('open');
            }
        });
        document.getElementById('btn-form-cancel').addEventListener('click', () => {
            document.getElementById('form-modal-overlay').classList.remove('open');
        });

        // ESC key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.getElementById('modal-overlay').classList.remove('open');
                document.getElementById('form-modal-overlay').classList.remove('open');
                document.getElementById('help-modal-overlay').classList.remove('open');
            }
        });

        // Help modal
        document.getElementById('btn-wishlist-help').addEventListener('click', () => {
            document.getElementById('help-modal-overlay').classList.add('open');
        });
        document.getElementById('help-modal-close').addEventListener('click', () => {
            document.getElementById('help-modal-overlay').classList.remove('open');
        });
        document.getElementById('help-modal-overlay').addEventListener('click', (e) => {
            if (e.target.id === 'help-modal-overlay') {
                document.getElementById('help-modal-overlay').classList.remove('open');
            }
        });
    }

    function initForm() {
        document.getElementById('book-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const type = document.getElementById('form-book-type').value;
            const formData = {
                id: document.getElementById('form-book-id').value || '',
                title: document.getElementById('form-title').value.trim(),
                author: document.getElementById('form-author').value.trim(),
                isbn: document.getElementById('form-isbn').value.trim(),
                genre: document.getElementById('form-genre').value.trim(),
                rating: document.getElementById('form-rating').value,
                notes: document.getElementById('form-notes').value.trim(),
                amazonUrl: document.getElementById('form-amazon-url')?.value.trim() || '',
                amazonPrice: document.getElementById('form-amazon-price')?.value || '',
                oxfamPrice: document.getElementById('form-oxfam-price')?.value || ''
            };

            if (!formData.title || !formData.author) {
                Utils.toast('Title and Author are required.', 'error');
                return;
            }

            if (type === 'wishlist') {
                await Wishlist.saveItem(formData);
            } else {
                await PhysicalBooks.saveBook(formData);
            }

            document.getElementById('form-modal-overlay').classList.remove('open');
            refreshCurrentTab();
            updateStats();
        });
    }

    function initStarRating() {
        const stars = document.querySelectorAll('#form-star-rating .star');
        stars.forEach(star => {
            star.addEventListener('click', () => {
                const val = parseInt(star.dataset.val);
                document.getElementById('form-rating').value = val;
                PhysicalBooks.updateStarDisplay(val);
            });
            star.addEventListener('mouseenter', () => {
                const val = parseInt(star.dataset.val);
                stars.forEach(s => s.classList.toggle('active', parseInt(s.dataset.val) <= val));
            });
        });
        document.getElementById('form-star-rating').addEventListener('mouseleave', () => {
            const current = parseInt(document.getElementById('form-rating').value) || 0;
            PhysicalBooks.updateStarDisplay(current);
        });
    }

    function initClearButtons() {
        const clearHandlers = {
            'btn-clear-ebooks': { store: DB.STORES.EBOOKS, label: 'eBooks' },
            'btn-clear-audiobooks': { store: DB.STORES.AUDIOBOOKS, label: 'Audiobooks' },
            'btn-clear-physical': { store: DB.STORES.PHYSICAL, label: 'Physical books' },
            'btn-clear-wishlist': { store: DB.STORES.WISHLIST, label: 'Wishlist' }
        };

        for (const [btnId, info] of Object.entries(clearHandlers)) {
            document.getElementById(btnId).addEventListener('click', async () => {
                if (!confirm(`Clear all ${info.label}? This cannot be undone.`)) return;
                await DB.clearStore(info.store);
                Utils.toast(`${info.label} cleared.`, 'info');
                refreshCurrentTab();
                updateStats();
            });
        }

        document.getElementById('btn-clear-all').addEventListener('click', async () => {
            if (!confirm('Clear ALL data including covers? This cannot be undone!')) return;
            for (const store of Object.values(DB.STORES)) {
                await DB.clearStore(store);
            }
            Utils.toast('All data cleared.', 'info');
            refreshCurrentTab();
            updateStats();
        });
    }

    function initFetchCover() {
        // Look Up button — auto-populates all fields from ISBN or title+author
        document.getElementById('btn-lookup-book').addEventListener('click', () => {
            PhysicalBooks.lookupBook();
        });

        // Fetch Cover button — covers only, by ISBN
        document.getElementById('btn-fetch-cover').addEventListener('click', async () => {
            const isbn = document.getElementById('form-isbn').value.trim();
            if (!isbn) {
                Utils.toast('Enter an ISBN first.', 'error');
                return;
            }
            Utils.toast('Fetching cover…', 'info');
            const cover = await Utils.fetchCoverByISBN(isbn);
            if (cover) {
                Utils.toast('Cover found! It will be saved with the book.', 'success');
                window._fetchedCover = cover;
            } else {
                Utils.toast('No cover found for this ISBN.', 'error');
            }
        });
    }

    function initSearch() {
        const debouncedRefresh = Utils.debounce(() => refreshCurrentTab(), 300);

        ['unified-search', 'ebooks-search', 'audiobooks-search', 'physical-search', 'wishlist-search'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', debouncedRefresh);
        });

        ['unified-sort', 'unified-filter-format', 'unified-filter-status', 'unified-group-by', 'unified-filter-shelf'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', () => refreshCurrentTab());
        });
    }

    /**
     * Populate all shelf dropdown selectors
     */
    async function populateShelfDropdowns() {
        const shelves = await DB.getAll(DB.STORES.SHELVES);
        // Unified filter
        const filterEl = document.getElementById('unified-filter-shelf');
        if (filterEl) {
            const currentVal = filterEl.value;
            filterEl.innerHTML = '<option value="all">All Shelves</option>' +
                shelves.map(s => `<option value="${s.name}">${s.name}</option>`).join('');
            filterEl.value = currentVal;
        }
        // Form shelf selector
        const formEl = document.getElementById('form-shelf');
        if (formEl) {
            const currentVal = formEl.value;
            formEl.innerHTML = '<option value="">No Shelf</option>' +
                shelves.map(s => `<option value="${s.name}">${s.name}</option>`).join('');
            formEl.value = currentVal;
        }
    }

    /**
     * Shelf management UI
     */
    function initShelfManager() {
        const createBtn = document.getElementById('btn-create-shelf');
        const nameInput = document.getElementById('shelf-name-input');
        if (!createBtn || !nameInput) return;

        createBtn.addEventListener('click', async () => {
            const name = nameInput.value.trim();
            if (!name) {
                Utils.toast('Enter a shelf name.', 'error');
                return;
            }
            // Check for duplicate
            const existing = await DB.getAll(DB.STORES.SHELVES);
            if (existing.some(s => s.name.toLowerCase() === name.toLowerCase())) {
                Utils.toast('A shelf with that name already exists.', 'error');
                return;
            }
            const shelf = {
                id: Utils.generateId(),
                name,
                dateCreated: new Date().toISOString()
            };
            await DB.put(DB.STORES.SHELVES, shelf);
            nameInput.value = '';
            Utils.toast(`Shelf "${name}" created!`, 'success');
            await populateShelfDropdowns();
            await renderShelfList();
        });

        nameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                createBtn.click();
            }
        });

        renderShelfList();
    }

    async function renderShelfList() {
        const container = document.getElementById('shelf-list');
        if (!container) return;
        const shelves = await DB.getAll(DB.STORES.SHELVES);
        if (!shelves.length) {
            container.innerHTML = '<p class="settings-note">No shelves yet. Create one above!</p>';
            return;
        }
        container.innerHTML = shelves.map(s => `
            <div class="shelf-list-item" data-id="${s.id}">
                <span class="shelf-list-name">${s.name}</span>
                <button class="btn btn-small btn-danger btn-delete-shelf" data-id="${s.id}" data-name="${s.name}">Delete</button>
            </div>
        `).join('');

        container.querySelectorAll('.btn-delete-shelf').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.dataset.id;
                const name = btn.dataset.name;
                if (!confirm(`Delete shelf "${name}"? Books on this shelf will be unassigned.`)) return;

                // Unassign books from this shelf
                for (const store of [DB.STORES.EBOOKS, DB.STORES.AUDIOBOOKS, DB.STORES.PHYSICAL]) {
                    const books = await DB.getAll(store);
                    for (const book of books) {
                        if (book.shelf === name) {
                            book.shelf = '';
                            await DB.put(store, book);
                        }
                    }
                }

                await DB.remove(DB.STORES.SHELVES, id);
                Utils.toast(`Shelf "${name}" deleted.`, 'info');
                await populateShelfDropdowns();
                await renderShelfList();
                refreshCurrentTab();
            });
        });
    }

    function registerSW() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js').then(reg => {
                console.log('Service Worker registered:', reg.scope);
            }).catch(err => {
                console.log('Service Worker registration failed:', err);
            });
        }
    }

    // Public API
    return { init, refreshCurrentTab, updateStats, switchTab };
})();

// Boot the app
document.addEventListener('DOMContentLoaded', () => App.init());
