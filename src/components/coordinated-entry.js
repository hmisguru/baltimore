// Renders the Coordinated Entry Line dashboard
// (coordinated-entry/balcoordinatedentry.yml) from the build-time results in
// src/data/coordinated-entry.json: one renderer per DAC widget type, driven
// by each widget's own display config, so the YAML stays the single
// definition of what each widget shows. Patterned after bridge.js, but for
// a single-page (no tabs, no filters) dashboard, plus a pivot_table renderer
// bridge.js doesn't need.

import * as Plot from "npm:@observablehq/plot";
import {format as d3format} from "npm:d3-format";
import {html} from "npm:htl";
import {resize} from "observablehq:stdlib";

// Validated categorical palette (dataviz skill reference instance), assigned
// in this fixed order, never cycled. Each slot is a CSS custom property
// rather than a raw hex so Plot's SVG output (which resolves var() in
// presentation attributes, same as any other CSS color) picks up the
// dark-mode step automatically -- coordinated-entry.css defines
// --series-1..8 for light mode and redefines them under
// html[data-theme="dark"] to the palette's dark steps, so toggling the
// theme recolors every chart with no re-render needed.
const SERIES = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `var(--series-${n})`);

/** The widget's result as an array of row objects. */
function widgetRows(doc, widget) {
  const result = doc.data[widget.id];
  if (!result) return [];
  const {columns, rows} = result;
  return rows.map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i]])));
}

function numberFormat(spec) {
  if (!spec || spec === "number") return d3format(",~f");
  try {
    return d3format(spec);
  } catch {
    return String;
  }
}

// Category order as it comes from SQL (the dashboard's queries already sort).
const uniq = (rows, field) => [...new Set(rows.map((d) => d[field]))];

function empty() {
  return html`<p class="ce-empty">No data for this selection.</p>`;
}

function renderMetric(widget, rows) {
  if (!rows.length) return empty();
  const {field, format, type} = widget.value ?? {};
  const raw = rows[0][field];
  const text = type === "number" && raw != null ? numberFormat(format)(raw) : raw ?? "—";
  return html`<div class="ce-metric${type === "number" ? "" : " ce-metric-text"}">${text}</div>`;
}

function colorScale(domain) {
  return {domain, range: SERIES.slice(0, Math.max(domain.length, 1)), legend: true};
}

function renderBar(widget, rows) {
  const x = widget.x.field, y = widget.y.field, color = widget.color?.field;
  const fmt = numberFormat(widget.y.format);
  return resize((width) => Plot.plot({
    width,
    height: 340,
    marginLeft: 56,
    x: {domain: uniq(rows, x), label: widget.x.title ?? null, padding: 0.3},
    y: {grid: true, label: widget.y.title ?? null, tickFormat: fmt},
    color: color ? colorScale(uniq(rows, color)) : undefined,
    marks: [
      Plot.barY(rows, Plot.stackY({x, y, fill: color ?? SERIES[0], order: uniq(rows, color), inset: 1, rx: 2, tip: {format: {y: fmt}}})),
      Plot.ruleY([0])
    ]
  }));
}

// Pie charts become sorted horizontal bars with value and share labels:
// lengths along one axis compare more accurately than angles.
function renderPie(widget, rows) {
  const label = widget.label, value = widget.value.field;
  const fmt = numberFormat(widget.value.format);
  const total = rows.reduce((s, d) => s + (d[value] ?? 0), 0);
  const pct = d3format(".0%");
  const sorted = [...rows].sort((a, b) => b[value] - a[value]);
  return resize((width) => Plot.plot({
    width,
    height: 40 + sorted.length * 36,
    marginLeft: Math.min(220, width * 0.4),
    marginRight: 110,
    x: {axis: null},
    y: {domain: sorted.map((d) => d[label]), label: null, tickSize: 0},
    marks: [
      Plot.barX(sorted, {y: label, x: value, fill: SERIES[0], rx: 2, insetTop: 6, insetBottom: 6}),
      Plot.text(sorted, {y: label, x: value, text: (d) => `${fmt(d[value])} (${pct(d[value] / total)})`, textAnchor: "start", dx: 6, fill: "currentColor"})
    ]
  }));
}

