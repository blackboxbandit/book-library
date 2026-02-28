/* ===== Import / Export ===== */
const ImportExport = (() => {
    function init() {
        document.getElementById('btn-export-json').addEventListener('click', exportLibrary);
        document.getElementById('btn-import-json').addEventListener('click', () => {
            document.getElementById('import-json-input').click();
        });
        document.getElementById('import-json-input').addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            await importLibrary(file);
            e.target.value = '';
        });

        // Close-tab save prompt
        window.addEventListener('beforeunload', (e) => {
            e.preventDefault();
            e.returnValue = 'Would you like to export your library before leaving?';
            return e.returnValue;
        });

        // Also offer a save-on-close after the beforeunload
        // We use visibilitychange as a fallback since beforeunload doesn't allow custom dialogs
        let hasPrompted = false;
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden' && !hasPrompted) {
                hasPrompted = true;
                // Use sendBeacon to save a snapshot flag
                const data = new Blob([JSON.stringify({ action: 'save_reminder', time: Date.now() })], { type: 'application/json' });
                // Can't show a dialog here, but the beforeunload handles the prompt
            }
        });
    }

    async function exportLibrary() {
        try {
            Utils.toast('Exporting library…', 'info');
            const data = await DB.exportAll();

            // Add metadata
            data._meta = {
                exportDate: new Date().toISOString(),
                version: '1.0',
                totalBooks: (data.ebooks || []).length + (data.audiobooks || []).length + (data.physical || []).length,
                totalWishlist: (data.wishlist || []).length
            };

            const json = JSON.stringify(data, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `book-library-export-${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            Utils.toast('Library exported successfully!', 'success');
        } catch (err) {
            console.error('Export error:', err);
            Utils.toast('Export failed: ' + err.message, 'error');
        }
    }

    async function importLibrary(file) {
        try {
            const text = await Utils.readFileAsText(file);
            const data = JSON.parse(text);

            // Validate structure
            const validStores = ['ebooks', 'audiobooks', 'physical', 'wishlist', 'covers', 'settings'];
            const hasValidData = validStores.some(s => data[s] && Array.isArray(data[s]));
            if (!hasValidData) {
                Utils.toast('Invalid library file format.', 'error');
                return;
            }

            const replace = confirm('Replace existing data? Click "OK" to replace, "Cancel" to merge.');
            await DB.importAll(data, replace);

            const meta = data._meta || {};
            Utils.toast(`Imported! ${meta.totalBooks || '?'} books, ${meta.totalWishlist || '?'} wishlist items.`, 'success');

            if (typeof App !== 'undefined') App.refreshCurrentTab();
            App.updateStats();
        } catch (err) {
            console.error('Import error:', err);
            Utils.toast('Import failed: ' + err.message, 'error');
        }
    }

    /**
     * Trigger export programmatically (used by close-tab flow)
     */
    async function quickExport() {
        await exportLibrary();
    }

    return { init, exportLibrary, importLibrary, quickExport };
})();
