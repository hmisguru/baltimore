// Renders the City Performance Measures dashboard
// (src/data/city-performance.json.py) -- one card per measure, each with a
// current-quarter stat, a quarterly trend line against the current city
// fiscal year's target, an actual-vs-target table per complete CFY, and the
// measure's own methodology collapsed below (same pattern as every other
// dashboard on this site: see the dashboard-dark-theme and
// dashboard-collapsible-description skills).

import * as Plot from "npm:@observablehq/plot";
import {format as d3format} from "npm:d3-format";
import {html} from "npm:htl";
import {resize} from "observablehq:stdlib";

const integer = d3format(",~f");
const percent = d3format(".1%");

function formatValue(value, format) {
  return format === "percent" ? percent(value) : integer(value);
}

// Same Improved/Worsened/unchanged convention as kpi.js's statusOf(), just
// comparing the latest quarter to the one before it rather than to a prior
// fiscal year -- this dashboard's cadence is quarterly, not annual.
function statusOf(diff, format, better) {
  const epsilon = format === "percent" ? 0.0005 : 0.5;
  if (Math.abs(diff) < epsilon) return "unchanged";
  if (!better) return "neutral";
  return (diff < 0) === (better === "lower") ? "improved" : "worsened";
}

// selectedLabel picks which quarter the stat/chart-highlight are "viewing"
// (the quarter-picker slider in index.md); defaults to the latest quarter
// when omitted, e.g. for a page that never wires up the slider.
function selectedIndex(quarters, selectedLabel) {
  const i = selectedLabel ? quarters.findIndex((q) => q.label === selectedLabel) : -1;
  return i === -1 ? quarters.length - 1 : i;
}

function renderStat(measure, selectedLabel) {
  const quarters = measure.quarters;
  const i = selectedIndex(quarters, selectedLabel);
  const selected = quarters[i];
  const previous = quarters[i - 1];
  const diff = previous ? selected.value - previous.value : null;
  const status = previous ? statusOf(diff, measure.format, measure.better) : "unchanged";
  const arrow = diff == null ? "" : diff > 0 ? "▲" : diff < 0 ? "▼" : "●";

  const valueNode = html`<span class="cpm-value">${formatValue(selected.value, measure.format)}${measure.format === "number" ? html`<span class="cpm-value-unit">${measure.unit}</span>` : ""}</span>`;

  const delta = html`<span class="cpm-delta" data-status=${status}>${previous ? `${arrow} ${formatValue(Math.abs(diff), measure.format)} vs ${previous.label}` : ""}</span>`;

  const isLatest = i === quarters.length - 1;
  return html`<div>
    <div class="cpm-stat-row">${valueNode}${delta}</div>
    <p class="cpm-quarter-label">${selected.label} ${isLatest ? "(latest complete quarter)" : "(selected quarter)"}</p>
  </div>`;
}

function renderTrendChart(measure, selectedLabel) {
  const data = measure.quarters;
  const i = selectedIndex(data, selectedLabel);
  const selectedPoint = data[i];
  const latestCfyTarget = measure.annual.length ? measure.annual[measure.annual.length - 1].target : null;
  const fmt = measure.format === "percent" ? percent : integer;
  return resize((width) => Plot.plot({
    width,
    height: 160,
    marginLeft: measure.format === "percent" ? 44 : 50,
    // Default marginBottom isn't enough room for -35deg rotated labels as
    // long as "CFY27 Q1" -- without this they clip against the bottom of
    // the chart's own SVG, not just crowd the table below it. 48px
    // confirmed against the actual rendered label bounding boxes, not
    // just eyeballed.
    marginBottom: 48,
    x: {domain: data.map((d) => d.label), label: null, tickRotate: -35},
    y: {grid: true, label: null, tickFormat: fmt, nice: true},
    marks: [
      latestCfyTarget == null ? null : Plot.ruleY([latestCfyTarget], {stroke: "var(--cpm-muted)", strokeDasharray: "3,3"}),
      Plot.ruleX([selectedPoint.label], {stroke: "var(--cpm-purple)", strokeDasharray: "2,2", strokeOpacity: 0.6}),
      Plot.line(data, {x: "label", y: "value", stroke: "var(--series-1)", strokeWidth: 2, curve: "catmull-rom"}),
      Plot.dot(data, {x: "label", y: "value", fill: "var(--series-1)", r: 3, tip: {format: {y: fmt}}}),
      Plot.dot([selectedPoint], {x: "label", y: "value", fill: "var(--cpm-purple)", stroke: "var(--cpm-surface)", strokeWidth: 2, r: 6}),
      Plot.ruleY([0])
    ]
  }));
}

