// Renders the Bridge to Housing dashboard (bridge/balbridge.yml) from the
// build-time results in src/data/bridge.json: one renderer per DAC widget type,
// driven by each widget's own display config (fields, formats, widths), so the
// YAML stays the single definition of what each widget shows.

import * as Plot from "npm:@observablehq/plot";
import {format as d3format} from "npm:d3-format";
import {marked} from "npm:marked";
import {html} from "npm:htl";
import * as Inputs from "npm:@observablehq/inputs";
import {hierarchy, treemap as d3treemap} from "npm:d3-hierarchy";
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

// True treemap: d3-hierarchy computes the rectangle layout (Plot has no
// hierarchical-layout mark of its own), Plot.rect draws it so it stays
// visually/interactively consistent with the rest of this file (color
// scale, Plot.tip, resize()). Two-level hierarchy: widget.label split on
// " — " gives the group (household type) and part (engagement state);
// group nodes get a padded header strip for their own label, leaves are
// colored individually from the widget's own `slices` map in the YAML
// (keyed by the full "Group — Part" label) -- the only widget on this
// dashboard that uses those per-segment colors, since the previous
// stacked-bar rendering never read widget.slices at all.
//
// A round (circle-packing) version of this widget was tried and shipped
// for a while, then reverted back to this rectangular version per explicit
// request -- d3.pack() can't be made to fill a wide card efficiently (a
// circle inscribed in a box never reaches the box's own corners), and
// neither capping+centering the diagram nor narrowing its card to match
// fully resolved how that looked in practice. Squarify tiling doesn't have
// that problem: it adapts to any aspect ratio, so this version uses the
// widget's full card width directly. See git history (the commits touching
// this function between the two "true treemap" messages) for the round
// version's code if it's ever worth revisiting.
function renderTreemap(widget, rows) {
  if (!rows.length) return empty();
  const value = widget.value.field;
  const fmt = numberFormat(widget.value.format);
  const data = rows.map((d) => {
    const [group, part] = String(d[widget.label]).split(/\s+—\s+/);
    return {...d, _group: group, _part: part ?? group};
  });
  const groups = uniq(data, "_group");
  const segments = uniq(data, widget.label);
  const slices = widget.slices ?? {};
  const color = {
    domain: segments,
    range: segments.map((s, i) => slices[s]?.color ?? SERIES[i % SERIES.length])
  };
  const HEADER = 22;

  const root = hierarchy({children: groups.map((g) => ({name: g, children: data.filter((d) => d._group === g)}))})
    .sum((d) => d[value] ?? 0)
    .sort((a, b) => b.value - a.value);

  return resize((width) => {
    const height = 70 + groups.length * 130;
    d3treemap().size([width, height]).paddingOuter(4).paddingTop(HEADER).paddingInner(2)(root);
    const leaves = root.leaves();
    const big = leaves.filter((d) => d.x1 - d.x0 > 64 && d.y1 - d.y0 > 30);
    return Plot.plot({
      width,
      height,
      marginLeft: 0,
      marginRight: 0,
      marginTop: 0,
      marginBottom: 0,
      x: {domain: [0, width], axis: null},
      y: {domain: [height, 0], axis: null},
      color,
      marks: [
        // Group header bands + labels (household type)
        Plot.rect(root.children, {x1: "x0", x2: "x1", y1: "y0", y2: (d) => Math.min(d.y0 + HEADER, d.y1), fill: "currentColor", fillOpacity: 0.06}),
        Plot.text(root.children, {x: "x0", y: "y0", dx: 6, dy: 14, text: (d) => d.data.name, textAnchor: "start", fontWeight: 700, fontSize: 12, fill: "currentColor"}),
        // Leaves (engagement state within each household type), colored by segment
        Plot.rect(leaves, {
          x1: "x0", x2: "x1", y1: "y0", y2: "y1",
          fill: (d) => d.data[widget.label],
          stroke: "var(--theme-background)",
          strokeWidth: 1.5,
          inset: 0.5,
          rx: 2,
          channels: {
            "Household type": (d) => d.data._group,
            "Engagement state": (d) => d.data._part,
            [widget.value.label ?? "Households"]: (d) => d.data[value]
          },
          tip: {
            format: {
              x: false,
              y: false,
              fill: false,
              "Household type": true,
              "Engagement state": true,
              [widget.value.label ?? "Households"]: fmt
            }
          }
        }),
        Plot.text(big, {x: (d) => (d.x0 + d.x1) / 2, y: (d) => (d.y0 + d.y1) / 2, dy: -6, text: (d) => d.data._part, fill: "white", fontWeight: 600, fontSize: 11}),
        Plot.text(big, {x: (d) => (d.x0 + d.x1) / 2, y: (d) => (d.y0 + d.y1) / 2, dy: 10, text: (d) => fmt(d.data[value]), fill: "white", fontSize: 11})
      ]
    });
  });
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

// Plain-language merge of a bare current-quarter count metric widget with a
// "... — Trend" widget (a one-row table of pct_of_average/comparison_label/
// rolling_avg_4q) into a single tile: the big number, plus one sentence
// instead of a separate badge column a reader has to cross-reference against
// "4-Quarter Average" and "Comparison" columns themselves. The arrow encodes
// direction (above/below average) and the color encodes whether that's good
// or bad for this measure -- pulled from the trend widget's own
// pct_of_average column `format` rule via styleFor(), the same lookup
// renderTable() uses, so a widget like "Returns After Placement — Trend"
// (where *below* average is green, the opposite of the exits widget) colors
// correctly without a widget-specific special case here.
function renderExitsSummary(metricWidget, trendWidget, metricRows, trendRows) {
  if (!metricRows.length || !trendRows.length) return empty();
  const value = numberFormat(metricWidget.value.format)(metricRows[0][metricWidget.value.field]);
  const {pct_of_average, rolling_avg_4q} = trendRows[0];
  const above = pct_of_average >= 1;
  const pct = d3format(".1%")(pct_of_average);
  const avg = numberFormat("number")(rolling_avg_4q);
  const pctColumn = trendWidget.columns?.find((c) => c.name === "pct_of_average");
  const rule = styleFor(pctColumn?.format, pct_of_average);
  const bg = STATUS_COLORS[rule?.backgroundColor] ?? rule?.backgroundColor ?? STATUS_COLORS[above ? "green" : "red"];
  return html`<div class="bridge-metric">${value}</div>
    <p class="bridge-exits-pill" style="background:${bg}">${above ? "▲" : "▼"} ${pct} ${above ? "above" : "below"} the ${avg} average based on the previous 12 months</p>`;
}

// Width override for a widget whose YAML `col` reads too wide on this site.
// "Current Quarter" and "Project Type Filter Note" aren't here even though
// they're also resized -- their width depends on which tab they're on (see
// mergeQuarterTopRow below), so they're set directly via a `col` override on
// the merged row's widgets instead of this fixed, name-keyed table.
// "Top Permanent Destinations This Quarter" keeps its YAML col:5 only
// because it used to share a row with the exits summary tile;
// restructurePositiveOutcomesRows() below moves it to its own row beneath
// the two summary tiles. It's pinned to 6/12 (rather than the full 12/12)
// to match the width of "Households Exiting to Permanent Housing" directly
// above it -- grid auto-placement puts it at column 1 same as that tile, so
// it lines up on the left edge too, not just width.
const SPAN_OVERRIDES = {
  "Top Permanent Destinations This Quarter": 6
};

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
  const span = SPAN_OVERRIDES[widget.name] ?? widget.col ?? 12;
  return html`<section class="bridge-card${isNote ? " bridge-note" : ""}${widget.type === "metric" ? " bridge-card-metric" : ""}" style="--span:${span}" data-widget=${widget.id}>
    ${isNote ? null : html`<h3 class="bridge-card-title">${widget.name}</h3>`}
    ${body}
  </section>`;
}

