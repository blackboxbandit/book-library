#!/usr/bin/env node
/**
 * Oxfam Online Shop — Book Price Scraper
 *
 * Uses Puppeteer to scrape book listings from the Oxfam online shop.
 * The site renders client-side with Oracle Commerce Cloud (Knockout.js),
 * so a headless browser is required.
 *
 * Usage:
 *   node oxfam-scraper.js                          # Browse fiction (page 1)
 *   node oxfam-scraper.js --search "Animal Farm"   # Search by title/author
 *   node oxfam-scraper.js --isbn "9780141036137"   # Search by ISBN
 *   node oxfam-scraper.js --pages 3                # Scrape 3 pages
 *   node oxfam-scraper.js --search "Orwell" --csv  # CSV output
 */

const puppeteer = require('puppeteer');

// ─── CLI Argument Parsing ────────────────────────────────────────────────────

function parseArgs() {
    const args = process.argv.slice(2);
    const opts = {
        search: null,
        isbn: null,
        pages: 1,
        csv: false,
        help: false,
    };

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--search':
            case '-s':
                opts.search = args[++i];
                break;
            case '--isbn':
            case '-i':
                opts.isbn = args[++i];
                break;
            case '--pages':
            case '-p':
                opts.pages = parseInt(args[++i], 10) || 1;
                break;
            case '--csv':
                opts.csv = true;
                break;
            case '--help':
            case '-h':
                opts.help = true;
                break;
        }
    }
    return opts;
}

function printUsage() {
    console.log(`
Oxfam Book Price Scraper
========================

Usage:
  node oxfam-scraper.js [options]

Options:
  --search, -s <query>   Search for books by title or author
  --isbn,   -i <isbn>    Search for a specific ISBN
  --pages,  -p <n>       Number of pages to scrape (browse mode, default: 1)
  --csv                  Output results as CSV instead of JSON
  --help,   -h           Show this help message

Examples:
  node oxfam-scraper.js                            Browse fiction books
  node oxfam-scraper.js --search "Animal Farm"     Search by title
  node oxfam-scraper.js --isbn "9780141036137"     Lookup by ISBN
  node oxfam-scraper.js --search "Orwell" --csv    CSV output
  node oxfam-scraper.js --pages 3                  Scrape 3 pages
`);
}

// ─── URL Builders ────────────────────────────────────────────────────────────

const BASE = 'https://onlineshop.oxfam.org.uk';

function buildBrowseUrl(pageOffset = 0) {
    return `${BASE}/category/fiction?N=1050980576&Ns=product.creationDate|1&No=${pageOffset * 60}&Nrpp=60`;
}

function buildSearchUrl(query) {
    return `${BASE}/searchresults?Ntt=${encodeURIComponent(query)}`;
}

// ─── Scraping Logic ──────────────────────────────────────────────────────────

/**
 * Extract book data from all product cards on the current page.
 * Runs inside the browser context via page.evaluate().
 *
 * DOM structure (Oracle Commerce Cloud + Oxfam custom elements):
 *   <g-product-card>
 *     <div class="g-product-cards">
 *       <div class="view">
 *         <div class="search-product-link"><img .../></div>
 *       </div>
 *       <div class="infos">
 *         <div class="infos_wrapper">
 *           <div class="product-item-bar-container">  ← price (£X.XX)
 *           <a class="product-item-anchor">           ← title
 *           <div>                                     ← author
 *         </div>
 *       </div>
 *     </div>
 *   </g-product-card>
 */