// Cross-tab: one row per `pivot.rows[0].field` value, one column per
// `pivot.columns[0].field` value, cell = summed value field. Only the one
// shape this dashboard uses is supported (single row field, single column
// field, single summed value) -- showTotals on the row field adds a Grand
// Total row (DAC semantics: showTotals on the innermost level of an axis
// adds that axis's Grand Total row/column); the columns field here has no
// showTotals, so no Grand Total column is added.
function renderPivotTable(widget, rows) {
  if (!rows.length) return empty();
  const [rowSpec] = widget.pivot.rows;
  const [colSpec] = widget.pivot.columns;
  const [valueSpec] = widget.pivot.values;
  const rowField = rowSpec.field, colField = colSpec.field, valueField = valueSpec.field;
  const fmt = numberFormat(valueSpec.format);
  const rowKeys = uniq(rows, rowField);
  const colKeys = uniq(rows, colField);
  const cellValue = (r, c) => rows.find((d) => d[rowField] === r && d[colField] === c)?.[valueField] ?? 0;
  const colTotal = (c) => rowKeys.reduce((s, r) => s + cellValue(r, c), 0);
  return html`<div class="ce-table-wrap"><table class="ce-table">
    <thead><tr><th scope="col"></th>${colKeys.map((c) => html`<th scope="col">${c}</th>`)}</tr></thead>
    <tbody>
      ${rowKeys.map((r) => html`<tr><th scope="row">${r}</th>${colKeys.map((c) => html`<td>${fmt(cellValue(r, c))}</td>`)}</tr>`)}
      ${rowSpec.showTotals ? html`<tr class="ce-total-row"><th scope="row">Total</th>${colKeys.map((c) => html`<td>${fmt(colTotal(c))}</td>`)}</tr>` : null}
    </tbody>
  </table></div>`;
}

function renderWidget(doc, widget) {
  const rows = widgetRows(doc, widget);
  let body;
  if (widget.type === "metric") body = renderMetric(widget, rows);
  else if (widget.type === "pivot_table") body = renderPivotTable(widget, rows);
  else if (!rows.length) body = empty();
  else if (widget.chart === "bar") body = renderBar(widget, rows);
  else if (widget.chart === "pie") body = renderPie(widget, rows);
  else body = html`<p class="ce-empty">Unsupported widget type: ${widget.chart ?? widget.type}</p>`;

  return html`<section class="ce-card${widget.type === "metric" ? " ce-card-metric" : ""}" style="--span:${widget.col ?? 12}" data-widget=${widget.id}>
    <h3 class="ce-card-title">${widget.name}</h3>
    ${widget.description ? html`<p class="ce-card-description">${widget.description}</p>` : null}
    ${body}
  </section>`;
}

/** All rows of the dashboard, laid out on its 12-column grid. */
export function renderRows(doc) {
  return html`<div class="ce-page">${doc.rows.map((row) => html`<div class="ce-row">${row.map((w) => renderWidget(doc, w))}</div>`)}</div>`;
}

const eastern = (iso, options) => new Date(iso).toLocaleString("en-US", {timeZone: "America/New_York", ...options});

/** "Dashboard refreshed …", in Eastern time. */
export function renderFootnote(doc) {
  return html`<p class="ce-footnote">Dashboard refreshed ${eastern(doc.generated, {dateStyle: "medium", timeStyle: "short"})}.</p>`;
}

const THEME_KEY = "ce-theme";

function storedTheme() {
  try {
    return localStorage.getItem(THEME_KEY);
  } catch {
    return null;
  }
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Private browsing / blocked storage: theme still applies for this page view.
  }
}

/** A light/dark theme toggle button, default light -- see
 * coordinated-entry.css for the [data-theme] styling this drives on <html>.
 * Remembers the visitor's choice via localStorage, but every first-ever
 * visit starts light. A plain button whose own label swaps between
 * "🌙 Dark mode" and "☀️ Light mode", matching Inventory/Bridge's toggle --
 * not a switch. No embeddable variant of this dashboard exists yet, so
 * there's no ?theme= URL-param path to wire up (see Bridge's embed page
 * if one is ever added here). */
export function renderThemeToggle() {
  const theme = storedTheme() === "dark" ? "dark" : "light";
  applyTheme(theme);

  // aria-pressed set via setAttribute, not template interpolation -- htl
  // treats an interpolated boolean as a presence-only attribute, rendering
  // an empty aria-pressed="" instead of "true"/"false" (confirmed live on
  // the Inventory dashboard's own toggle).
  const label = (t) => (t === "dark" ? "☀️ Light mode" : "🌙 Dark mode");
  const button = html`<button type="button" class="ce-theme-toggle">${label(theme)}</button>`;
  button.setAttribute("aria-pressed", String(theme === "dark"));
  button.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(next);
    button.setAttribute("aria-pressed", String(next === "dark"));
    button.textContent = label(next);
  });
  return button;
}
