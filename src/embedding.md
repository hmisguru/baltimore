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

Use `embed/all` for every KPI in a responsive grid (give it a height of about 640px on desktop). Add `?theme=light` or `?theme=dark` to the URL to override the viewer's system theme.

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

Options: `{theme: "light" | "dark", description: false, footer: false}`.

To match your site's look, override these CSS custom properties on `.bkpi`: `--bkpi-font`, `--bkpi-surface`, `--bkpi-border`, `--bkpi-text`, `--bkpi-text-secondary`, `--bkpi-good`, `--bkpi-bad`.

## 3. Raw JSON

For anything else (a chart library, a report generator, another dashboard):

```js
display(html`<pre><code>${`${base}data/spm.json`}</code></pre>`);
```

## KPI definitions

```js
display(Inputs.table(spm.kpis.map((d) => ({id: d.id, measure: d.measure, title: d.title, definition: d.description})), {layout: "auto", rows: 12}));
```
