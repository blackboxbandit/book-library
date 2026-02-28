/**
 * Amazon Wishlist Exporter — Browser Console Script
 * ==================================================
 *
 * HOW TO USE:
 * 1. Go to your Amazon wishlist page in your browser
 *    (e.g. https://www.amazon.co.uk/hz/wishlist/ls/XXXXXXXXXX)
 * 2. SCROLL DOWN to load ALL items (Amazon uses infinite scroll)
 *    Keep scrolling until all items are visible
 * 3. Open the browser Developer Console:
 *    - Chrome/Edge: Ctrl+Shift+J (Windows) or Cmd+Option+J (Mac)
 *    - Firefox: Ctrl+Shift+K (Windows) or Cmd+Option+K (Mac)
 *    - Safari: Cmd+Option+C (enable Developer menu in Preferences first)
 * 4. Paste this ENTIRE script into the console and press Enter
 * 5. A JSON file will download automatically
 * 6. Import the JSON file into the Book Library app via the Wishlist tab
 *
 * NOTES:
 * - Works on amazon.co.uk, amazon.com, and other Amazon domains
 * - Make sure ALL items are loaded (scroll to bottom first!)
 * - If items are missing, scroll more and run the script again
 * - Non-book items (electronics, clothing, etc.) are automatically filtered out
 */

