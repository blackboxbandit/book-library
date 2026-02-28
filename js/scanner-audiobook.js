/* ===== Audiobook Scanner ===== */
const AudiobookScanner = (() => {
    const AUDIO_EXTS = ['mp3', 'm4a', 'm4b', 'flac', 'ogg', 'wma', 'aac', 'opus', 'wav'];
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

    async function scanFiles(files) {
        const progressEl = document.getElementById('audiobook-scan-progress');
        const fillEl = document.getElementById('audiobook-progress-fill');
        const textEl = document.getElementById('audiobook-progress-text');
        progressEl.hidden = false;
        fillEl.style.width = '0%';
        textEl.textContent = 'Analysing folder structure…';

        // Build directory tree of audiobooks
        // Group audio files by their parent folder
        const dirGroups = new Map(); // dirPath → { audioFiles: [], allFiles: [] }

        files.forEach(f => {
            const path = f.webkitRelativePath || f.name;
            const parts = path.split('/');
            if (parts.length < 2) return;

            // Get the deepest directory containing audio files
            const dirPath = parts.slice(0, -1).join('/');
            const ext = parts[parts.length - 1].split('.').pop().toLowerCase();
            const fileName = parts[parts.length - 1].toLowerCase();

            if (!dirGroups.has(dirPath)) {
                dirGroups.set(dirPath, { audioFiles: [], coverFile: null, path: dirPath });
            }

            const group = dirGroups.get(dirPath);
            if (AUDIO_EXTS.includes(ext)) {
                group.audioFiles.push(f);
            }
            if (COVER_NAMES.includes(fileName)) {
                group.coverFile = f;
            }
        });

        // Filter to directories that actually have audio files
        const audiobooks = [];
        for (const [, group] of dirGroups) {
            if (group.audioFiles.length > 0) {
                audiobooks.push(group);
            }
        }

        if (!audiobooks.length) {
            Utils.toast('No audiobook folders found. Make sure the folder contains audio files.', 'error');
            progressEl.hidden = true;
            return;
        }

        const existingKeys = await DB.getMatchKeys(DB.STORES.AUDIOBOOKS);
        textEl.textContent = `Found ${audiobooks.length} audiobooks. Processing…`;

        const books = [];
        const coverPromises = [];

        for (let i = 0; i < audiobooks.length; i++) {
            const ab = audiobooks[i];
            const parts = ab.path.split('/');

            // Infer title and author from folder structure
            // Common patterns: Author/Title, Library/Author/Title, etc.
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

    return { init };
})();
