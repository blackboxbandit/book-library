const { test, expect } = require('@playwright/test');

test.describe('Book Library E2E Tests', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        page.on('pageerror', (exception) => {
            console.error(`Page unhandled exception: ${exception.message}`);
        });
    });

    test('Should load all tabs without crashing', async ({ page }) => {
        const tabs = ['ebooks', 'audiobooks', 'physical', 'wishlist', 'settings', 'unified'];
        for (const tab of tabs) {
            await page.click(`#tab-${tab}`);
            await expect(page.locator(`#section-${tab}`)).toBeVisible();
        }
    });

    test('Should open UI dropdowns and search inputs', async ({ page }) => {
        await page.click('#tab-unified');
        await page.fill('#unified-search', 'Harry Potter');
        await page.selectOption('#unified-sort', 'author');
        await page.selectOption('#unified-filter-format', 'ebook');
        await page.selectOption('#unified-filter-status', 'reading');
    });

    test('Should manage Settings and Custom Shelves', async ({ page }) => {
        await page.click('#tab-settings');
        await page.fill('#shelf-name-input', 'My Playwright Shelf');
        await page.click('#btn-create-shelf');
        await expect(page.locator('#shelf-list')).toContainText('My Playwright Shelf');
        await expect(page.locator('.settings-card').locator('text=Clear eBooks')).toBeVisible();
    });

    test('Should open and close Help Modals', async ({ page }) => {
        await page.click('#tab-wishlist');
        await page.click('#btn-wishlist-help');
        const modalOverlay = page.locator('#help-modal-overlay');
        await expect(modalOverlay).toBeVisible();
        await page.click('#help-modal-close');
        await expect(modalOverlay).toBeHidden();
    });

    test('Should Add, View, and Delete a Physical Book', async ({ page }) => {
        page.on('dialog', async dialog => await dialog.accept());
        await page.click('#tab-physical');
        await page.click('#btn-add-physical');
        await expect(page.locator('#book-form-modal')).toBeVisible();

        await page.fill('#form-title', 'E2E Test Book');
        await page.fill('#form-author', 'Automated Tester');
        await page.click('#btn-form-save');
        await expect(page.locator('#book-form-modal')).toBeHidden();
        await expect(page.locator('#physical-empty')).toBeHidden();

        const bookCard = page.locator('.book-card', { hasText: 'E2E Test Book' }).first();
        await expect(bookCard).toBeVisible();

        // Open detail modal
        await bookCard.click();
        await expect(page.locator('#book-detail-modal')).toBeVisible();
        await expect(page.locator('#modal-title')).toHaveText('E2E Test Book');

        // Verify Remove Book button exists
        const removeBtn = page.locator('#btn-modal-delete');
        await expect(removeBtn).toBeVisible();
        await expect(removeBtn).toContainText('Remove Book');

        // Verify Full Edit button exists for physical books
        const editBtn = page.locator('#btn-modal-edit');
        await expect(editBtn).toBeVisible();

        // Delete the book via the modal
        await removeBtn.click();

        // After confirm dialog accepted, modal should close
        await expect(page.locator('#modal-overlay')).toBeHidden();

        // Book should be gone
        await page.waitForTimeout(2000);
        await expect(page.locator('.book-card', { hasText: 'E2E Test Book' })).toHaveCount(0);
    });

    test('Should open Wishlist Add modal and save', async ({ page }) => {
        await page.click('#tab-wishlist');
        await page.click('#btn-add-wishlist');
        await expect(page.locator('#book-form-modal')).toBeVisible();
        await expect(page.locator('#form-wishlist-fields')).toBeVisible();

        await page.fill('#form-title', 'Future Book');
        await page.fill('#form-author', 'Future Author');
        await page.fill('#form-amazon-url', 'https://amazon.co.uk/future');
        await page.fill('#form-amazon-price', '15.99');

        await page.click('#btn-form-save');
        await expect(page.locator('#book-form-modal')).toBeHidden();
    });

    test('Should import library, verify deduplication, and check shelves', async ({ page }) => {
        page.on('dialog', async dialog => await dialog.accept());

        await page.click('#tab-settings');
        await page.click('#btn-clear-all');
        await page.waitForTimeout(2000);

        const fileChooserPromise = page.waitForEvent('filechooser');
        await page.click('#btn-import-json');
        const fileChooser = await fileChooserPromise;
        await fileChooser.setFiles('tests/fixtures/book-library-export-2026-03-17.json');
        await expect(page.locator('.toast.toast-success')).toBeVisible({ timeout: 10000 });

        // Go to unified library
        await page.click('#tab-unified');
        await page.waitForTimeout(2000);
        await page.waitForTimeout(1000);

        const cardCount = await page.locator('#unified-shelf .book-card').count();
        expect(cardCount).toBeGreaterThan(50);
        expect(cardCount).toBeLessThan(127);

        // Test sorting
        await page.selectOption('#unified-sort', 'author');
        await page.waitForTimeout(2000);

        // Test filtering
        await page.selectOption('#unified-filter-format', 'audiobook');
        await page.waitForTimeout(2000);

        // Search for Kahneman — should find merged entry
        await page.selectOption('#unified-filter-format', 'all');
        await page.fill('#unified-search', 'Kahneman');
        await page.waitForTimeout(2000);

        const kahnemanCard = page.locator('.book-card', { hasText: 'Thinking, Fast and Slow' }).first();
        await expect(kahnemanCard).toBeVisible();
        await expect(kahnemanCard.locator('.badge-ebook')).toBeVisible();
        await expect(kahnemanCard.locator('.badge-audiobook')).toBeVisible();

        // Test group by shelf
        await page.fill('#unified-search', '');
        await page.selectOption('#unified-group-by', 'shelf');
        await page.waitForTimeout(2000);
        await expect(page.locator('.shelf-group-header', { hasText: 'Reading' }).first()).toBeVisible();
    });

    test('Should show Remove Book button for eBooks (not just physical)', async ({ page }) => {
        page.on('dialog', async dialog => await dialog.accept());

        // Clear and import
        await page.click('#tab-settings');
        await page.click('#btn-clear-all');
        await page.waitForTimeout(2000);

        const fileChooserPromise = page.waitForEvent('filechooser');
        await page.click('#btn-import-json');
        const fileChooser = await fileChooserPromise;
        await fileChooser.setFiles('tests/fixtures/book-library-export-2026-03-17.json');
        await expect(page.locator('.toast.toast-success')).toBeVisible({ timeout: 10000 });

        // Go to eBooks tab
        await page.click('#tab-ebooks');
        await page.waitForTimeout(2000);
        await page.waitForTimeout(2000);

        // Click first book card
        const firstCard = page.locator('#ebooks-shelf .book-card').first();
        await firstCard.click();

        // Detail modal should appear with Remove Book button
        await expect(page.locator('#book-detail-modal')).toBeVisible();
        const removeBtn = page.locator('#btn-modal-delete');
        await expect(removeBtn).toBeVisible();

        // Close modal
        await page.keyboard.press('Escape');
    });

    test('Should show per-format remove buttons for merged books', async ({ page }) => {
        page.on('dialog', async dialog => await dialog.accept());

        await page.click('#tab-settings');
        await page.click('#btn-clear-all');
        await page.waitForTimeout(2000);

        const fileChooserPromise = page.waitForEvent('filechooser');
        await page.click('#btn-import-json');
        const fileChooser = await fileChooserPromise;
        await fileChooser.setFiles('tests/fixtures/book-library-export-2026-03-17.json');
        await expect(page.locator('.toast.toast-success')).toBeVisible({ timeout: 10000 });

        // Search for a book that exists in multiple formats
        await page.click('#tab-unified');
        await page.waitForTimeout(2000);
        await page.fill('#unified-search', 'Thinking, Fast and Slow');
        await page.waitForTimeout(2000);

        const mergedCard = page.locator('#unified-shelf .book-card').first();
        await mergedCard.click();

        await expect(page.locator('#book-detail-modal')).toBeVisible();

        // Should have a remove button (Remove All if multi-format, or Remove Book if single)
        const removeBtn = page.locator('#btn-modal-delete');
        await expect(removeBtn).toBeVisible();

        // Check if this is a multi-format book by looking at format badges in the modal
        const ebookBadges = await page.locator('.modal-formats .badge-ebook').count();
        const audioBadges = await page.locator('.modal-formats .badge-audiobook').count();
        const physBadges = await page.locator('.modal-formats .badge-physical').count();
        const hasMultipleFormats = (ebookBadges + audioBadges + physBadges) > 1;
        if (hasMultipleFormats) {
            await expect(removeBtn).toContainText('Remove All');
            // Should have individual format remove buttons
            const formatRemoveBtns = page.locator('.modal-edit-group button.btn-danger');
            const btnCount = await formatRemoveBtns.count();
            // Multi-format: per-format buttons + Remove All button
            expect(btnCount).toBeGreaterThanOrEqual(2);
        } else {
            await expect(removeBtn).toContainText('Remove Book');
        }

        await page.keyboard.press('Escape');
    });

    test('Should have print styles that preserve covers', async ({ page }) => {
        // Verify print media query exists and key rules are applied
        const hasPrintStyles = await page.evaluate(() => {
            const sheets = document.styleSheets;
            for (const sheet of sheets) {
                try {
                    for (const rule of sheet.cssRules) {
                        if (rule.media && rule.media.mediaText === 'print') {
                            return true;
                        }
                    }
                } catch (e) { /* cross-origin */ }
            }
            return false;
        });
        expect(hasPrintStyles).toBe(true);

        // Verify print rules include essential cover visibility
        const printRulesContainCoverFix = await page.evaluate(() => {
            const sheets = document.styleSheets;
            for (const sheet of sheets) {
                try {
                    for (const rule of sheet.cssRules) {
                        if (rule.media && rule.media.mediaText === 'print') {
                            const cssText = rule.cssText || '';
                            return cssText.includes('print-color-adjust') &&
                                   cssText.includes('.book-cover-img');
                        }
                    }
                } catch (e) { /* cross-origin */ }
            }
            return false;
        });
        expect(printRulesContainCoverFix).toBe(true);
    });

    test('Should test Lookup and Fetch Cover buttons in modal', async ({ page }) => {
        await page.click('#tab-physical');
        await page.click('#btn-add-physical');
        await page.fill('#form-isbn', '9780131103627');
        await page.click('#btn-lookup-book');
        await page.waitForTimeout(2000);
        await page.click('#btn-fetch-cover');
        await page.waitForTimeout(2000);
        await page.keyboard.press('Escape');
    });

    test('Should verify search works on all tabs', async ({ page }) => {
        page.on('dialog', async dialog => await dialog.accept());

        // Import data
        await page.click('#tab-settings');
        await page.click('#btn-clear-all');
        await page.waitForTimeout(2000);
        const fileChooserPromise = page.waitForEvent('filechooser');
        await page.click('#btn-import-json');
        const fileChooser = await fileChooserPromise;
        await fileChooser.setFiles('tests/fixtures/book-library-export-2026-03-17.json');
        await expect(page.locator('.toast.toast-success')).toBeVisible({ timeout: 10000 });

        // Test search on eBooks tab
        await page.click('#tab-ebooks');
        await page.waitForTimeout(2000);
        const initialEbookCount = await page.locator('#ebooks-shelf .book-card').count();
        await page.fill('#ebooks-search', 'Atomic');
        await page.waitForTimeout(2000);
        const filteredEbookCount = await page.locator('#ebooks-shelf .book-card').count();
        expect(filteredEbookCount).toBeLessThan(initialEbookCount);
        expect(filteredEbookCount).toBeGreaterThan(0);

        // Test search on audiobooks tab
        await page.click('#tab-audiobooks');
        await expect(page.locator('#section-audiobooks')).toBeVisible();
        await page.waitForTimeout(1000);
        // Verify the search input exists and is fillable
        await page.fill('#audiobooks-search', 'zzzznonexistent');
        await page.waitForTimeout(1000);
        // After a non-matching search, there should be no matching books
        const visibleCards = await page.locator('#section-audiobooks .book-card').count();
        expect(visibleCards).toBe(0);
    });

    test('Should correctly handle reading status changes', async ({ page }) => {
        page.on('dialog', async dialog => await dialog.accept());

        // Add a book
        await page.click('#tab-physical');
        await page.click('#btn-add-physical');
        await page.fill('#form-title', 'Status Test Book');
        await page.fill('#form-author', 'Status Tester');
        await page.click('#btn-form-save');
        await page.waitForTimeout(2000);

        // Open the book detail modal
        const bookCard = page.locator('.book-card', { hasText: 'Status Test Book' }).first();
        await bookCard.click();
        await expect(page.locator('#book-detail-modal')).toBeVisible();

        // Click "Reading" status button
        const readingBtn = page.locator('.btn-status-toggle', { hasText: 'Reading' });
        await readingBtn.click();
        await page.waitForTimeout(2000);

        // Verify toast appeared
        await expect(page.locator('.toast').first()).toBeVisible();

        // Clean up - delete the book
        await page.click('#tab-physical');
        await page.waitForTimeout(2000);
        const card = page.locator('.book-card', { hasText: 'Status Test Book' }).first();
        await card.click();
        await page.locator('#btn-modal-delete').click();
        await page.waitForTimeout(2000);
    });
});