function extractBooks() {
    const results = [];

    // Each product card is a <g-product-card> custom element containing div.g-product-cards
    const cards = document.querySelectorAll('div.g-product-cards');

    cards.forEach(card => {
        // ── Title: from the product anchor link ──
        const anchor = card.querySelector('a.product-item-anchor');
        const title = anchor?.innerText?.trim() || '';

        // ── Price: from the price bar container ──
        const priceContainer = card.querySelector('.product-item-bar-container');
        const priceText = priceContainer?.innerText?.trim() || '';

        // ── Author: the div sibling after the anchor inside infos_wrapper ──
        const infosWrapper = card.querySelector('.infos_wrapper');
        let author = '';
        if (infosWrapper) {
            const children = Array.from(infosWrapper.children);
            // Author is typically the last child div (after anchor)
            for (let i = children.length - 1; i >= 0; i--) {
                const child = children[i];
                if (child.tagName === 'DIV' && !child.classList.contains('product-item-bar-container') && !child.classList.contains('d-flex')) {
                    const text = child.innerText?.trim();
                    if (text && text !== title) {
                        author = text;
                    }
                    break;
                }
            }
        }

        // ── URL: from the anchor href ──
        let url = anchor?.getAttribute('href') || '';
        if (url && !url.startsWith('http')) {
            url = 'https://onlineshop.oxfam.org.uk' + url;
        }

        // ── Image: from the card's img element ──
        const imgEl = card.querySelector('img');
        const image = imgEl?.src || '';

        if (title || priceText) {
            results.push({ title, author, price: priceText, url, image });
        }
    });

    return results;
}

/**
 * Wait for product cards to appear.
 */
async function waitForProducts(page, timeout = 20000) {
    const selectors = [
        'div.g-product-cards',
        'a.product-item-anchor',
        '.product-item',
    ];

    for (const sel of selectors) {
        try {
            await page.waitForSelector(sel, { timeout: timeout / selectors.length });
            console.error(`   ✓ Found products with selector: ${sel}`);
            // Extra wait for KnockoutJS to finish binding all data
            await new Promise(r => setTimeout(r, 3000));
            return true;
        } catch {
            // Try next
        }
    }
    return false;
}

/**
 * Scroll to the bottom to trigger lazy-loaded content.
 */
async function autoScroll(page) {
    await page.evaluate(async () => {
        await new Promise(resolve => {
            let totalHeight = 0;
            const distance = 400;
            const timer = setInterval(() => {
                window.scrollBy(0, distance);
                totalHeight += distance;
                if (totalHeight >= document.body.scrollHeight) {
                    clearInterval(timer);
                    resolve();
                }
            }, 200);
            setTimeout(() => { clearInterval(timer); resolve(); }, 15000);
        });
    });
    await new Promise(r => setTimeout(r, 2000));
}

// ─── Main ────────────────────────────────────────────────────────────────────

(async () => {
    const opts = parseArgs();

    if (opts.help) {
        printUsage();
        process.exit(0);
    }

    console.error('🔍 Launching browser...');

    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1440, height: 900 });
        await page.setUserAgent(
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
        );

        let allBooks = [];

        if (opts.isbn || opts.search) {
            // ── Search Mode (ISBN or text) ──
            const query = opts.isbn || opts.search;
            const url = buildSearchUrl(query);
            console.error(`🔎 Searching: "${query}"`);
            console.error(`   URL: ${url}`);
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

            if (await waitForProducts(page)) {
                await autoScroll(page);
                allBooks = await page.evaluate(extractBooks);
            } else {
                console.error('⚠️  No results found.');
            }

        } else {
            // ── Browse Mode ──
            for (let p = 0; p < opts.pages; p++) {
                const url = buildBrowseUrl(p);
                console.error(`📚 Scraping page ${p + 1}/${opts.pages}...`);
                console.error(`   URL: ${url}`);
                await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

                if (await waitForProducts(page)) {
                    await autoScroll(page);
                    const pageBooks = await page.evaluate(extractBooks);
                    allBooks.push(...pageBooks);
                    console.error(`   Found ${pageBooks.length} books on page ${p + 1}`);
                } else {
                    console.error(`⚠️  No products found on page ${p + 1}. Stopping.`);
                    break;
                }

                if (p < opts.pages - 1) {
                    await new Promise(r => setTimeout(r, 1500));
                }
            }
        }

        // ── Output ──
        console.error(`\n✅ Total books scraped: ${allBooks.length}\n`);

        if (opts.csv) {
            console.log('title,author,price,url');
            for (const b of allBooks) {
                const esc = (s) => `"${(s || '').replace(/"/g, '""')}"`;
                console.log(`${esc(b.title)},${esc(b.author)},${esc(b.price)},${esc(b.url)}`);
            }
        } else {
            console.log(JSON.stringify(allBooks, null, 2));
        }

    } catch (err) {
        console.error('❌ Scraper error:', err.message);
        process.exit(1);
    } finally {
        await browser.close();
    }
})();