// Glossary of the 4 engagement states shown on the System Engagement tab's
// treemap and quarter-over-quarter table -- not a DAC widget, so it's a
// hand-built component (like renderAbout) rather than something driven by
// bridge/balbridge.yml. Labels match the chart's own labels (the SQL's
// `CASE ... AS engagement_state` in that YAML) exactly, including
// "Recurring" per explicit choice, so there's no mismatch between this
// glossary and what the chart below it actually says.
const ENGAGEMENT_STATES = [
  {
    label: "Established",
    accent: "#2a78d6", bg: "#ebf2f9", border: "#b6cfed",
    definition: "Continuously homeless since a prior report period — doesn't fit the other three states."
  },
  {
    label: "New",
    accent: "#eb6834", bg: "#f9efeb", border: "#edc5b6",
    definition: "First-time entry into the system, with no enrollment in the two years prior."
  },
  {
    label: "Recurring",
    accent: "#1baf7a", bg: "#ebf9f4", border: "#b6edd9",
    definition: "Re-entered the system 15–730 days after a temporary or unknown-destination exit."
  },
  {
    label: "Returned",
    accent: "#eda100", bg: "#f9f5eb", border: "#eddbb6",
    definition: "Re-entered the system 15–730 days after a permanent-housing exit."
  }
];

