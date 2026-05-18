1. **Redesign the UI for iOS Glass look and feel**
    - The `variables.css` already defines some glass variables (`--glass-bg`, `--glass-border`, `--glass-blur`). I will update `main.css`, `cards.css` and `bookshelf.css` to heavily leverage `backdrop-filter: blur(var(--glass-blur))` along with semi-transparent backgrounds to achieve the iOS frosted glass effect.
    - Improve Apple-like typography and spacing, update borders to be subtle (`var(--glass-border)`), and soften drop shadows.
    - Specifically, target the `#app-header`, modal backgrounds, and floating elements to have the frosted glass effect (`backdrop-filter`).
    - Make sure inputs, buttons and forms look like native iOS equivalents (large radii, soft backgrounds).
2. **Review & Test the UI**
    - Test that the changes don't break functionality.
3. **Submit**
    - Complete pre-commit tests and submit.
