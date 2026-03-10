/* ===== Audiobook Scanner ===== */
const AudiobookScanner = (() => {
    const AUDIO_EXTS = ['mp3', 'm4a', 'm4b', 'flac', 'ogg', 'wma', 'aac', 'opus', 'wav', 'aaxc', 'aax'];
    const COVER_NAMES = ['cover.jpg', 'cover.jpeg', 'cover.png', 'folder.jpg', 'folder.jpeg', 'folder.png', 'albumart.jpg', 'front.jpg'];

    function init() {
        document.getElementById('btn-scan-audiobooks').addEventListener('click', () => {
            document.getElementById('audiobook-folder-input').click();
        });

        document.getElementById('audiobook-folder-input').addEventListener('change', async (e) => {
            const files = Array.from(e.target.files);
            if (!files.length) return;
            await scanFiles(files);
            e.target.value = '';
        });
    }

    // Generic folder names that should not be treated as author names
    const GENERIC_PARENTS = ['audio books', 'audiobooks', 'audio', 'books', 'media', 'library'];
    const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp'];

    async function scanFiles(files) {
        const progressEl = document.getElementById('audiobook-scan-progress');
        const fillEl = document.getElementById('audiobook-progress-fill');
        const textEl = document.getElementById('audiobook-progress-text');
        progressEl.hidden = false;
        fillEl.style.width = '0%';
        textEl.textContent = 'Analysing folder structure…';

        // Build directory tree of audiobooks
        // Group audio files by their parent folder
        const dirGroups = new Map(); // dirPath → { audioFiles: [], coverFile, imageFiles, path }

        files.forEach(f => {
            const path = f.webkitRelativePath || f.name;
            const parts = path.split('/');
            if (parts.length < 2) return;

            // Get the deepest directory containing audio files
            const dirPath = parts.slice(0, -1).join('/');
            const ext = parts[parts.length - 1].split('.').pop().toLowerCase();
            const fileName = parts[parts.length - 1].toLowerCase();

            if (!dirGroups.has(dirPath)) {
                dirGroups.set(dirPath, { audioFiles: [], coverFile: null, imageFiles: [], path: dirPath });
            }

            const group = dirGroups.get(dirPath);
            if (AUDIO_EXTS.includes(ext)) {
                group.audioFiles.push(f);
            }
            if (COVER_NAMES.includes(fileName)) {
                group.coverFile = f;
            }
            // Also track any image file as a fallback cover (for Audible-style naming)
            if (IMAGE_EXTS.includes(ext) && !COVER_NAMES.includes(fileName)) {
                group.imageFiles.push(f);
            }
        });

        // Filter to directories that actually have audio files
        const audiobooks = [];
        for (const [, group] of dirGroups) {
            if (group.audioFiles.length > 0) {
                // If no standard cover found, use any image file in the folder
                if (!group.coverFile && group.imageFiles.length > 0) {
                    group.coverFile = group.imageFiles[0];
                }
                audiobooks.push(group);
            }
        }

        if (!audiobooks.length) {
            Utils.toast('No audiobook folders found. Make sure the folder contains audio files.', 'error');
            progressEl.hidden = true;
            return;
        }

        // Fetch existing ebook entries for cross-referencing author/title
        const existingEbooks = await DB.getAll(DB.STORES.EBOOKS);
        const ebookLookup = []; // { normTitle, title, author }
        for (const eb of existingEbooks) {
            if (eb.title) {
                const normTitle = eb.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
                    .replace(/[^a-z0-9\s]/g, '').trim();
                ebookLookup.push({ normTitle, title: eb.title, author: eb.author || '' });
            }
        }

        const existingKeys = await DB.getMatchKeys(DB.STORES.AUDIOBOOKS);
        textEl.textContent = `Found ${audiobooks.length} audiobooks. Processing…`;

        const books = [];
        const coverPromises = [];

        for (let i = 0; i < audiobooks.length; i++) {
            const ab = audiobooks[i];
            const parts = ab.path.split('/');

            // Infer title and author from folder structure
            let title, author;
            if (parts.length >= 3) {
                title = parts[parts.length - 1];
                author = parts[parts.length - 2];
            } else if (parts.length === 2) {
                title = parts[1];
                author = parts[0];
            } else {
                title = parts[parts.length - 1];
                author = 'Unknown';
            }

            // Clean up title (remove leading numbers like "01 - ")
            title = title.replace(/^\d+[\s._-]+/, '').replace(/[_]/g, ' ').trim();
            author = author.replace(/[_]/g, ' ').trim();

            // Handle Audible-style flat folder names where author is a generic parent
            // e.g. "Audio Books/Daniel Kahneman Thinking, Fast and Slow 2011"
            if (GENERIC_PARENTS.includes(author.toLowerCase())) {
                const parsed = parseAudibleFolderName(title, ebookLookup);
                title = parsed.title;
                author = parsed.author;
            }

            const key = Utils.matchKey(title, author);
            if (existingKeys.has(key)) continue;

            const bookId = Utils.generateId();

            // Handle cover
            let coverId = null;
            if (ab.coverFile) {
                coverId = 'cover_' + bookId;
                coverPromises.push(
                    Utils.compressImage(ab.coverFile, 300, 0.75)
                        .then(dataURL => dataURL ? DB.saveCover(coverId, dataURL) : null)
                );
            }

            // Determine audio format
            const formats = [...new Set(ab.audioFiles.map(f => {
                const n = f.name || f.webkitRelativePath || '';
                return n.split('.').pop().toLowerCase();
            }))];

            books.push({
                id: bookId,
                type: 'audiobook',
                title: title,
                author: author,
                description: '',
                tags: [],
                isbn: '',
                series: '',
                seriesIndex: '',
                rating: 0,
                formats: formats,
                fileCount: ab.audioFiles.length,
                coverId: coverId,
                matchKey: key,
                dateAdded: new Date().toISOString()
            });

            existingKeys.add(key);

            const pct = Math.round(((i + 1) / audiobooks.length) * 100);
            fillEl.style.width = pct + '%';
            textEl.textContent = `Processing… ${i + 1} / ${audiobooks.length}`;

            if (i % 10 === 0) await new Promise(r => setTimeout(r, 0));
        }

        await Promise.all(coverPromises);

        if (books.length) {
            await DB.putMany(DB.STORES.AUDIOBOOKS, books);
            Utils.toast(`Imported ${books.length} audiobooks!`, 'success');
        } else {
            Utils.toast('No new audiobooks found to import.', 'info');
        }

        fillEl.style.width = '100%';
        textEl.textContent = `Done! ${books.length} new audiobooks imported.`;
        setTimeout(() => { progressEl.hidden = true; }, 2000);

        if (typeof App !== 'undefined') App.refreshCurrentTab();
    }

    /**
     * Parse an Audible-style folder name like "Author Name Title Name YYYY"
     * into separate title and author by cross-referencing known ebook titles.
     */
    function parseAudibleFolderName(folderName, ebookLookup) {
        // Strip trailing year (e.g. " 2011", " 2023")
        let name = folderName.replace(/\s+\d{4}\s*$/, '').trim();

        // Normalise for comparison
        const normName = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
            .replace(/[^a-z0-9\s]/g, '').trim();

        // Try to match against known ebook titles
        // We check if the folder name contains a known ebook title
        let bestMatch = null;
        let bestLen = 0;
        for (const eb of ebookLookup) {
            if (eb.normTitle.length < 3) continue; // skip very short titles
            if (normName.includes(eb.normTitle) && eb.normTitle.length > bestLen) {
                bestMatch = eb;
                bestLen = eb.normTitle.length;
            }
        }

        if (bestMatch) {
            // Use the ebook's known title and author
            return { title: bestMatch.title, author: bestMatch.author };
        }

        // Fallback: try common "Firstname Lastname Title" pattern
        // Heuristic: assume first two words are author name
        const words = name.split(/\s+/);
        if (words.length >= 3) {
            // Try 2-word author, then 3-word author
            const author2 = words.slice(0, 2).join(' ');
            const title2 = words.slice(2).join(' ');
            // Check if any ebook has this author
            const normAuthor2 = author2.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
            for (const eb of ebookLookup) {
                const ebAuthorNorm = eb.author.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
                if (ebAuthorNorm === normAuthor2) {
                    return { title: title2, author: author2 };
                }
            }
            // If no ebook match, still use 2-word split as best guess
            return { title: title2, author: author2 };
        }

        // Can't parse — use folder name as title
        return { title: name, author: 'Unknown' };
    }

    return { init };
})();