// households-per-state totals, keyed by ENGAGEMENT_STATES label, from the
// treemap widget's own rows -- so a tile's stat matches whatever the chart
// below it is currently showing, household-type filter included.
function engagementTotals(rows) {
  const fmt = numberFormat(",.0f");
  const totals = new Map();
  for (const r of rows) totals.set(r.engagement_state, (totals.get(r.engagement_state) ?? 0) + (r.households ?? 0));
  return (label) => (totals.has(label) ? fmt(totals.get(label)) : null);
}

function renderEngagementLegend(rows) {
  const totalFor = engagementTotals(rows);
  return html`<div class="bridge-legend" aria-label="Engagement state definitions">${ENGAGEMENT_STATES.map((s) => html`
    <div class="bridge-legend-tile" style="--tile-bg:${s.bg};--tile-border:${s.border};--tile-accent:${s.accent}">
      <p class="bridge-legend-title"><span class="bridge-legend-dot"></span>${s.label}</p>
      ${totalFor(s.label) != null ? html`<p class="bridge-legend-stat">${totalFor(s.label)} <span>Households</span></p>` : null}
      <p>${s.definition}</p>
    </div>
  `)}</div>`;
}

// balbridge.yml puts "Current Quarter" in its own full-width row at the top
// of every tab, with a different row right after depending on the tab:
// three tabs (System Engagement, Length of Time, Positive Outcomes) follow
// it with the "Project Type Filter Note" text widget; the other two
// (Overview, Demographics) follow it with "People Served in Interim
// Housing" + "Households Served in Interim Housing". Both cases are merged
// into Current Quarter's row here (rather than in bridge.json.py, which
// just mirrors the YAML's row shape), with each widget's width set via a
// `col` override on a shallow copy. Current Quarter itself is a fixed 4/12
// on every tab (per explicit request, so it reads the same width wherever
// it appears); the note takes the complementary 8/12 beside it, and the two
// served-counts tiles split the other 8/12 evenly with it (4/4/4). This
// replaces the old name-keyed SPAN_OVERRIDES entries for "Current Quarter"
// and "Project Type Filter Note" with the widths set here.
const CURRENT_QUARTER_SPAN = 4;
function mergeQuarterTopRow(rows) {
  const withCol = (w, col) => ({...w, col});
  const merged = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const next = rows[i + 1];
    const nextNames = next?.map((w) => w.name) ?? [];
    if (row.length !== 1 || row[0].name !== "Current Quarter") {
      merged.push(row);
      continue;
    }
    if (next?.length === 1 && nextNames[0] === "Project Type Filter Note") {
      merged.push([withCol(row[0], CURRENT_QUARTER_SPAN), withCol(next[0], 12 - CURRENT_QUARTER_SPAN)]);
      i++;
    } else if (next?.length === 2 && nextNames.includes("People Served in Interim Housing") && nextNames.includes("Households Served in Interim Housing")) {
      merged.push([row[0], ...next].map((w) => withCol(w, CURRENT_QUARTER_SPAN)));
      i++;
    } else {
      merged.push([withCol(row[0], CURRENT_QUARTER_SPAN)]);
    }
  }
  return merged;
}

// Positive Outcomes pairs a bare current-quarter count metric with a
// "... — Trend" one-row table, for each of these two measures.
// renderRowWidgets() below replaces every such pair found in a row with one
// combined card (renderExitsSummary), leaving any other widget in the row
// untouched and in its original position. When a row ends up holding
// multiple combined cards and nothing else (restructurePositiveOutcomesRows
// below builds exactly one such row), they split the row evenly instead of
// each keeping its two source widgets' summed width, which would overflow
// the 12-column grid (7+7 > 12).
const SUMMARY_TILE_PAIRS = [
  ["Households Exiting to Permanent Housing", "Exits to Permanent Housing — Trend"],
  ["Returns After Permanent Placement", "Returns After Placement — Trend"]
];

