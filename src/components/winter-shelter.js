// Renders the Winter Shelter: FY2026 Season Review dashboard
// (winter-shelter/balwintershelter.yml) from the build-time results in
// src/data/winter-shelter.json: one renderer per DAC widget type, driven by
// each widget's own display config, patterned after coordinated-entry.js
// (same no-filters/no-tabs shape), plus two renderers that dashboard doesn't
// need -- a calendar heatmap and a sparkline small-multiple.

import * as Plot from "npm:@observablehq/plot";
import {format as d3format} from "npm:d3-format";
import {html} from "npm:htl";
import {resize} from "observablehq:stdlib";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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

function empty() {
  return html`<p class="ws-empty">No data for this selection.</p>`;
}

function renderMetric(widget, rows) {
  if (!rows.length) return empty();
  const {field, format, type} = widget.value ?? {};
  const raw = rows[0][field];
  const text = type === "number" && raw != null ? numberFormat(format)(raw) : raw ?? "—";
  return html`<div class="ws-metric${type === "number" ? "" : " ws-metric-text"}">${text}</div>`;
}

// Loader writes BigQuery DATE values as "YYYY-MM-DD" via json_value's own
// isoformat() -- parsed here entirely in UTC-day arithmetic (never a local-
// timezone Date getter), so which grid cell a date lands in can't drift a
// day the way DAC's own type:date x-axis famously did (see baltimore-dac's
// CLAUDE.md on that bug) -- that bug was about *formatting* a date in the
// viewer's local timezone; this avoids the whole class of bug by never
// mixing UTC and local getters for the same date.
function parseUTCDate(iso) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

const utcDateLabel = (d) => d.toLocaleDateString("en-US", {timeZone: "UTC", month: "short", day: "numeric", year: "numeric"});

// Calendar heatmap: a GitHub-contributions-style grid, one column per
// calendar week (Sun-Sat), aligned to the Sunday on/before the first date in
// the data so week boundaries read as real weeks, not an arbitrary 7-day
// chunking from the season's own start date. Color is a 5-bin sequential
// ramp (dataviz skill: "sequential = one hue, light->dark"), 0 getting its
// own dedicated step rather than folding into the lowest nonzero bin --
// Winter Shelter is only "activated" on specific nights, so most of the
// season is genuinely 0, and that should read as visually distinct from "a
// little activity," not just the palest shade of it.
function renderCalendar(widget, rows, rampClass) {
  if (!rows.length) return empty();
  const xField = widget.x.field;
  const valueField = widget.value.field;
  const dates = rows.map((r) => parseUTCDate(r[xField]));
  const gridStart = new Date(dates[0]);
  gridStart.setUTCDate(gridStart.getUTCDate() - gridStart.getUTCDay());

  const max = Math.max(...rows.map((r) => r[valueField] ?? 0), 0);
  const bin = (v) => (!v || v <= 0 ? 0 : Math.min(4, Math.ceil((v / max) * 4)));

  const cells = rows.map((r, i) => {
    const d = dates[i];
    const week = Math.floor((d - gridStart) / 86400000 / 7);
    return {week, weekday: WEEKDAYS[d.getUTCDay()], value: r[valueField] ?? 0, label: utcDateLabel(d), bin: bin(r[valueField])};
  });
  const weekCount = Math.max(...cells.map((c) => c.week)) + 1;

  const fmt = Number.isInteger(max) ? d3format(",~f") : d3format(",.1f");
  const isCold = valueField === "degrees_below_freezing";
  // valueField distinguishes the two calendars this dashboard has: each
  // gets its own plain-language hover title rather than a bare number.
  const titleFor = isCold
    ? (d) => `${d.label}: ${fmt(d.value)}° below freezing (wind chill)`
    : (d) => `${d.label}: ${fmt(d.value)} check-in${d.value === 1 ? "" : "s"}`;
  // The check-ins legend's "max 291" is self-evident from the card's own
  // title; the cold calendar's bare "max 36.4" isn't (36.4 what?), so it
  // gets the same unit spelled out here, per explicit request.
  const legendMax = isCold ? `${fmt(max)} below freezing` : fmt(max);
  const chart = resize((width) => Plot.plot({
    width,
    height: 36 * WEEKDAYS.length + 20,
    marginLeft: 36,
    marginTop: 4,
    marginBottom: 4,
    x: {domain: Array.from({length: weekCount}, (_, i) => i), axis: null},
    y: {domain: WEEKDAYS, label: null, tickSize: 0},
    marks: [
      // `title` must be a mark channel (not nested inside `tip`) for Plot to
      // show it as the hover tooltip's text -- tip: true alone, with no
      // title channel, falls back to showing x/y as bare numbers, which is
      // what silently produced the no-data-on-hover bug this replaces.
      Plot.cell(cells, {
        x: "week",
        y: "weekday",
        fill: (d) => `var(--ws-${rampClass}-${d.bin})`,
        inset: 2,
        rx: 2,
        title: titleFor,
        tip: true
      })
    ]
  }));

  return html`<div>
    <p class="ws-calendar-range">${utcDateLabel(dates[0])} – ${utcDateLabel(dates[dates.length - 1])}</p>
    ${chart}
    <div class="ws-legend">
      <span class="ws-legend-label">Fewer</span>
      ${[0, 1, 2, 3, 4].map((b) => html`<span class="ws-legend-swatch" style=${`background:var(--ws-${rampClass}-${b})`}></span>`)}
      <span class="ws-legend-label">More (max ${legendMax})</span>
    </div>
  </div>`;
}