(function () {
    'use strict';

    /**
     * Detect whether an item is likely a book based on available signals.
     * Returns { isBook: boolean, category: string }
     */
    function detectBook(el, byLineText, url) {
        let category = '';

        // --- Signal 1: Format/binding text from Amazon ---
        // Amazon shows format info like "Paperback", "Hardcover", "Kindle Edition",
        // "Audible Audiobook", "Board book", etc.
        const formatEl = el.querySelector(
            '[id^="itemSubtitle_"], .a-size-small.a-color-secondary, ' +
            '.a-row .a-size-base.a-color-secondary, .a-text-normal'
        );
        if (formatEl) {
            const formatText = formatEl.textContent.trim().toLowerCase();
            const bookFormats = [
                'paperback', 'hardcover', 'hardback', 'kindle edition', 'kindle',
                'audible audiobook', 'audible', 'audiobook', 'audio cd',
                'board book', 'spiral-bound', 'mass market paperback',
                'library binding', 'loose leaf', 'comic', 'graphic novel'
            ];
            for (const fmt of bookFormats) {
                if (formatText.includes(fmt)) {
                    category = fmt.charAt(0).toUpperCase() + fmt.slice(1);
                    return { isBook: true, category };
                }
            }
        }

        // --- Signal 2: By-line text patterns ---
        // Books typically have "by Author Name" while other products have brand names
        if (byLineText) {
            const lower = byLineText.toLowerCase();
            // Strong positive signals for books
            const bookRoles = ['author', 'narrator', 'illustrator', 'editor', 'translator', 'foreword'];
            if (bookRoles.some(role => lower.includes(role))) {
                category = 'Book';
                return { isBook: true, category };
            }
        }

        // --- Signal 3: ASIN pattern ---
        // Book ASINs are typically ISBN-10s (start with 0 or 1, all digits)
        // Non-book ASINs start with B0 and are alphanumeric
        if (url) {
            const asinMatch = url.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/);
            if (asinMatch) {
                const asin = asinMatch[1];
                // ISBN-10 pattern: 10 digits (or 9 digits + X)
                if (/^\d{9}[\dX]$/i.test(asin)) {
                    category = category || 'Book';
                    return { isBook: true, category };
                }
            }
        }

        // --- Signal 4: Check for non-book category indicators ---
        const allText = el.textContent.toLowerCase();
        const nonBookKeywords = [
            'electronics', 'kitchen', 'home & garden', 'clothing',
            'shoes', 'toys & games', 'sports', 'beauty', 'health',
            'automotive', 'tools', 'garden', 'pet supplies', 'grocery',
            'video game', 'blu-ray', 'dvd', 'software', 'pc game',
            'usb', 'wireless', 'bluetooth', 'charger', 'adapter',
            'headphones', 'speaker', 'camera', 'laptop', 'tablet'
        ];
        if (nonBookKeywords.some(kw => allText.includes(kw))) {
            return { isBook: false, category: 'Non-book' };
        }

        // --- Signal 5: If by-line starts with "by " it's likely a book ---
        if (byLineText && /^by\s+/i.test(byLineText)) {
            category = 'Book';
            return { isBook: true, category };
        }

        // Default: include it (err on the side of inclusion for wishlists)
        return { isBook: true, category: 'Unknown' };
    }

    /**
     * Upgrade an Amazon thumbnail URL to a higher-resolution version.
     * Amazon image URLs use size codes like ._SX50_ or ._SS135_
     * We replace with ._SL500_ for a good quality cover image.
     */
    function getHighResImageUrl(imageUrl) {
        if (!imageUrl) return '';
        // Replace Amazon image size parameters with larger version
        return imageUrl.replace(/\._[A-Z]{2}\d+_\./, '._SL500_.');
    }

    const items = [];
    let skippedCount = 0;

    // Amazon wishlist items are in list-item elements
    const listItems = document.querySelectorAll('[data-id], li[data-itemid], .a-section.g-item-sortable');

    if (!listItems.length) {
        // Try alternative selectors for different Amazon layouts
        const altItems = document.querySelectorAll('#g-items .a-section');
        if (!altItems.length) {
            console.error('❌ No wishlist items found! Make sure you are on your Amazon wishlist page.');
            console.log('Expected URL pattern: https://www.amazon.co.uk/hz/wishlist/ls/...');
            return;
        }
    }

    // Try multiple selectors to cover different Amazon layouts
    const candidates = document.querySelectorAll(
        '[id^="itemMain_"], [id^="item_"], .g-item-sortable, li[data-itemid]'
    );

    const seen = new Set();

    candidates.forEach(el => {
        try {
            // Title
            const titleEl = el.querySelector(
                '[id^="itemName_"], .a-link-normal[title], .g-item-details a, h2 a, h3 a, .a-text-bold'
            );
            const title = titleEl
                ? (titleEl.getAttribute('title') || titleEl.textContent || '').trim()
                : '';

            if (!title || seen.has(title)) return;
            seen.add(title);

            // Author / By-line
            const byLineEl = el.querySelector(
                '[id^="item-byline-"], .a-size-base:not(.a-link-normal), .a-row.a-size-base'
            );
            let author = '';
            if (byLineEl) {
                author = byLineEl.textContent.replace(/^by\s+/i, '').trim();
                // Clean up role suffixes like "(Author)", "(Narrator)", etc.
                author = author.replace(/\s*\((Author|Narrator|Illustrator|Editor|Translator)\)/gi, '').trim();
            }

            // Link
            const linkEl = el.querySelector(
                '[id^="itemName_"], a[href*="/dp/"], a[href*="/gp/"], .a-link-normal[href]'
            );
            let url = '';
            let asin = '';
            if (linkEl && linkEl.href) {
                url = linkEl.href;
                // Extract ASIN from URL
                const asinMatch = url.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/);
                if (asinMatch) asin = asinMatch[1];
            }

            // --- Book detection filter ---
            const byLineRawText = byLineEl ? byLineEl.textContent.trim() : '';
            const detection = detectBook(el, byLineRawText, url);
            if (!detection.isBook) {
                skippedCount++;
                return; // Skip non-book items
            }

            // Price
            const priceEl = el.querySelector(
                '[id^="itemPrice_"], .a-price .a-offscreen, .a-color-price, .a-price-whole'
            );
            let price = '';
            if (priceEl) {
                price = priceEl.textContent.trim().replace(/[^0-9.]/g, '');
            }

            // Image — get high-res version
            const imgEl = el.querySelector('img[src*="images-amazon"], img[src*="m.media-amazon"]');
            const imageUrl = imgEl ? getHighResImageUrl(imgEl.src) : '';

            items.push({
                title: title,
                author: author,
                amazonPrice: parseFloat(price) || null,
                oxfamPrice: null,
                amazonUrl: url,
                isbn: asin, // ASIN as identifier (can be used to look up ISBN later)
                imageUrl: imageUrl,
                category: detection.category,
                notes: 'Imported from Amazon wishlist'
            });
        } catch (e) {
            console.warn('Failed to parse item:', e);
        }
    });

    if (!items.length) {
        console.error('❌ Could not extract any book items.');
        if (skippedCount > 0) {
            console.log(`ℹ️ ${skippedCount} non-book items were skipped. Only books are exported.`);
        }
        console.log('If you believe this is wrong, please report this issue.');
        return;
    }

    // Download as JSON
    const data = JSON.stringify(items, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `amazon-wishlist-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);

    console.log(`✅ Exported ${items.length} book items!`);
    if (skippedCount > 0) {
        console.log(`ℹ️ Skipped ${skippedCount} non-book items.`);
    }
    console.log('📥 Import the downloaded JSON file in Book Library → Wishlist → Import Wishlist');
    console.log('\nExported items:');
    console.table(items.map(i => ({ title: i.title, author: i.author, price: i.amazonPrice, category: i.category })));
})();
