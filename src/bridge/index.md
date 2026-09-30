---
title: Bridge to Housing (prototype)
toc: false
---

```js
import {renderNotes, renderTab} from "../components/bridge.js";
const bridge = FileAttachment("../data/bridge.json").json();
```

<div class="bridge-header">
  <p class="bridge-eyebrow">Prototype</p>
  <h1>${bridge.name}</h1>
  <p class="bridge-lede">${bridge.description}</p>
</div>

```js
const [householdFilter, projectFilter] = bridge.filters;
const household = Inputs.select(householdFilter.options, {label: "Household type", value: householdFilter.default});
const project = Inputs.select(projectFilter.options, {label: "Project type", value: projectFilter.default});
const tabs = Inputs.radio(bridge.tabs.map((t) => t.name), {value: bridge.tabs[0].name});
tabs.classList.add("bridge-tabs");
const householdValue = Generators.input(household);
const projectValue = Generators.input(project);
const tabValue = Generators.input(tabs);
display(html`<div class="bridge-controls">${household}${project}</div>`);
display(tabs);
```

```js
display(renderTab(bridge, tabValue, [householdValue, projectValue]));
```

<details class="bridge-about">
  <summary>About this dashboard</summary>

```js
display(renderNotes(bridge));
```

</details>

```js
const eastern = (iso, options) => new Date(iso).toLocaleString("en-US", {timeZone: "America/New_York", ...options});
const sourceNote = bridge.source_modified ? `Source data last updated ${eastern(bridge.source_modified, {dateStyle: "medium"})} · ` : "";
display(html`<p class="bridge-footnote">${sourceNote}Dashboard refreshed ${eastern(bridge.generated, {dateStyle: "medium", timeStyle: "short"})}.</p>`);
```

<style>
:root { --bridge-purple: #60397c; --bridge-deep: #2f1c3d; --bridge-gold: #fabe21; --bridge-surface: #f4fafb; --bridge-border: #d9e7ea; --bridge-muted: #4f4a57; }
#observablehq-main { max-width: 1280px; }
.bridge-header h1 { margin: 0.1em 0 0.2em; max-width: none; }
.bridge-eyebrow { margin: 0; font-size: 13px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--bridge-purple); }
.bridge-lede { margin: 0 0 1.2em; color: var(--bridge-muted); max-width: 70ch; }
.bridge-controls { display: flex; flex-wrap: wrap; gap: 8px 32px; margin-bottom: 8px; }
.bridge-controls form { width: auto; }
.bridge-controls label { font-weight: 600; }
.bridge-tabs { width: 100% !important; max-width: none !important; margin: 8px 0 20px; border-bottom: 2px solid var(--bridge-border); }
.bridge-tabs > div { display: flex; flex-wrap: wrap; gap: 0; }
.bridge-tabs label { position: relative; margin: 0; padding: 10px 16px; cursor: pointer; font-weight: 600; color: var(--bridge-muted); border-bottom: 3px solid transparent; margin-bottom: -2px; }
.bridge-tabs label:has(input:checked) { color: var(--bridge-deep); border-bottom-color: var(--bridge-gold); }
.bridge-tabs label:has(input:focus-visible) { outline: 2px solid var(--bridge-purple); outline-offset: -2px; border-radius: 4px; }
.bridge-tabs input { position: absolute; opacity: 0; pointer-events: none; }
.bridge-row { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 16px; margin-bottom: 16px; }
.bridge-card { grid-column: span var(--span); min-width: 0; padding: 16px 20px; background: var(--bridge-surface); border: 1px solid var(--bridge-border); border-radius: 12px; }
.bridge-card-metric { border-top: 4px solid var(--bridge-gold); }
.bridge-note { background: #f3eef9; border-color: #e0d4ee; }
.bridge-card-title { margin: 0 0 10px; font-size: 15px; font-weight: 700; color: var(--bridge-deep); max-width: none; }
.bridge-metric { font-size: 40px; font-weight: 700; line-height: 1.1; color: #161616; }
.bridge-metric-text { font-size: 24px; }
.bridge-text p:first-child, .bridge-text h3:first-child { margin-top: 0; }
.bridge-text p:last-child { margin-bottom: 0; }
.bridge-empty { color: var(--bridge-muted); font-style: italic; margin: 0; }
.bridge-pill { display: inline-block; padding: 1px 8px; border-radius: 999px; }
.bridge-table-wrap { overflow-x: auto; }
.bridge-table { width: 100%; max-width: none; font-size: 14px; border-collapse: collapse; }
.bridge-table th { vertical-align: bottom; font-size: 13px; padding: 4px 8px; border-bottom: 1px solid var(--bridge-border); }
.bridge-table td { padding: 4px 8px; border-bottom: 1px solid #e6eef0; font-variant-numeric: tabular-nums; }
.bridge-table tbody tr:last-child td { border-bottom: 0; }
.bridge-about { margin: 24px 0 8px; }
.bridge-about summary { cursor: pointer; font-weight: 700; color: var(--bridge-deep); }
.bridge-footnote { font-size: 13px; color: var(--bridge-muted); max-width: none; }
@media (max-width: 760px) {
  .bridge-row { grid-template-columns: 1fr; }
  .bridge-card { grid-column: 1 / -1; }
}
</style>
