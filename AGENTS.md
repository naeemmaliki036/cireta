
---

## Hard Lessons (2026-03-02)

### CSS Debugging Protocol — MANDATORY
When a CSS utility (padding, margin, etc.) seems not to apply:
1. **Check computed styles FIRST**: `window.getComputedStyle(el).paddingLeft` — if it's 0px when it shouldn't be, the rule is being overridden
2. **Check the generated CSS file** in `.next/static/chunks/*.css` — confirm the utility class is actually there
3. **Check for bare `*` selectors** outside `@layer` — in Tailwind v4, these override ALL utilities
4. **Never say "fixed" without a computed style check or screenshot proof**

### Tailwind v4 CSS Layer Rule
In Tailwind v4, a bare `* { padding: 0; margin: 0 }` reset placed OUTSIDE `@layer base` will override every padding/margin utility in the entire app. Always place global resets inside `@layer base {}`.

### Edit Safety
After any `sed` or Python string replacement on CSS/TSX files:
- `grep` to confirm the changed class still exists
- `grep` to confirm nothing was accidentally deleted
- Check the `.next` generated output to confirm the change made it through

### No "Fixed" Without Proof
Do not tell the user something is fixed unless:
- Screenshot confirms the visual
- OR computed style confirms the value
- OR build output confirms the CSS
