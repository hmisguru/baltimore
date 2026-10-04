---
name: dashboard-collapsible-description
description: Move a widget's explanatory description below its chart/table/metric and collapse it behind a native disclosure, so the content itself is the first thing in view. Use when a dashboard widget's description is long enough to push the actual chart or table down the page, or when asked to tuck away/collapse a widget's description.
argument-hint: "[dashboard name, e.g. inventory] [which widgets, e.g. the two pivot tables]"
version: 1
---

# Dashboard collapsible description

Extracted from the Housing Inventory dashboard's two pivot tables, where a long methodology paragraph above each table pushed the actual data below the fold. The fix: move the description below the widget and collapse it behind a native `<details>/<summary>`, so the widget's own content is the first thing a reader sees, with the explanation one click away.

## The pattern in one paragraph

In the widget renderer (`renderWidget()` in `<name>.js`), decide per-widget whether it gets this treatment (a type check like `widget.type === "pivot_table"`, a name check, or another predicate the dashboard's own shape suggests — this is a judgment call, see below). For widgets that do, render the description as `<details class="X-card-details"><summary>About this data</summary><p class="X-card-description">...</p></details>` placed AFTER the widget's body instead of before it; everything else keeps the description as a plain `<p class="X-card-description">` lede above the body, unchanged. No JS is needed for the toggle itself — `<details>` is natively interactive — only the summary text and placement are componentized.

## Step by step

1. **Decide which widgets get collapsed.** Don't collapse every widget's description by default — a metric tile's one-line description reads fine above the number and doesn't need hiding. Collapse widgets whose description is a real paragraph (methodology, a cross-reference to another widget, caveats) that would otherwise visually compete with the content. The cleanest predicate is usually the widget `type` (Inventory's pivot tables), but a dashboard with more widget variety may need a name-based list instead — ask if it's not obvious from the dashboard's own widgets which ones qualify.

2. **In the widget renderer, branch on that predicate** and build the description two ways:
   ```js
   const collapsed = /* your predicate, e.g. */ widget.type === "pivot_table";
   const description = widget.description
     ? collapsed
       ? html`<details class="X-card-details"><summary>About this data</summary><p class="X-card-description">${widget.description}</p></details>`
       : html`<p class="X-card-description">${widget.description}</p>`
     : null;

   return html`<section class="X-card" ...>
     <h3 class="X-card-title">${widget.name}</h3>
     ${collapsed ? null : description}
     ${body}
     ${collapsed ? description : null}
   </section>`;
   ```
   "About this data" is the default summary text, deliberately generic rather than "About this table"/"About this chart" — the predicate in step 1 might collapse a chart, a metric, or something else entirely, and the label shouldn't assume table-specific. Use a more specific label only if asked.

3. **Add the CSS** (copy verbatim, swap the `X-` prefix for the dashboard's own):
   ```css
   .X-card-details { margin-top: 10px; }
   .X-card-details > summary { font-size: 13px; font-weight: 600; color: var(--X-purple); cursor: pointer; list-style: revert; }
   .X-card-details > summary:focus-visible { outline: 2px solid #8837ef; outline-offset: 2px; }
   html[data-theme="dark"] .X-card-details > summary:focus-visible { outline-color: var(--X-gold); }
   .X-card-details > .X-card-description { margin: 8px 0 0; }
   ```
   If the dashboard doesn't have a dark theme yet, drop the `html[data-theme="dark"]` line for now and add it when `dashboard-dark-theme` is applied — don't ship a focus outline that's invisible in a theme that doesn't exist yet, but don't block this change on adding dark mode either.

4. **If a widget's own description text cross-references another widget by name** (e.g. "Same data as X above"), and that other widget is also being collapsed or renamed as part of the same change, update the reference text too so it still reads correctly once collapsed — see `displayText()`/`TITLE_OVERRIDES` in `inventory.js` for the pattern that keeps such a cross-reference in sync at render time rather than hand-editing the YAML.

5. **Verify:**
   - `node --check` the `.js` file.
   - Fixture + `npx observable preview` + Playwright, same workflow as `dashboard-dark-theme`'s step 7: load the page, confirm each collapsed widget's `<details>` starts closed, click its `<summary>` and confirm it expands and the content shown matches the original description text, confirm the widget's own body (table/chart) is now the first thing visible under the heading.
   - Check both themes if the dashboard has `dashboard-dark-theme` applied already.
   - Check mobile width.
   - Clean up the fixture and confirm no stray dev server, same as always.

## Reference implementation

`src/components/inventory.js`'s `renderWidget()` (the `isPivot` branch) and `inventory.css`'s `.inv-card-details` rules — both pivot tables ("Current Inventory by Household Type" and "Current Inventory by Project") use this, summary text "About this data" on both. The second table's own description cross-references the first by name (step 4 above); see `TITLE_OVERRIDES`/`displayText()` in the same file.

## Status

Only applied to Inventory's two pivot tables so far — no request yet to apply it to Bridge or Coordinated Entry. Don't retrofit other dashboards speculatively; wait to be asked, same as `dashboard-dark-theme` was rolled out one dashboard at a time on request.