function renderAnnualTable(measure) {
  if (!measure.annual.length) return null;
  const fmt = measure.format === "percent" ? percent : integer;
  return html`<table class="cpm-annual-table">
    <thead><tr><th scope="col">Fiscal Year</th><th scope="col">Actual</th><th scope="col">Target</th></tr></thead>
    <tbody>
      ${measure.annual.map((a) => {
        // No inherent direction (measure.better is null, e.g. es-beds) -- never highlight
        // "met", same neutral treatment as statusOf()'s own !better case.
        const met = !measure.better ? false : measure.better === "higher" ? a.value >= a.target : a.value <= a.target;
        return html`<tr>
          <th scope="row">${a.cfy}</th>
          <td data-met=${met}>${fmt(a.value)}</td>
          <td>${fmt(a.target)}</td>
        </tr>`;
      })}
    </tbody>
  </table>`;
}

function renderMeasure(measure, selectedLabel) {
  return html`<section class="cpm-card" data-measure=${measure.id}>
    <p class="cpm-card-eyebrow">Measure ${measure.measureId}</p>
    <h3 class="cpm-card-title">${measure.title}</h3>
    ${renderStat(measure, selectedLabel)}
    <div class="cpm-chart">${renderTrendChart(measure, selectedLabel)}</div>
    ${renderAnnualTable(measure)}
    <details class="cpm-card-details">
      <summary>About this data</summary>
      <p>${measure.description}</p>
    </details>
  </section>`;
}

/** All measures, grouped into one responsive grid per service category --
 * each category gets its own heading, in the order its measures first
 * appear in doc.measures (the workbook's own service order).
 * @param {string} [selectedLabel] a quarter label (e.g. "CFY27 Q1") to show
 *   each card's stat/chart-highlight for -- see the quarter-picker slider in
 *   index.md. Defaults to the latest quarter when omitted. */
export function renderMeasures(doc, selectedLabel) {
  const byService = new Map();
  for (const m of doc.measures) {
    if (!byService.has(m.service)) byService.set(m.service, []);
    byService.get(m.service).push(m);
  }
  return html`<div class="cpm-services">${[...byService].map(([service, measures]) => html`<section class="cpm-service">
    <h2 class="cpm-service-heading">${service}</h2>
    <div class="cpm-grid">${measures.map((m) => renderMeasure(m, selectedLabel))}</div>
  </section>`)}</div>`;
}

/** The last n quarters' {cfy, quarter, label} (default 5: the current
 * quarter plus the 4 before it), for the quarter-picker slider. Every
 * measure shares the same quarters list, so the first one stands for all. */
export function recentQuarters(doc, n = 5) {
  return doc.measures[0].quarters.slice(-n).map(({cfy, quarter, label}) => ({cfy, quarter, label}));
}

const eastern = (iso, options) => new Date(iso).toLocaleString("en-US", {timeZone: "America/New_York", ...options});

/** "Dashboard refreshed …", in Eastern time. */
export function renderFootnote(doc) {
  return html`<p class="cpm-footnote">Dashboard refreshed ${eastern(doc.generated, {dateStyle: "medium", timeStyle: "short"})}. HMIS export dated ${doc.export_end}.</p>`;
}

const THEME_KEY = "cpm-theme";

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
 * city-performance.css for the [data-theme] styling this drives on <html>.
 * Same button-not-switch convention as every other dashboard on this site. */
export function renderThemeToggle() {
  const theme = storedTheme() === "dark" ? "dark" : "light";
  applyTheme(theme);

  const label = (t) => (t === "dark" ? "☀️ Light mode" : "🌙 Dark mode");
  const button = html`<button type="button" class="cpm-theme-toggle">${label(theme)}</button>`;
  button.setAttribute("aria-pressed", String(theme === "dark"));
  button.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(next);
    button.setAttribute("aria-pressed", String(next === "dark"));
    button.textContent = label(next);
  });
  return button;
}
