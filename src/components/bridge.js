// Renders the Bridge to Housing dashboard (bridge/balbridge.yml) from the
// build-time results in src/data/bridge.json: one renderer per DAC widget type,
// driven by each widget's own display config (fields, formats, widths), so the
// YAML stays the single definition of what each widget shows.

import * as Plot from "npm:@observablehq/plot";
import {format as d3format} from "npm:d3-format";
import {marked} from "npm:marked";
import {html} from "npm:htl";
import {resize} from "observablehq:stdlib";

// Validated categorical palette (dataviz skill reference instance, light mode):
// assigned in this fixed order, never cycled.
const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];

/** The widget's result for the chosen filters, as an array of row objects. */
export function widgetRows(bridge, widget, filterValues) {
  const qid = bridge.results[filterValues.join("|")]?.[widget.id];
  if (!qid) return [];
  const {columns, rows} = bridge.data[qid];
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
  return html`<p class="bridge-empty">No data for this selection.</p>`;
}

function renderMetric(widget, rows) {
  if (!rows.length) return empty();
  const {field, format, type} = widget.value ?? {};
  const raw = rows[0][field];
  const text = type === "number" && raw != null ? numberFormat(format)(raw) : raw ?? "—";
  const signed = type === "number" && format?.includes("%") && raw > 0 ? `+${text}` : text;
  return html`<div class="bridge-metric${type === "number" ? "" : " bridge-metric-text"}">${signed}</div>`;
}

function renderText(widget) {
  const div = html`<div class="bridge-text">`;
  div.innerHTML = marked.parse(widget.content ?? "");
  return div;
}

function colorScale(domain) {
  return {domain, range: SERIES.slice(0, Math.max(domain.length, 1)), legend: true};
}

