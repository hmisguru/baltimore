---
title: Embedding guide
---

```js
const spm = FileAttachment("./data/spm.json").json();
// This site's own base URL, so the snippets below are copy-and-paste ready.
const base = new URL(".", location.href).href;
```

# Embedding the KPIs

There are three ways to put these KPIs on another website. All of them update automatically when this site is rebuilt each month.

## 1. Iframe (simplest)

Works anywhere you can paste HTML, including most website builders and CMSs.

```js
display(html`<pre><code>${`<iframe src="${base}embed/exits-to-permanent-housing"
  title="Exits to permanent housing"
  width="360" height="280" style="border:0"></iframe>`}</code></pre>`);
```

Use `embed/all` for every KPI in a responsive grid (give it a height of about 640px on desktop). Tiles are light by default, to match baltimorecity.gov. Add `?theme=dark` for the purple dark variant, or `?theme=auto` to follow the viewer's system setting.

Available KPI pages:

```js
display(html`<ul>${spm.kpis.map((d) => html`<li><a href="./embed/${d.id}"><code>embed/${d.id}</code></a> — ${d.title}</li>`)}</ul>`);
```

## 2. JavaScript module (no iframe)

Renders the tiles directly into your page, so they inherit your layout and width. Your page needs to allow ES module scripts.

```js
display(html`<pre><code>${`<div id="baltimore-kpis"></div>
<script type="module">
  import {KPIGrid} from "${base}kpis.js";
  document.querySelector("#baltimore-kpis").append(await KPIGrid());
<\/script>`}</code></pre>`);
```

The module exports:

- `KPIGrid(ids?, options?)`: a responsive grid, all KPIs by default, or pass an array of ids such as `["people-sheltered", "first-time-homeless"]`.
- `KPI(id, options?)`: a single tile.
- `data()`: the underlying numbers, for building your own display.

Options: `{theme: "light" | "dark" | "auto", description: false, footer: false}`. The default is `"light"`.

### MOHS-funded projects only

Add `mohsFunded: true` to limit every figure to projects funded by the Mayor's Office of Homeless Services (grants UNCGF and UNBFO) instead of the whole CoC, for example `KPIGrid(undefined, {mohsFunded: true})`. For iframes, add `?mohs=1` to the URL (combine with a theme as `?mohs=1&theme=dark`). The tiles' source line then says "MOHS-funded projects only".

To let visitors flip between all projects and MOHS-funded projects themselves, add `toggle: true` to `KPIGrid`, for example `KPIGrid(undefined, {toggle: true})`, or `?toggle=1` to the `embed/all` iframe URL. That shows a "MOHS-funded projects only" switch above the tiles. It starts off unless you also pass `mohsFunded: true` (`?mohs=1`). The switch is available on grids only; single-tile embeds use the code option.

A project counts as MOHS-funded if it had one of those grants at any point in the two fiscal years being compared. People are counted by what happened in those projects, but checks that look at a person's wider history, such as whether they'd been homeless before (Measure 5.1) or returned to homelessness (Measure 2), still search every CoC project.

The tiles are styled to match baltimorecity.gov (Proxima Nova where the host page loads it, otherwise Nunito Sans). To adapt them to a different site, override these CSS custom properties on `.bkpi`: `--bkpi-font`, `--bkpi-surface`, `--bkpi-border`, `--bkpi-accent` (top stripe), `--bkpi-eyebrow` (measure label), `--bkpi-text`, `--bkpi-text-secondary`, `--bkpi-good`, `--bkpi-bad`, `--bkpi-neutral`.

## 3. Raw JSON

For anything else (a chart library, a report generator, another dashboard):

```js
display(html`<pre><code>${`${base}data/spm.json`}</code></pre>`);
```

## KPI definitions

```js
display(Inputs.table(spm.kpis.map((d) => ({id: d.id, measure: d.measure, title: d.title, definition: d.description})), {layout: "auto", rows: 12}));
```
