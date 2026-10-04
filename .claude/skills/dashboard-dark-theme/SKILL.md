---
name: dashboard-dark-theme
description: Add a light/dark theme toggle to one of this site's Observable Framework dashboards (Bridge, Coordinated Entry, Inventory, and any new one), or audit an existing one for dark-mode gaps. Use whenever a dashboard page is created or asked to support dark mode.
argument-hint: "[dashboard name, e.g. bridge, coordinated-entry]"
version: 1
---

# Dashboard dark theme

Every dashboard on this site should ship with both a light and dark theme from the start (standing rule, see CLAUDE.md). This skill is the procedure, extracted from the Inventory dashboard's original implementation and proven again on the Bridge retrofit. It assumes the dashboard already follows this site's usual shape: a `src/components/<name>.js` + `<name>.css` pair, a `src/<name>/index.md` page, optionally an `src/embed/<name>.md` embed page, all driven by a `src/data/<name>.json.py` loader.

## The pattern in one paragraph

User-controlled, not OS-driven: a `[data-theme]` attribute on `<html>`, set by a plain toggle **button** (not a switch) whose own label swaps "🌙 Dark mode" / "☀️ Light mode", remembered via `localStorage` but always starting light on a first visit. Every color lives in a CSS custom property defined once on `:root` (light values) and redefined under `html[data-theme="dark"]` (dark values) — including Framework's own `--theme-foreground`/`--theme-background-a`/`--theme-background-b`/`--theme-foreground-focus`, so the page chrome recolors for free. Colors that depend on data (a tile's category, a chart series, a conditional-format cell) get BOTH their light and dark hex computed once in JS and passed through as a **pair** of inline custom properties (`--foo`/`--foo-dark`); CSS picks the active one via `html[data-theme="dark"] .foo { background: var(--foo-dark) }`. Nothing re-renders on toggle — it's all CSS.

## Step by step

1. **Add the token pair to the component's `:root` block.** Reuse this site's canonical values unless the dashboard already has its own established light palette:
   ```css
   :root { --x-purple: #60397c; --x-deep: #2f1c3d; --x-gold: #fabe21; --x-surface: #f4fafb; --x-border: #d9e7ea; --x-muted: #4f4a57; }
   html[data-theme="dark"] {
     --x-purple: #d9cfe3; --x-deep: #ffffff; --x-surface: #2f1c3d; --x-border: #4a3659; --x-muted: #c3b8d1;
     --theme-foreground: #ffffff; --theme-background-a: #1f1428; --theme-background-b: #1f1428; --theme-foreground-focus: #fabe21;
     color-scheme: dark;
   }
   ```
   These exact dark values match kpi.js's own `data-theme="dark"` variant and are already shipped in `inventory.css`/`bridge.css` — reuse them verbatim for visual consistency across dashboards, don't invent new ones.

2. **Add the toggle functions to the component's `.js` file** (`THEME_KEY`/`storedTheme()`/`applyTheme()`/`renderThemeToggle()`) — copy `inventory.js`'s versions verbatim, changing only `THEME_KEY` to a dashboard-specific string (e.g. `"bridge-theme"`, never shared across dashboards). Export `renderThemeToggle`. Call `display(renderThemeToggle())` near the top of `index.md`, after the header and before the filters.

3. **Audit every hardcoded hex and theme-flipping token usage.** Grep the component's `.js` and `.css` for raw hex colors and for every place a `--x-*` token is used as a `background`. Two classes of fix:
   - **Plain chrome** (card backgrounds, borders, muted/ink text not already on a token): redefine via the token pair above, or add an explicit `html[data-theme="dark"] .foo { color/background: ... }` override next to the light rule.
   - **Data-bound colors** (a tile's accent, a chart's category, a conditional-format fill): compute both light and dark hex in JS, pass both through as inline custom properties, add ONE CSS rule pair (light default + `html[data-theme="dark"]` override) that consumes them. See `inventory.js`'s `GROUP_STYLE`/`--tile-accent`/`--tile-accent-dark` and the gradient's `--grad-bg`/`--grad-bg-dark` for the two existing shapes of this.
   - **Fixed-identity colors** that should look the same in both themes (a status pill, a population badge) need no dark variant at all — just verify contrast once, document why it's deliberately unthemed.

4. **Chart marks (Observable Plot / SVG) can use `var()` too.** Modern browsers resolve CSS custom properties in SVG presentation attributes, so a categorical series array doesn't have to be re-picked on toggle — define it as `var(--series-1)` through `var(--series-8)` instead of raw hex, with light values on `:root` and dark steps (the dataviz skill's reference palette's own dark column) under `html[data-theme="dark"]`. Confirmed working end to end on Bridge: toggling the theme recolors every line/bar/pie/treemap with no re-render, including Plot's own auto-generated legend swatches.

