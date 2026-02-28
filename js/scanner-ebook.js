/* ===== eBook Scanner (Calibre Library) ===== */
const EbookScanner = (() => {
    /**
     * Trigger file picker and scan the Calibre library
     */
    function init() {
        document.getElementById('btn-scan-ebooks').addEventListener('click', () => {
            document.getElementById('ebook-folder-input').click();
        });

        document.getElementById('ebook-folder-input').addEventListener('change', async (e) => {
            const files = Array.from(e.target.files);
            if (!files.length) return;
            await scanFiles(files);
            e.target.value = '';
        });
    }

    /**
     * Process all files from the folder picker
     */
    async function scanFiles(files) {
        const progressEl = document.getElementById('ebook-scan-progress');
        const fillEl = document.getElementById('ebook-progress-fill');
        const textEl = document.getElementById('ebook-progress-text');
        progressEl.hidden = false;

        // Build a path → file map
        const fileMap = new Map();
        files.forEach(f => {
            const path = f.webkitRelativePath || f.name;
            fileMap.set(path, f);
        });

        // Find all metadata.opf files
        const opfFiles = files.filter(f => {
            const path = f.webkitRelativePath || f.name;
            return path.toLowerCase().endsWith('metadata.opf');
        });

        if (!opfFiles.length) {
            Utils.toast('No Calibre metadata files found. Is this a Calibre library?', 'error');
            progressEl.hidden = true;
            return;
        }

        // Get existing match keys for deduplication
        const existingKeys = await DB.getMatchKeys(DB.STORES.EBOOKS);

        textEl.textContent = `Found ${opfFiles.length} books. Scanning…`;
        fillEl.style.width = '0%';

        const books = [];
        const coverPromises = [];

        for (let i = 0; i < opfFiles.length; i++) {
            const opf = opfFiles[i];
            const opfPath = opf.webkitRelativePath || opf.name;
            const dirPath = opfPath.substring(0, opfPath.lastIndexOf('/'));

            try {
                const xmlText = await Utils.readFileAsText(opf);
                const meta = Utils.parseOPF(xmlText);
                if (!meta || !meta.title) continue;

                const key = Utils.matchKey(meta.title, meta.author);
                if (existingKeys.has(key)) continue;

                const bookId = Utils.generateId();

                // Detect available formats in the same directory
                const formats = [];
                for (const [p] of fileMap) {
                    if (p.startsWith(dirPath + '/')) {
                        const ext = p.split('.').pop().toLowerCase();
                        if (['epub', 'pdf', 'mobi', 'azw', 'azw3', 'cbz', 'cbr'].includes(ext) && !formats.includes(ext)) {
                            formats.push(ext);
                        }
                    }
                }

                // Find cover image
                const coverNames = ['cover.jpg', 'cover.jpeg', 'cover.png', 'cover.webp'];
                let coverFile = null;
                for (const cn of coverNames) {
                    const cp = dirPath + '/' + cn;
                    if (fileMap.has(cp)) {
                        coverFile = fileMap.get(cp);
                        break;
                    }
                }

                // Compress and store cover
                let coverId = null;
                if (coverFile) {
                    coverId = 'cover_' + bookId;
                    coverPromises.push(
                        Utils.compressImage(coverFile, 300, 0.75)
                            .then(dataURL => dataURL ? DB.saveCover(coverId, dataURL) : null)
                    );
                }

                books.push({
                    id: bookId,
                    type: 'ebook',
                    title: meta.title,
                    author: meta.author,
                    description: Utils.stripHTML(meta.description),
                    tags: meta.tags || [],
                    isbn: meta.isbn || '',
                    series: meta.series || '',
                    seriesIndex: meta.seriesIndex || '',
                    rating: meta.rating || 0,
                    language: meta.language || '',
                    publisher: meta.publisher || '',
                    publishDate: meta.date || '',
                    formats: formats,
                    coverId: coverId,
                    matchKey: key,
                    dateAdded: new Date().toISOString()
                });

                existingKeys.add(key);
            } catch (err) {
                console.warn('Error processing OPF:', opfPath, err);
            }

            // Update progress
            const pct = Math.round(((i + 1) / opfFiles.length) * 100);
            fillEl.style.width = pct + '%';
            textEl.textContent = `Scanning… ${i + 1} / ${opfFiles.length} books`;

            // Yield to keep UI responsive
            if (i % 20 === 0) await new Promise(r => setTimeout(r, 0));
        }

        // Save all covers
        await Promise.all(coverPromises);

        // Save all books
        if (books.length) {
            await DB.putMany(DB.STORES.EBOOKS, books);
            Utils.toast(`Imported ${books.length} eBooks!`, 'success');
        } else {
            Utils.toast('No new eBooks found to import.', 'info');
        }

        fillEl.style.width = '100%';
        textEl.textContent = `Done! ${books.length} new books imported.`;
        setTimeout(() => { progressEl.hidden = true; }, 2000);

        // Refresh views
        if (typeof App !== 'undefined') App.refreshCurrentTab();
    }

    return { init };
})();
