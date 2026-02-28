/* ===== Main App Controller ===== */
const App = (() => {
    let currentTab = 'unified';

    function init() {
        // Init DB first
        DB.open().then(() => {
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

            // Load initial view
            refreshCurrentTab();
            updateStats();

            // Register service worker
            registerSW();
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
                await LibraryView.renderUnified(ebooks, audiobooks, physical, search, sort, filter);
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
        document.getElementById('stat-ebooks').textContent = await DB.count(DB.STORES.EBOOKS);
        document.getElementById('stat-audiobooks').textContent = await DB.count(DB.STORES.AUDIOBOOKS);
        document.getElementById('stat-physical').textContent = await DB.count(DB.STORES.PHYSICAL);
        document.getElementById('stat-wishlist').textContent = await DB.count(DB.STORES.WISHLIST);
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

        ['unified-sort', 'unified-filter-format'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', () => refreshCurrentTab());
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
