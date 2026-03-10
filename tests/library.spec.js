const { test, expect } = require('@playwright/test');

test.describe('Book Library E2E Tests', () => {

    test.beforeEach(async ({ page }) => {
        // Navigate to the app before each test
        await page.goto('/');

        // Catch errors
        page.on('pageerror', (exception) => {
            console.error(`Page unhandled exception: ${exception.message}`);
        });
        page.on('console', (msg) => {
            if (msg.type() === 'error') {
                console.error(`Page console error: ${msg.text()}`);
            }
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

        // Create shelf
        await page.fill('#shelf-name-input', 'My Playwright Shelf');
        await page.click('#btn-create-shelf');

        // Wait for the shelf to appear in the list
        await expect(page.locator('#shelf-list')).toContainText('My Playwright Shelf');

        // Click about items
        await expect(page.locator('.settings-card').locator('text=Clear eBooks')).toBeVisible();
    });

    test('Should open and close Help Modals', async ({ page }) => {
        await page.click('#tab-wishlist');
        await page.click('#btn-wishlist-help');

        // Modal visible
        const modalOverlay = page.locator('#help-modal-overlay');
        await expect(modalOverlay).toBeVisible();

        // Close modal
        await page.click('#help-modal-close');
        await expect(modalOverlay).toBeHidden();
    });

    test('Should Add and Edit a Physical Book', async ({ page }) => {
        await page.click('#tab-physical');

        // Open Add Book modal
        await page.click('#btn-add-physical');
        await expect(page.locator('#book-form-modal')).toBeVisible();
        await expect(page.locator('#form-title')).toBeVisible();

        // Fill minimum fields
        await page.fill('#form-title', 'E2E Test Book');
        await page.fill('#form-author', 'Automated Tester');

        // Submit form
        await page.click('#btn-form-save');

        // Wait for modal to hide
        await expect(page.locator('#book-form-modal')).toBeHidden();

        // Check if added to shelf (or empty state disappears)
        await expect(page.locator('#physical-empty')).toBeHidden();

        // The book card should appear
        const bookCard = page.locator('.book-card', { hasText: 'E2E Test Book' }).first();
        await expect(bookCard).toBeVisible();

        // Click to open detail modal
        await bookCard.click();
        await expect(page.locator('#book-detail-modal')).toBeVisible();
        await expect(page.locator('#modal-title')).toHaveText('E2E Test Book');

        // Click Edit inside detail modal
        // Note: Depends on what actions are available inside #modal-actions
        // The actions are rendered via JS, assuming there's an Edit button with class .btn-edit or similar text
        const editBtn = page.locator('#modal-actions button', { hasText: 'Edit' }).first();
        if (await editBtn.isVisible()) {
            await editBtn.click();
            await expect(page.locator('#book-form-modal')).toBeVisible();
            await page.click('#btn-form-cancel');
        }

        // Close detail modal
        await page.keyboard.press('Escape');
        await expect(page.locator('#book-detail-modal')).toBeHidden();
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

        // Wishlist grid check
        const wishlistCard = page.locator('.wishlist-card', { hasText: 'Future Book' }).first();
    });

    test('Should interact with Scan, Import, and Export buttons safely', async ({ page }) => {
        // We expect the file input dialog to open, but we handle it
        page.on('filechooser', async (fileChooser) => {
            // Just ignore or close if needed. Playwright handles it silently.
        });

        await page.click('#tab-ebooks');
        await page.click('#btn-scan-ebooks');

        await page.click('#tab-audiobooks');
        await page.click('#btn-scan-audiobooks');

        await page.click('#tab-wishlist');
        await page.click('#btn-import-wishlist');

        await page.click('#tab-settings');
        await page.click('#btn-export-json');
        await page.click('#btn-import-json');

        // Dismiss dialogs for clear data
        page.on('dialog', dialog => dialog.dismiss());
        await page.click('#btn-clear-wishlist');
    });

    test('Should test Lookup and Fetch Cover buttons in modal', async ({ page }) => {
        await page.click('#tab-physical');
        await page.click('#btn-add-physical');

        await page.fill('#form-isbn', '9780131103627');
        await page.click('#btn-lookup-book');
        await page.waitForTimeout(500);

        await page.click('#btn-fetch-cover');
        await page.waitForTimeout(500);

        await page.keyboard.press('Escape');
    });
});
