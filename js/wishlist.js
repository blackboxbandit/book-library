/* ===== Wishlist Management ===== */
const Wishlist = (() => {
    function init() {
        document.getElementById('btn-add-wishlist').addEventListener('click', () => {
            openForm();
        });

        document.getElementById('btn-import-wishlist').addEventListener('click', () => {
            document.getElementById('wishlist-file-input').click();
        });

        document.getElementById('wishlist-file-input').addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            await importWishlistFile(file);
            e.target.value = '';
        });
    }

    function openForm(item = null) {
        const overlay = document.getElementById('form-modal-overlay');
        const titleEl = document.getElementById('form-modal-title');
        const typeEl = document.getElementById('form-book-type');
        const wishlistFields = document.getElementById('form-wishlist-fields');

        titleEl.textContent = item ? 'Edit Wishlist Item' : 'Add to Wishlist';
        typeEl.value = 'wishlist';
        wishlistFields.hidden = false;

        if (item) {
            document.getElementById('form-book-id').value = item.id;
            document.getElementById('form-title').value = item.title || '';
            document.getElementById('form-author').value = item.author || '';
            document.getElementById('form-isbn').value = item.isbn || '';
            document.getElementById('form-genre').value = (item.tags || []).join(', ');
            document.getElementById('form-rating').value = item.rating || 0;
            document.getElementById('form-notes').value = item.notes || '';
            document.getElementById('form-amazon-url').value = item.amazonUrl || '';
            document.getElementById('form-amazon-price').value = item.amazonPrice || '';
            document.getElementById('form-oxfam-price').value = item.oxfamPrice || '';
            PhysicalBooks.updateStarDisplay(item.rating || 0);
        } else {
            document.getElementById('book-form').reset();
            document.getElementById('form-book-id').value = '';
            document.getElementById('form-rating').value = '0';
            PhysicalBooks.updateStarDisplay(0);
        }

        overlay.classList.add('open');
    }

    async function saveItem(formData) {
        const id = formData.id || Utils.generateId();
        const isNew = !formData.id;

        let existingItem = null;
        if (!isNew) {
            existingItem = await DB.getById(DB.STORES.WISHLIST, id);
        }

        // Handle cover
        let coverId = null;
        const coverInput = document.getElementById('form-cover-upload');
        if (coverInput.files && coverInput.files[0]) {
            coverId = 'cover_' + id;
            const dataURL = await Utils.compressImage(coverInput.files[0]);
            if (dataURL) await DB.saveCover(coverId, dataURL);
        } else if (existingItem) {
            coverId = existingItem.coverId;
        }

        // Price history tracking
        const priceHistory = (existingItem && existingItem.priceHistory) ? [...existingItem.priceHistory] : [];
        const amazonPrice = parseFloat(formData.amazonPrice) || null;
        const oxfamPrice = parseFloat(formData.oxfamPrice) || null;

        if (amazonPrice || oxfamPrice) {
            priceHistory.push({
                date: new Date().toISOString(),
                amazonPrice,
                oxfamPrice
            });
        }

        // Sale detection: current price ≤ 70% of max historical price
        let onSale = false;
        if (priceHistory.length > 1) {
            const allAmazonPrices = priceHistory.map(p => p.amazonPrice).filter(Boolean);
            const allOxfamPrices = priceHistory.map(p => p.oxfamPrice).filter(Boolean);
            const maxAmazon = Math.max(...allAmazonPrices, 0);
            const maxOxfam = Math.max(...allOxfamPrices, 0);
            const currentAmazon = amazonPrice || Infinity;
            const currentOxfam = oxfamPrice || Infinity;
            const currentMin = Math.min(currentAmazon, currentOxfam);
            const maxHistorical = Math.max(maxAmazon, maxOxfam);

            if (maxHistorical > 0 && currentMin <= maxHistorical * 0.7) {
                onSale = true;
            }
        }

        const item = {
            id,
            type: 'wishlist',
            title: formData.title,
            author: formData.author,
            isbn: formData.isbn || '',
            tags: formData.genre ? formData.genre.split(',').map(t => t.trim()).filter(Boolean) : [],
            rating: parseInt(formData.rating) || 0,
            notes: formData.notes || '',
            amazonUrl: formData.amazonUrl || '',
            amazonPrice,
            oxfamPrice,
            priceHistory,
            onSale,
            coverId,
            matchKey: Utils.matchKey(formData.title, formData.author),
            dateAdded: isNew ? new Date().toISOString() : (existingItem ? existingItem.dateAdded : new Date().toISOString())
        };

        await DB.put(DB.STORES.WISHLIST, item);
        Utils.toast(isNew ? 'Added to wishlist!' : 'Wishlist item updated!', 'success');
        return item;
    }

    async function deleteItem(id) {
        if (!confirm('Remove from wishlist?')) return false;
        const item = await DB.getById(DB.STORES.WISHLIST, id);
        if (item && item.coverId) {
            await DB.remove(DB.STORES.COVERS, item.coverId);
        }
        await DB.remove(DB.STORES.WISHLIST, id);
        Utils.toast('Removed from wishlist.', 'info');
        return true;
    }

    /**
     * Import wishlist from JSON or CSV file
     * Expected JSON format: array of { title, author, amazonUrl, amazonPrice, oxfamPrice, isbn, imageUrl, category }
     * CSV: title,author,amazonUrl,amazonPrice,oxfamPrice,isbn
     */
    async function importWishlistFile(file) {
        try {
            const text = await Utils.readFileAsText(file);
            let items = [];

            if (file.name.endsWith('.json')) {
                const parsed = Utils.sanitizeImportedObject(JSON.parse(text));
                items = Array.isArray(parsed) ? parsed : (parsed.items || parsed.wishlist || []);
            } else if (file.name.endsWith('.csv')) {
                const parseCSVLine = (line) => {
                    const result = [];
                    let current = '';
                    let inQuotes = false;
                    for (let i = 0; i < line.length; i++) {
                        const char = line[i];
                        if (char === '"' && line[i + 1] === '"') {
                            current += '"';
                            i++;
                        } else if (char === '"') {
                            inQuotes = !inQuotes;
                        } else if (char === ',' && !inQuotes) {
                            result.push(current.trim());
                            current = '';
                        } else {
                            current += char;
                        }
                    }
                    result.push(current.trim());
                    return result;
                };

                const lines = text.split('\n').filter(l => l.trim());
                if (lines.length > 0) {
                    const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase());
                    for (let i = 1; i < lines.length; i++) {
                        const vals = parseCSVLine(lines[i]);
                        const obj = {};
                        headers.forEach((h, idx) => { obj[h] = vals[idx] || ''; });
                        items.push(obj);
                    }
                }
            }

            if (!items.length) {
                Utils.toast('No items found in file.', 'error');
                return;
            }

            // Non-book category keywords to filter out at import time (safety net)
            const nonBookCategories = [
                'electronics', 'kitchen', 'home', 'clothing', 'shoes', 'toys',
                'sports', 'beauty', 'health', 'automotive', 'tools', 'garden',
                'pet', 'grocery', 'video game', 'software', 'appliance',
                'furniture', 'jewellery', 'jewelry', 'watch', 'luggage'
            ];

            const existingKeys = await DB.getMatchKeys(DB.STORES.WISHLIST);
            let imported = 0;
            let filtered = 0;

            for (const item of items) {
                const title = item.title || item.Title || item.name || '';
                const author = item.author || item.Author || '';
                if (!title) continue;

                // Filter non-book items by category or title
                const category = (item.category || '').toLowerCase();
                const titleLower = title.toLowerCase();

                // If explicit non-book category, or unknown/empty category and title has non-book keyword
                if (category !== 'book') {
                    let isNonBook = false;
                    if (category && category !== 'unknown') {
                        isNonBook = nonBookCategories.some(kw => category.includes(kw) || titleLower.includes(kw));
                    } else {
                        isNonBook = nonBookCategories.some(kw => titleLower.includes(kw));
                    }

                    if (isNonBook) {
                        filtered++;
                        continue;
                    }
                }

                const key = Utils.matchKey(title, author);
                if (existingKeys.has(key)) continue;

                const id = Utils.generateId();
                const amazonPrice = parseFloat(item.amazonPrice || item.price || item.Price || '') || null;
                const oxfamPrice = parseFloat(item.oxfamPrice || '') || null;
                const imageUrlRaw = item.imageUrl || item.image_url || item.coverUrl || '';
                const imageUrl = Utils.isValidUrl(imageUrlRaw) ? imageUrlRaw : '';

                const rawAmazonUrl = item.amazonUrl || item.url || item.URL || item.link || '';
                const cleanAmazonUrl = Utils.isValidUrl(rawAmazonUrl) ? rawAmazonUrl : '';

                const record = {
                    id,
                    type: 'wishlist',
                    title: Utils.sanitizeString(title),
                    author: Utils.sanitizeString(author),
                    isbn: Utils.sanitizeString(item.isbn || item.ISBN || item.asin || item.ASIN || ''),
                    tags: [],
                    rating: 0,
                    notes: Utils.sanitizeString(item.notes || ''),
                    amazonUrl: cleanAmazonUrl,
                    amazonPrice,
                    oxfamPrice,
                    priceHistory: amazonPrice || oxfamPrice ? [{ date: new Date().toISOString(), amazonPrice, oxfamPrice }] : [],
                    onSale: false,
                    coverId: null,
                    matchKey: key,
                    dateAdded: new Date().toISOString()
                };

                await DB.put(DB.STORES.WISHLIST, record);
                existingKeys.add(key);
                imported++;

                // Try to fetch cover: prefer imageUrl from Amazon, fallback to ISBN lookup
                const recordId = id;
                if (imageUrl) {
                    Utils.fetchCoverFromUrl(imageUrl).then(async (coverData) => {
                        if (coverData) {
                            const coverId = 'cover_' + recordId;
                            await DB.saveCover(coverId, coverData);
                            record.coverId = coverId;
                            await DB.put(DB.STORES.WISHLIST, record);
                        } else if (record.isbn) {
                            // Fallback to Open Library if Amazon image failed
                            const olCover = await Utils.fetchCoverByISBN(record.isbn);
                            if (olCover) {
                                const coverId = 'cover_' + recordId;
                                await DB.saveCover(coverId, olCover);
                                record.coverId = coverId;
                                await DB.put(DB.STORES.WISHLIST, record);
                            }
                        }
                        // Refresh the view once covers are loaded
                        if (typeof App !== 'undefined') App.refreshCurrentTab();
                    }).catch(() => { });
                } else if (record.isbn) {
                    Utils.fetchCoverByISBN(record.isbn).then(async (coverData) => {
                        if (coverData) {
                            const coverId = 'cover_' + recordId;
                            await DB.saveCover(coverId, coverData);
                            record.coverId = coverId;
                            await DB.put(DB.STORES.WISHLIST, record);
                        }
                    }).catch(() => { });
                }

                // Background Oxfam price lookup
                if (!record.oxfamPrice) {
                    Utils.lookupOxfamPrice(record.isbn, title).then(async (result) => {
                        if (result && result.price) {
                            record.oxfamPrice = result.price;
                            record.oxfamUrl = result.url || '';
                            // Update price history
                            if (!record.priceHistory) record.priceHistory = [];
                            record.priceHistory.push({
                                date: new Date().toISOString(),
                                amazonPrice: record.amazonPrice || null,
                                oxfamPrice: result.price
                            });
                            await DB.put(DB.STORES.WISHLIST, record);
                            if (typeof App !== 'undefined') App.refreshCurrentTab();
                        }
                    }).catch(() => { });
                }
            }

            let msg = `Imported ${imported} wishlist items!`;
            if (filtered > 0) msg += ` (${filtered} non-book items filtered out)`;
            Utils.toast(msg, 'success');
            if (typeof App !== 'undefined') App.refreshCurrentTab();
        } catch (err) {
            console.error('Wishlist import error:', err);
            Utils.toast('Error importing wishlist: ' + err.message, 'error');
        }
    }

    return { init, openForm, saveItem, deleteItem, importWishlistFile };
})();