function renderRowWidgets(bridge, row, filterValues) {
  let remaining = row;
  const pairs = [];
  for (const [metricName, trendName] of SUMMARY_TILE_PAIRS) {
    const metricWidget = remaining.find((w) => w.name === metricName);
    const trendWidget = remaining.find((w) => w.name === trendName);
    if (!metricWidget || !trendWidget) continue;
    pairs.push({metricWidget, trendWidget});
    remaining = remaining.filter((w) => w !== metricWidget && w !== trendWidget);
  }
  if (!pairs.length) return row.map((w) => renderWidget(bridge, w, filterValues));
  const evenSplit = pairs.length > 1 && !remaining.length;
  const cards = pairs.map(({metricWidget, trendWidget}) => {
    const span = evenSplit ? Math.floor(12 / pairs.length) : (metricWidget.col ?? 0) + (trendWidget.col ?? 0);
    return html`<section class="bridge-card bridge-card-metric" style="--span:${span}" data-widget=${metricWidget.id}>
      <h3 class="bridge-card-title">${metricWidget.name}</h3>
      ${renderExitsSummary(metricWidget, trendWidget, widgetRows(bridge, metricWidget, filterValues), widgetRows(bridge, trendWidget, filterValues))}
    </section>`;
  });
  return [...cards, ...remaining.map((w) => renderWidget(bridge, w, filterValues))];
}

// balbridge.yml puts the exits-summary pair + the destination breakdown
// table in one row, and the returns-summary pair alone in the row right
// after. Regrouped here into a row holding just the two summary pairs
// (which renderRowWidgets splits evenly, 6/6) and a second row holding just
// the destination table (SPAN_OVERRIDES widens it to 12/12 there).
function restructurePositiveOutcomesRows(rows) {
  const exitsRowIndex = rows.findIndex((row) => row.some((w) => w.name === "Households Exiting to Permanent Housing"));
  const returnsRowIndex = rows.findIndex((row) => row.some((w) => w.name === "Returns After Permanent Placement"));
  if (exitsRowIndex === -1 || returnsRowIndex === -1) return rows;
  const exitsRow = rows[exitsRowIndex];
  const returnsRow = rows[returnsRowIndex];
  const destinationWidget = exitsRow.find((w) => w.name === "Top Permanent Destinations This Quarter");
  const summaryRow = [...exitsRow.filter((w) => w !== destinationWidget), ...returnsRow];
  const out = rows.filter((_, i) => i !== exitsRowIndex && i !== returnsRowIndex);
  out.splice(Math.min(exitsRowIndex, returnsRowIndex), 0, summaryRow, ...(destinationWidget ? [[destinationWidget]] : []));
  return out;
}

/** All rows of one tab, laid out on the dashboard's 12-column grid. */
export function renderTab(bridge, tabName, filterValues) {
  const tab = bridge.tabs.find((t) => t.name === tabName) ?? bridge.tabs[0];
  const rows = mergeQuarterTopRow(restructurePositiveOutcomesRows(tab.rows));
  return html`<div class="bridge-tab">${rows.map((row) => {
    const treemapWidget = row.find((w) => w.name === "System engagement by household type");
    return html`
    ${treemapWidget ? renderEngagementLegend(widgetRows(bridge, treemapWidget, filterValues)) : null}
    <div class="bridge-row">${renderRowWidgets(bridge, row, filterValues)}</div>
  `;
  })}</div>`;
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

// Loose matching for option names given in a URL: case, spaces and punctuation
// are ignored, so ?tab=system-engagement or ?project=es-sh-th both work.
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const match = (options, value) => (value == null ? undefined : options.find((o) => slug(o) === slug(value)));

/**
 * The filter selects and the tab strip, starting from the dashboard's defaults
 * unless `initial` names a valid {tab, household, project}. Filter values stay
 * in the dashboard's own order (household, project) for result lookups; the
 * page shows Project type first.
 */
export function bridgeInputs(bridge, initial = {}) {
  const [householdFilter, projectFilter] = bridge.filters;
  const tabNames = bridge.tabs.map((t) => t.name);
  const household = Inputs.select(householdFilter.options, {label: "Household type", value: match(householdFilter.options, initial.household) ?? householdFilter.default});
  const project = Inputs.select(projectFilter.options, {label: "Project type", value: match(projectFilter.options, initial.project) ?? projectFilter.default});
  const tabs = Inputs.radio(tabNames, {value: match(tabNames, initial.tab) ?? tabNames[0]});
  tabs.classList.add("bridge-tabs");
  return {household, project, tabs, controls: html`<div class="bridge-controls">${project}${household}</div>`};
}

const eastern = (iso, options) => new Date(iso).toLocaleString("en-US", {timeZone: "America/New_York", ...options});

/** "Source data last updated … · Dashboard refreshed …", in Eastern time. */
export function renderFootnote(bridge) {
  const source = bridge.source_modified ? `Source data last updated ${eastern(bridge.source_modified, {dateStyle: "medium"})} · ` : "";
  return html`<p class="bridge-footnote">${source}Dashboard refreshed ${eastern(bridge.generated, {dateStyle: "medium", timeStyle: "short"})}.</p>`;
}