// Sparkline: a compact per-site trend line, no axes -- the point is the
// shape of activity over the season, not reading exact values off a scale
// (the hover tip and the title's own season total cover that).
function renderSparkline(widget, rows) {
  if (!rows.length) return empty();
  const xField = widget.x.field;
  const [yField] = widget.y.field;
  const total = rows.reduce((s, r) => s + (r[yField] ?? 0), 0);
  const fmt = d3format(",~f");
  // Same fix as the calendar heatmap's tip: title has to be a mark channel,
  // not nested inside tip (tip: {format: {...}} with no title channel falls
  // back to Plot's default tip content, which shows raw field names like
  // "checkin_count" instead of a plain-language label).
  const titleFor = (r) => `${utcDateLabel(parseUTCDate(r[xField]))}: ${fmt(r[yField] ?? 0)} check-in${(r[yField] ?? 0) === 1 ? "" : "s"}`;
  const chart = resize((width) => Plot.plot({
    width,
    // height raised from 60 to 82 (not just marginTop) -- margin alone
    // reserves space by shrinking the plot area inside the same total SVG
    // height, it doesn't add room beyond it. The 52px drawable sparkline
    // area (60 - 4 - 4 originally) is kept the same size; the extra 22px
    // goes entirely into headroom above it so a point near the top of the
    // line has somewhere to put its tip box instead of overflowing the
    // SVG's own bounds (SVG has no implicit clipping) onto the "N check-ins
    // this season" text sitting right above the chart. Confirmed live via a
    // user-reported screenshot.
    height: 82,
    marginLeft: 2,
    marginRight: 2,
    marginTop: 26,
    marginBottom: 4,
    // type: "point" -- these are ISO date strings read as plain category
    // labels for even horizontal spacing (a sparkline has no axis to read
    // real dates off), not a time scale; without it Plot's own heuristic
    // sees "YYYY-MM-DD"-shaped strings and renders a warning-triangle badge
    // on the chart suggesting a time scale, which doesn't apply here.
    x: {type: "point", axis: null},
    y: {axis: null},
    marks: [
      Plot.areaY(rows, {x: xField, y: yField, fill: "var(--series-1)", fillOpacity: 0.15, curve: "basis"}),
      Plot.line(rows, {x: xField, y: yField, stroke: "var(--series-1)", strokeWidth: 1.5, curve: "basis", title: titleFor, tip: true})
    ]
  }));
  return html`<div>
    <p class="ws-sparkline-total">${fmt(total)} check-ins this season</p>
    ${chart}
  </div>`;
}

