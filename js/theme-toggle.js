/* ===== Theme Toggle — Classic ↔ Nordic Glass ===== */
const ThemeToggle = (() => {
    const STORAGE_KEY = 'book-library-theme';
    const THEMES = { CLASSIC: 'classic', NORDIC: 'nordic' };

    function get() {
        return localStorage.getItem(STORAGE_KEY) || THEMES.CLASSIC;
    }

    function apply(theme) {
        if (theme === THEMES.NORDIC) {
            document.documentElement.setAttribute('data-theme', 'nordic');
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
        const btn = document.getElementById('theme-toggle-btn');
        if (btn) {
            btn.setAttribute('aria-label', theme === THEMES.NORDIC ? 'Switch to Classic' : 'Switch to Nordic Glass');
            btn.classList.toggle('is-nordic', theme === THEMES.NORDIC);
        }
        document.querySelectorAll('.theme-option').forEach(opt => {
            opt.classList.toggle('active', opt.dataset.theme === theme);
        });
    }

    function toggle() {
        const next = get() === THEMES.CLASSIC ? THEMES.NORDIC : THEMES.CLASSIC;
        localStorage.setItem(STORAGE_KEY, next);
        apply(next);
    }

    function set(theme) {
        localStorage.setItem(STORAGE_KEY, theme);
        apply(theme);
    }

    function init() {
        apply(get());
        const btn = document.getElementById('theme-toggle-btn');
        if (btn) btn.addEventListener('click', toggle);
        document.querySelectorAll('.theme-option').forEach(opt => {
            opt.addEventListener('click', () => set(opt.dataset.theme));
        });
    }

    return { init, toggle, get, set };
})();
