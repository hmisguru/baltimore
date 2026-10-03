// Renders the Housing Inventory dashboard (inventory/balinventory.yml) from
// the build-time results in src/data/inventory.json: one renderer per DAC
// widget type, driven by each widget's own display config, so the YAML
// stays the single definition of what each widget shows. Patterned after
// bridge.js (filter-combination result lookup, Inputs.select filters), but
// this dashboard's one pivot shape -- two nested ROW levels (project type,
// then household type or project name) with no column dimension and three
// side-by-side value columns (Beds, Units, Average Utilization) -- is
// different from coordinated-entry.js's existing pivot_table renderer
// (single row field x single column field, one summed value), so it gets
// its own renderer here rather than reusing that one.

import {format as d3format} from "npm:d3-format";
import {html} from "npm:htl";
import * as Inputs from "npm:@observablehq/inputs";

/** The widget's result for the chosen filters, as an array of row objects. */
function widgetRows(doc, widget, filterValues) {
  const qid = doc.results[filterValues.join("|")]?.[widget.id];
  if (!qid) return [];
  const {columns, rows} = doc.data[qid];
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

const uniq = (rows, field) => [...new Set(rows.map((d) => d[field]))];

function empty() {
  return html`<p class="inv-empty">No data for this selection.</p>`;
}

function renderMetric(widget, rows) {
  if (!rows.length) return empty();
  const {field, format, type} = widget.value ?? {};
  const raw = rows[0][field];
  const text = type === "number" && raw != null ? numberFormat(format)(raw) : raw ?? "—";
  return html`<div class="inv-metric${type === "number" ? "" : " inv-metric-text"}">${text}</div>`;
}

// Groups the 6 bed-count tiles by where they sit on the housing continuum --
// per explicit request, a categorical grouping with no good/bad judgment
// attached, so these reuse this site's validated categorical hues (the same
// blue/orange/aqua triple bridge.js's System Engagement tiles already use,
// for visual consistency across the site) rather than a status palette.
// "Methodology" isn't part of this grouping and keeps its neutral gold
// accent (see .inv-card-metric in inventory.css).
const HOUSING_GROUPS = {
  "Emergency Shelter Beds": "crisis",
  "Safe Haven Beds": "crisis",
  "Transitional Housing Beds": "bridge",
  "Rapid Re-Housing Beds": "bridge",
  "Permanent Supportive Housing Beds": "permanent",
  "Other Permanent Housing Beds": "permanent",
};

// Display-only title override, per explicit request -- balinventory.yml's
// own `name` field stays a verbatim copy of DAC's source (per CLAUDE.md),
// so this only renames what's rendered. Also swapped into any widget's
// description text (e.g. the second pivot table's own description refers
// back to the first one by name), so the cross-reference stays consistent.
const TITLE_OVERRIDES = {"Current Inventory by Project Type": "Current Inventory by Household Type"};

function displayTitle(name) {
  return TITLE_OVERRIDES[name] ?? name;
}

function displayText(text) {
  if (!text) return text;
  return Object.entries(TITLE_OVERRIDES).reduce((out, [from, to]) => out.split(from).join(to), text);
}

// Dark variants use this site's own dark accent steps (dataviz skill
// reference palette) at the card-surface-blended tints kpi.js's own
// data-theme="dark" surface (#2f1c3d) already establishes for this site --
// validated with scripts/validate_palette.js against that exact surface.
const GROUP_STYLE = {
  crisis: {
    accent: "#2a78d6", bg: "#ebf2f9", border: "#b6cfed", label: "Crisis housing",
    accentDark: "#3987e5", bgDark: "#312d58", borderDark: "#33457d"
  },
  bridge: {
    accent: "#eb6834", bg: "#f9efeb", border: "#edc5b6", label: "Bridge housing",
    accentDark: "#d95926", bgDark: "#4a2639", borderDark: "#703334"
  },
  permanent: {
    accent: "#1baf7a", bg: "#ebf9f4", border: "#b6edd9", label: "Permanent housing",
    accentDark: "#199e70", bgDark: "#2b3145", borderDark: "#274d50"
  },
};

// Minimal line icons (stroke-based, 1.75px, round caps -- one shared family),
// purely decorative reinforcement of the group label already in the tile
// title, so each is aria-hidden rather than needing its own alt text.
const GROUP_ICONS = {
  crisis: `<path d="M2 17v3M2 17v-5a2 2 0 0 1 2-2h4v4"/><path d="M2 17h20v-3a2 2 0 0 0-2-2h-9"/><path d="M22 17v3"/><rect x="4" y="10" width="5" height="4" rx="1"/>`,
  bridge: `<path d="M4 20v-4h4v-4h4v-4h4v-4h4"/>`,
  permanent: `<path d="M3 11l9-7 9 7"/><path d="M5 10v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9"/><path d="M9 20v-5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v5"/>`,
};

function groupIcon(group) {
  const path = GROUP_ICONS[group];
  if (!path) return null;
  const svg = `<svg class="inv-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
  const span = document.createElement("span");
  span.innerHTML = svg;
  return span.firstChild;
}

// Gradient cell backgrounds: DAC's conditional-format "no if" layer
// (backgroundColor: a list of named colors, range: the value at each
// stop, unit: absolute -- the range values ARE the raw data values, not
// percentiles). Light pastel stops (not the saturated token names
// themselves) so dark body text stays readable at every point along the
// gradient, the same convention the create-dashboard skill's own gradient
// example uses.
const GRADIENT_COLORS = {red: "#FECACA", amber: "#FDE68A", green: "#BBF7D0"};

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function gradientFor(formatLayers, value) {
  const layer = (formatLayers ?? []).find((l) => !l.if && Array.isArray(l.backgroundColor));
  if (!layer || value == null) return null;
  const stops = layer.range ?? layer.backgroundColor.map((_, i) => i / (layer.backgroundColor.length - 1));
  const colors = layer.backgroundColor.map((c) => GRADIENT_COLORS[c] ?? c);
  if (value <= stops[0]) return colors[0];
  if (value >= stops[stops.length - 1]) return colors[colors.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (value >= stops[i] && value <= stops[i + 1]) {
      const t = (value - stops[i]) / (stops[i + 1] - stops[i]);
      const [r1, g1, b1] = hexToRgb(colors[i]);
      const [r2, g2, b2] = hexToRgb(colors[i + 1]);
      const mix = (a, b) => Math.round(a + (b - a) * t);
      return `rgb(${mix(r1, r2)},${mix(g1, g2)},${mix(b1, b2)})`;
    }
  }
  return null;
}

// Canonical display order, matching this dashboard's own metric tile order
// (crisis/temporary housing first, then permanent) rather than SQL's
// arbitrary GROUP BY order.
const PROJECT_TYPE_ORDER = [
  "Emergency Shelter", "Safe Haven", "Transitional Housing",
  "Rapid Re-Housing", "Permanent Supportive Housing", "Other Permanent Housing"
];
const HOUSEHOLD_TYPE_ORDER = [
  "Households with Adults Only", "Households with Adults and Children",
  "Unaccompanied Minors", "Unknown HH Type"
];

function sortByOrder(keys, order) {
  if (!order) return [...keys].sort();
  return [...keys].sort((a, b) => {
    const ai = order.indexOf(a), bi = order.indexOf(b);
    return (ai === -1 ? order.length : ai) - (bi === -1 ? order.length : bi);
  });
}

// Nested-row pivot: two row levels (no column dimension), one column per
// `pivot.values[]` entry. The outer level's value is shown once per group
// via rowspan; each value column's own `columns[]` number format and
// conditional-format rules (including the gradient case above) apply per
// cell. The underlying queries already pre-aggregate to this exact
// (outer, inner) grain, so this is a pure layout transform, not a
// client-side re-aggregation.
function renderNestedPivot(widget, rows) {
  if (!rows.length) return empty();
  const [outerSpec, innerSpec] = widget.pivot.rows;
  const outerField = outerSpec.field, innerField = innerSpec.field;
  const valueSpecs = widget.pivot.values;
  const columnFormat = (label) => widget.columns?.find((c) => c.name === label)?.number;

  const outerOrder = outerField === "project_type_label" ? PROJECT_TYPE_ORDER : null;
  const innerOrder = innerField === "household_type_label" ? HOUSEHOLD_TYPE_ORDER : null;

  const outerKeys = sortByOrder(uniq(rows, outerField), outerOrder);
  const groups = outerKeys.map((ok) => ({
    key: ok,
    inner: sortByOrder(uniq(rows.filter((r) => r[outerField] === ok), innerField), innerOrder)
  }));
  const cellRow = (ok, ik) => rows.find((r) => r[outerField] === ok && r[innerField] === ik);

  return html`<div class="inv-table-wrap"><table class="inv-table">
    <thead><tr>
      <th scope="col"></th><th scope="col"></th>
      ${valueSpecs.map((v) => html`<th scope="col">${v.label}</th>`)}
    </tr></thead>
    <tbody>${groups.flatMap(({key, inner}) => inner.map((ik, i) => {
      const r = cellRow(key, ik);
      return html`<tr>
        ${i === 0 ? html`<th scope="row" rowspan=${inner.length}>${key}</th>` : null}
        <th scope="row">${ik}</th>
        ${valueSpecs.map((v) => {
          const val = r?.[v.field];
          const fmt = numberFormat(columnFormat(v.label));
          const text = val == null ? "—" : fmt(val);
          const bg = gradientFor(v.format, val);
          // The gradient stays light-pastel in both themes (see
          // GRADIENT_COLORS above), so its cells need dark text forced
          // regardless of theme -- otherwise dark mode's page-wide light
          // text color would wash out against these light backgrounds.
          const style = bg ? `background:${bg};color:#161616` : "";
          return html`<td style=${style}>${text}</td>`;
        })}
      </tr>`;
    }))}</tbody>
  </table></div>`;
}

function renderWidget(doc, widget, filterValues) {
  const rows = widgetRows(doc, widget, filterValues);
  let body;
  if (widget.type === "metric") body = renderMetric(widget, rows);
  else if (widget.type === "pivot_table") body = renderNestedPivot(widget, rows);
  else body = html`<p class="inv-empty">Unsupported widget type: ${widget.type}</p>`;

  const group = HOUSING_GROUPS[widget.name];
  const style = group ? GROUP_STYLE[group] : null;
  const cardClass = `inv-card${widget.type === "metric" ? " inv-card-metric" : ""}${group ? " inv-card-housing" : ""}`;
  const cardStyle = `--span:${widget.col ?? 12}` + (style
    ? `;--tile-accent:${style.accent};--tile-bg:${style.bg};--tile-border:${style.border}` +
      `;--tile-accent-dark:${style.accentDark};--tile-bg-dark:${style.bgDark};--tile-border-dark:${style.borderDark}`
    : "");

  // Pivot tables carry a long explanatory paragraph (what's nested under
  // what, how utilization is computed) -- collapsed by default and moved
  // below the table, so the table itself is the first thing in view.
  // Other widget types keep their description as a plain lede above the
  // body, unchanged.
  const isPivot = widget.type === "pivot_table";
  const description = widget.description
    ? isPivot
      ? html`<details class="inv-card-details"><summary>About this table</summary><p class="inv-card-description">${displayText(widget.description)}</p></details>`
      : html`<p class="inv-card-description">${displayText(widget.description)}</p>`
    : null;

  return html`<section class="${cardClass}" style="${cardStyle}" data-widget=${widget.id}>
    <h3 class="inv-card-title">${group ? groupIcon(group) : null}${displayTitle(widget.name)}</h3>
    ${isPivot ? null : description}
    ${body}
    ${isPivot ? description : null}
  </section>`;
}

/** All rows of the dashboard, laid out on its 12-column grid, for the chosen filters. */
export function renderRows(doc, filterValues) {
  return html`<div class="inv-page">${doc.rows.map((row) => html`<div class="inv-row">${row.map((w) => renderWidget(doc, w, filterValues))}</div>`)}</div>`;
}

// Loose matching for option names given in a URL: case, spaces and
// punctuation are ignored, same convention as bridge.js's own `match()`.
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const match = (options, value) => (value == null ? undefined : options.find((o) => slug(o) === slug(value)));

/**
 * The two filter selects, starting from the dashboard's defaults unless
 * `initial` names a valid {household, participation}. Filter values stay in
 * the dashboard's own order (household_type, hmis_participation) for result
 * lookups.
 */
export function inventoryInputs(doc, initial = {}) {
  const [householdFilter, participationFilter] = doc.filters;
  const household = Inputs.select(householdFilter.options, {label: "Household type", value: match(householdFilter.options, initial.household) ?? householdFilter.default});
  const participation = Inputs.select(participationFilter.options, {label: "HMIS participation", value: match(participationFilter.options, initial.participation) ?? participationFilter.default});
  return {household, participation, controls: html`<div class="inv-controls">${household}${participation}</div>`};
}

const eastern = (iso, options) => new Date(iso).toLocaleString("en-US", {timeZone: "America/New_York", ...options});

/** "Dashboard refreshed …", in Eastern time. */
export function renderFootnote(doc) {
  return html`<p class="inv-footnote">Dashboard refreshed ${eastern(doc.generated, {dateStyle: "medium", timeStyle: "short"})}.</p>`;
}

const THEME_KEY = "inv-theme";

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

/** A light/dark theme toggle button, default light -- see inventory.css for
 * the [data-theme] styling this drives on <html> (so it also recolors
 * Framework's own page chrome, not just .inv-* elements). Remembers the
 * visitor's choice via localStorage, but every first-ever visit starts
 * light. A plain button whose own label swaps between "🌙 Dark mode" and
 * "☀️ Light mode", per explicit request -- not a switch. */
export function renderThemeToggle() {
  const theme = storedTheme() === "dark" ? "dark" : "light";
  applyTheme(theme);

  // aria-pressed set via setAttribute, not template interpolation -- htl
  // treats it as a presence-only boolean attribute (confirmed live for the
  // equivalent aria-checked case: interpolating a boolean rendered an empty
  // aria-pressed="" instead of "true"/"false").
  const label = (t) => (t === "dark" ? "☀️ Light mode" : "🌙 Dark mode");
  const button = html`<button type="button" class="inv-theme-toggle">${label(theme)}</button>`;
  button.setAttribute("aria-pressed", String(theme === "dark"));
  button.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(next);
    button.setAttribute("aria-pressed", String(next === "dark"));
    button.textContent = label(next);
  });
  return button;
}
