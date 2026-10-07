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

function renderStat(measure) {
  const quarters = measure.quarters;
  const latest = quarters[quarters.length - 1];
  const previous = quarters[quarters.length - 2];
  const diff = previous ? latest.value - previous.value : null;
  const status = previous ? statusOf(diff, measure.format, measure.better) : "unchanged";
  const arrow = diff == null ? "" : diff > 0 ? "▲" : diff < 0 ? "▼" : "●";

  const valueNode = html`<span class="cpm-value">${formatValue(latest.value, measure.format)}${measure.format === "number" ? html`<span class="cpm-value-unit">${measure.unit}</span>` : ""}</span>`;

  const delta = html`<span class="cpm-delta" data-status=${status}>${previous ? `${arrow} ${formatValue(Math.abs(diff), measure.format)} vs ${previous.label}` : ""}</span>`;

  return html`<div>
    <div class="cpm-stat-row">${valueNode}${delta}</div>
    <p class="cpm-quarter-label">${latest.label} (latest complete quarter)</p>
  </div>`;
}

function renderTrendChart(measure) {
  const data = measure.quarters;
  const latestCfyTarget = measure.annual.length ? measure.annual[measure.annual.length - 1].target : null;
  const fmt = measure.format === "percent" ? percent : integer;
  return resize((width) => Plot.plot({
    width,
    height: 160,
    marginLeft: measure.format === "percent" ? 44 : 50,
    x: {domain: data.map((d) => d.label), label: null, tickRotate: -35},
    y: {grid: true, label: null, tickFormat: fmt, nice: true},
    marks: [
      latestCfyTarget == null ? null : Plot.ruleY([latestCfyTarget], {stroke: "var(--cpm-muted)", strokeDasharray: "3,3"}),
      Plot.line(data, {x: "label", y: "value", stroke: "var(--series-1)", strokeWidth: 2, curve: "catmull-rom"}),
      Plot.dot(data, {x: "label", y: "value", fill: "var(--series-1)", r: 3, tip: {format: {y: fmt}}}),
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
        const met = measure.better === "higher" ? a.value >= a.target : a.value <= a.target;
        return html`<tr>
          <th scope="row">${a.cfy}</th>
          <td data-met=${met}>${fmt(a.value)}</td>
          <td>${fmt(a.target)}</td>
        </tr>`;
      })}
    </tbody>
  </table>`;
}

function renderMeasure(measure) {
  return html`<section class="cpm-card" data-measure=${measure.id}>
    <p class="cpm-card-eyebrow">Measure ${measure.measureId}</p>
    <h3 class="cpm-card-title">${measure.title}</h3>
    ${renderStat(measure)}
    ${renderTrendChart(measure)}
    ${renderAnnualTable(measure)}
    <details class="cpm-card-details">
      <summary>About this data</summary>
      <p>${measure.description}</p>
    </details>
  </section>`;
}

/** All measures for the loaded service category, in a responsive grid. */
export function renderMeasures(doc) {
  return html`<div class="cpm-grid">${doc.measures.map(renderMeasure)}</div>`;
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