5. **Derive a tile's `bgDark`/`borderDark` from its `accentDark`, don't guess.** The recipe already shipped three times (Inventory's crisis/bridge/permanent, Bridge's Returned): alpha-blend `accentDark` over the site's dark surface `#2f1c3d` at **16%** for the background, **37.5%** for the border. In JS/a REPL:
   ```js
   const mix = (a, b, t) => Math.round(a + (b - a) * t);
   // surface = [47, 28, 61] (#2f1c3d); accentDark = your hex as [r,g,b]
   const bgDark = surface.map((s, i) => mix(s, accentDark[i], 0.16));
   const borderDark = surface.map((s, i) => mix(s, accentDark[i], 0.375));
   ```
   Round to the nearest int, convert to hex.

6. **Decide the embed page's story, if one exists.** Don't just add a second toggle button inside the iframe — that duplicates a control the host page already owns. Two options, pick one explicitly:
   - **No visible toggle; read `?theme=dark` from the URL** (matches the KPI iframes' `?theme=` convention) and set `document.documentElement.dataset.theme` **directly**, NOT via the shared `applyTheme()` helper. `applyTheme()` also writes `localStorage`, which is same-origin shared with the dashboard's own main page even when the embed is framed on someone else's site — an embed's theme is that one view's business, not something that should leak into what the main page remembers next time someone visits it directly. (This is what `/embed/bridge` does.)
   - If the dashboard has no embed page yet, skip this step.

7. **Verify before shipping — every time, no shortcuts:**
   - `node --check` the `.js` file.
   - Swap the real `.json.py` loader for a static fixture (`mv x.json.py x.json.py.bak && cp <fixture> x.json`), run `npx observable preview --port 3100` in the background.
   - Playwright: load the page, screenshot light, click the toggle, screenshot dark, reload and confirm the theme persisted and the toggle's own label matches. Check `document.documentElement.dataset.theme` and a few actual `getComputedStyle(...).backgroundColor`/`.stroke` values, not just a screenshot — a screenshot alone can't tell you whether a rule silently failed to apply (see the comment-bug gotcha below) versus just looking similar by coincidence.
   - Click into every tab/section the dashboard has, not just the first screen — a glossary tile, a conditional-format table, a treemap each need their own look.
   - Check mobile width (~390px).
   - Capture `page.on('pageerror', ...)` on every screenshot pass; zero tolerance.
   - Clean up: remove the fixture, restore the real loader (`mv x.json.py.bak x.json.py`, `rm x.json`), confirm no stray `observable preview` process and no `package.json`/`package-lock.json` diff.
   - If you cannot reach BigQuery in this environment to validate a query change, say so explicitly rather than silently skipping it — this is about dark mode, which is pure CSS/JS, but say it anyway if you touched a query en route.

## Two gotchas that will burn you

**A `*/` inside a CSS comment's prose silently truncates the whole file's parse.** If you write a comment mentioning the actual custom-property syntax -- e.g. "the `--foo-*`/`--bar-*` tokens" -- the literal character sequence `*/` inside that text closes the comment early, and everything after it up to the NEXT real `*/` becomes garbage the browser's CSS parser quietly drops, along with every rule after it in the file. This is exactly what happened writing this skill's own Bridge retrofit: a comment reading `--bridge-*/--series-*` cut the file from 62 parsed rules down to 1, and the dark theme silently did nothing — no console error, no visible failure except "the colors just don't change." **Never write `-*/` or `/*-` as literal text inside a CSS comment.** Say "the `--foo-` and `--bar-` custom properties" instead of using a bare trailing `*` before a slash. After writing any new CSS comment that discusses custom-property names, grep the file for `grep -c '/\*'` vs `grep -c '\*/'` and confirm they match, or (better) just check `document.styleSheets` rule count in a live page as part of step 7 above.

**A token meant for text is not safe to reuse as a filled background.** A "muted" token is usually light-in-light-mode / light-in-dark-mode (so muted TEXT stays readable against either surface) — but a component that uses it as a `background` with hardcoded white text (e.g. a neutral status pill) will break specifically in dark mode, where the token flips to a light color and white text on it disappears. Caught on Bridge's "about the same as average" pill, which used `background:var(--bridge-muted)`. Fix: give it its own fixed hex (not a token), same as any other fixed-identity color (`STATUS_COLORS.neutral` in `bridge.js`). Before adding a dark theme to a dashboard, grep for every inline `background:var(--...)` usage and check each one is either a background-role token (safe) or needs this fix.

## Reference implementations

- `src/components/inventory.js` / `inventory.css` / `src/inventory/index.md` — the original. Simplest case: no embed page, `GROUP_STYLE` for dual-tone tiles, `GRADIENT_COLORS_LIGHT`/`_DARK` for a conditional-format gradient, `POPULATION_BADGES` for fixed-identity pills.
- `src/components/bridge.js` / `bridge.css` / `src/bridge/index.md` / `src/embed/bridge.md` — the retrofit this skill was extracted from. Adds: the `var(--series-N)` chart-color technique, the accent-blend formula (worked out backwards from Inventory's shipped values and reapplied to a 4th tile Inventory never needed), the embed page's `?theme=` handling, and the muted-token-as-background fix.

## Still needs doing

`src/components/coordinated-entry.js`/`.css`/`src/coordinated-entry/index.md` has no dark theme yet (no embed page to worry about there). Follow this same procedure; it's the simplest of the three (no filters, no tabs), so it's a good next target and a good place to double-check this skill generalizes rather than being Inventory/Bridge-specific.