function renderLine(widget, rows) {
  const x = widget.x.field, y = widget.y.field, color = widget.color?.field;
  const fmt = numberFormat(widget.y.format);
  return resize((width) => Plot.plot({
    width,
    height: 320,
    marginLeft: 56,
    x: {type: "point", domain: uniq(rows, x), label: widget.x.title ?? null, padding: 0.3},
    y: {grid: true, zero: true, label: widget.y.title ?? null, tickFormat: fmt},
    color: color ? colorScale(uniq(rows, color)) : undefined,
    marks: [
      Plot.ruleY([0]),
      Plot.lineY(rows, {x, y, stroke: color ?? SERIES[0], strokeWidth: 2}),
      Plot.dot(rows, {x, y, fill: color ?? SERIES[0], r: 4, stroke: "var(--theme-background)", strokeWidth: 2}),
      Plot.tip(rows, Plot.pointer({x, y, stroke: color, channels: {[widget.y.title ?? y]: y}, format: {y: false, stroke: true, x: true, [widget.y.title ?? y]: fmt}}))
    ]
  }));
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

// Treemap of "Household type — Engagement state" segments becomes one stacked
// bar per household type, split by engagement state.
function renderTreemap(widget, rows) {
  const value = widget.value.field;
  const fmt = numberFormat(widget.value.format);
  const data = rows.map((d) => {
    const [group, part] = String(d[widget.label]).split(/\s+—\s+/);
    return {...d, _group: group, _part: part ?? group};
  });
  const groups = uniq(data, "_group");
  return resize((width) => Plot.plot({
    width,
    height: 60 + groups.length * 48,
    marginLeft: Math.min(200, width * 0.35),
    x: {grid: true, label: widget.value.label ?? "Households", tickFormat: fmt},
    y: {domain: groups, label: null, tickSize: 0},
    color: colorScale(uniq(data, "_part")),
    marks: [
      Plot.barX(data, Plot.stackX({y: "_group", x: value, fill: "_part", inset: 1, rx: 2, tip: {format: {x: fmt}}})),
      Plot.ruleX([0])
    ]
  }));
}

// DAC conditional formats: [{if: "greater_than_or_equal", value, ...style}, {...fallback}]
const COMPARE = {
  greater_than_or_equal: (a, b) => a >= b,
  greater_than: (a, b) => a > b,
  less_than_or_equal: (a, b) => a <= b,
  less_than: (a, b) => a < b,
  equal: (a, b) => a === b
};
const STATUS_COLORS = {green: "#0a6e0a", red: "#b3261e"};

function styleFor(rules, v) {
  for (const rule of rules ?? []) {
    if (!rule.if || COMPARE[rule.if]?.(v, rule.value)) return rule;
  }
  return null;
}

// Plain HTML tables: the dashboard's tables are small (at most a dozen or so
// rows), so every row stays visible without an inner scroll area.
function renderTable(widget, rows) {
  if (!rows.length) return empty();
  const cols = (widget.columns ?? Object.keys(rows[0]).map((name) => ({name}))).filter((c) => !c.hidden);
  const cell = (c, v) => {
    const fmt = c.number ? numberFormat(c.number) : null;
    const text = v == null ? "—" : fmt && typeof v === "number" ? fmt(v) : v;
    const rule = styleFor(c.format, v);
    if (!rule) return text;
    const bg = STATUS_COLORS[rule.backgroundColor] ?? rule.backgroundColor;
    return html`<span class="bridge-pill" style="background:${bg};color:${rule.textColor ?? "inherit"};font-weight:${rule.bold ? 700 : 400}">${text}</span>`;
  };
  const align = (c) => `text-align:${c.align ?? "left"}`;
  return html`<div class="bridge-table-wrap"><table class="bridge-table">
    <thead><tr>${cols.map((c) => html`<th scope="col" style=${align(c)}>${c.label ?? c.name}</th>`)}</tr></thead>
    <tbody>${rows.map((r) => html`<tr>${cols.map((c) => html`<td style=${align(c)}>${cell(c, r[c.name])}</td>`)}</tr>`)}</tbody>
  </table></div>`;
}

function renderWidget(bridge, widget, filterValues) {
  const rows = widgetRows(bridge, widget, filterValues);
  let body;
  if (widget.type === "text") body = renderText(widget);
  else if (widget.type === "metric") body = renderMetric(widget, rows);
  else if (widget.type === "table") body = renderTable(widget, rows);
  else if (!rows.length) body = empty();
  else if (widget.chart === "line") body = renderLine(widget, rows);
  else if (widget.chart === "bar") body = renderBar(widget, rows);
  else if (widget.chart === "pie") body = renderPie(widget, rows);
  else if (widget.chart === "treemap") body = renderTreemap(widget, rows);
  else body = html`<p class="bridge-empty">Unsupported widget type: ${widget.chart ?? widget.type}</p>`;

  const isNote = widget.type === "text";
  return html`<section class="bridge-card${isNote ? " bridge-note" : ""}${widget.type === "metric" ? " bridge-card-metric" : ""}" style="--span:${widget.col ?? 12}" data-widget=${widget.id}>
    ${isNote ? null : html`<h3 class="bridge-card-title">${widget.name}</h3>`}
    ${body}
  </section>`;
}

/** All rows of one tab, laid out on the dashboard's 12-column grid. */
export function renderTab(bridge, tabName, filterValues) {
  const tab = bridge.tabs.find((t) => t.name === tabName) ?? bridge.tabs[0];
  return html`<div class="bridge-tab">${tab.rows.map((row) => html`<div class="bridge-row">${row.map((w) => renderWidget(bridge, w, filterValues))}</div>`)}</div>`;
}

// The dashboard's untabbed text notes, shown above the filters: each note's
// opening text spans the panel, and its "### " sections (definitions) sit side
// by side below it.
export function renderAbout(bridge) {
  return html`<section class="bridge-about" aria-label="About this dashboard">${bridge.notes.map((w) => {
    const [intro, ...sections] = (w.content ?? "").split(/^### /m);
    const block = (md, cls) => {
      const div = html`<div class=${cls}>`;
      div.innerHTML = marked.parse(md);
      return div;
    };
    return html`<div class="bridge-about-note">
      ${intro.trim() ? block(intro, "bridge-text bridge-about-intro") : null}
      ${sections.length ? html`<div class="bridge-about-terms">${sections.map((sec) => block(`### ${sec}`, "bridge-text bridge-about-term"))}</div>` : null}
    </div>`;
  })}</section>`;
}