// Display-only description overrides, per explicit request -- none of these
// touch balwintershelter.yml itself (same convention as inventory.js's own
// TITLE_OVERRIDES): the dashboard's own "3 Winter Shelter facilities"
// phrasing undersold the scope (those 3 HousingFacility.ProgramIDs cover 8
// distinct physical sites, not 3), so every description mentioning a
// specific facility count was reworded to "any Winter Shelter facility".
// Keyed by widget name, like TITLE_OVERRIDES.
const DESCRIPTION_OVERRIDES = {
  "Winter Shelter Season": "The Winter Shelter season this dashboard covers (Nov 1 - Mar 31).",
  "Activation Nights": "Nights this season with at least 1 check-in logged in any Winter Shelter facility -- Winter Shelter is only \"activated\" on specific cold-weather nights, not every night of the season.",
  "Total Persons Sheltered": "Distinct clients (Service.ClientID) who checked in at least once at any Winter Shelter facility this season -- a person counted once regardless of how many nights they stayed.",
  "Total Bed Nights Provided": "Total check-in records (Service.ServiceID) at any Winter Shelter facility this season -- one bed night per person per night stayed, so a person with multiple stays is counted once per night.",
  "Nightly Check-Ins": "Check-ins per night at any Winter Shelter facility (HousingFacility.ProgramID 19902, 19872, 19998), for the current/most recently completed Winter Shelter season (Nov 1 - Mar 31). A GENERATE_DATE_ARRAY date spine guarantees every night in the season appears, including nights with 0 check-ins -- Winter Shelter is only \"activated\" on specific nights (typically triggered by cold weather), so most of the season shows 0.",
  // Trimmed per explicit request: drops the closing sentences about the
  // GENERATE_DATE_ARRAY date spine and weather.DailyBWI now being a
  // one-time FY2026-only snapshot -- internal build detail, not something
  // a viewer reading "About this data" needs.
  "Nightly Degrees At or Below 32°F with Wind Chill (BWI)": "Nights this season when BWI Marshall Airport's (station USW00093721) wind-chill-adjusted temperature reached 32°F or below, placed side by side with Nightly Check-Ins for visual comparison. Wind chill is computed from TMIN and AWND (average daily wind speed) via the standard NWS formula (35.74 + 0.6215*T - 35.75*V^0.16 + 0.4275*T*V^0.16, valid for T<=50F and V>=3mph; otherwise wind chill = raw temperature) -- a daily-average approximation, not a true overnight-minimum reading, since NOAA's daily-summaries dataset has no wind chill field or hourly wind data of its own. The `value` is degrees below freezing (GREATEST(32 - wind_chill_f, 0)), not raw temperature, so the coldest/most dangerous nights render as the most intense cells -- confirmed live, with wind chill applied, 118 of the season's 151 nights reach 32F or below, vs. 93 by raw temperature alone.",
};

function renderWidget(doc, widget) {
  const rows = widgetRows(doc, widget);
  let body;
  if (widget.type === "metric") body = renderMetric(widget, rows);
  else if (widget.chart === "calendar") body = renderCalendar(widget, rows, widget.value.field === "degrees_below_freezing" ? "seq-cold" : "seq-checkin");
  else if (widget.chart === "sparkline") body = renderSparkline(widget, rows);
  else body = html`<p class="ws-empty">Unsupported widget type: ${widget.chart ?? widget.type}</p>`;

  const descriptionText = DESCRIPTION_OVERRIDES[widget.name] ?? widget.description;

  // Metric tiles are a single plain-language sentence -- shown inline, same
  // as coordinated-entry.js's own convention. Calendars and sparklines carry
  // longer methodology notes (facility ids, the wind-chill formula, the
  // date-spine workaround), so those collapse below the chart instead of
  // pushing it down the page.
  const collapsed = widget.type !== "metric";
  const description = descriptionText
    ? collapsed
      ? html`<details class="ws-card-details"><summary>About this data</summary><p class="ws-card-description">${descriptionText}</p></details>`
      : html`<p class="ws-card-description">${descriptionText}</p>`
    : null;

  return html`<section class="ws-card${widget.type === "metric" ? " ws-card-metric" : ""}" style="--span:${widget.col ?? 12}" data-widget=${widget.id}>
    <h3 class="ws-card-title">${widget.name}</h3>
    ${collapsed ? null : description}
    ${body}
    ${collapsed ? description : null}
  </section>`;
}

/** All rows of the dashboard, laid out on its 12-column grid. */
export function renderRows(doc) {
  return html`<div class="ws-page">${doc.rows.map((row) => html`<div class="ws-row">${row.map((w) => renderWidget(doc, w))}</div>`)}</div>`;
}

const eastern = (iso, options) => new Date(iso).toLocaleString("en-US", {timeZone: "America/New_York", ...options});

/** "Dashboard refreshed …", in Eastern time. */
export function renderFootnote(doc) {
  return html`<p class="ws-footnote">Dashboard refreshed ${eastern(doc.generated, {dateStyle: "medium", timeStyle: "short"})}.</p>`;
}

const THEME_KEY = "ws-theme";

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
 * winter-shelter.css for the [data-theme] styling this drives on <html>.
 * Same button-not-switch convention as every other dashboard on this site. */
export function renderThemeToggle() {
  const theme = storedTheme() === "dark" ? "dark" : "light";
  applyTheme(theme);

  const label = (t) => (t === "dark" ? "☀️ Light mode" : "🌙 Dark mode");
  const button = html`<button type="button" class="ws-theme-toggle">${label(theme)}</button>`;
  button.setAttribute("aria-pressed", String(theme === "dark"));
  button.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(next);
    button.setAttribute("aria-pressed", String(next === "dark"));
    button.textContent = label(next);
  });
  return button;
}
