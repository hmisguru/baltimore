// KPI stat tile: plain DOM, no dependencies, so it renders the same inside an
// Observable page, an iframe, or a third-party site importing kpis.js.
//
// Styled to match baltimorecity.gov (where the tiles are embedded): its deep
// purple / gold palette, pale blue-gray panels, 12px card radius, and Proxima
// Nova (loaded by the host site's Typekit kit) with Nunito Sans as fallback.
// Host sites can restyle it through the --bkpi-* custom properties below.
//
// Light by default, since baltimorecity.gov has no dark mode: a tile that
// followed the OS setting would render dark on a light page. data-theme="dark"
// forces the dark (purple) variant; data-theme="auto" follows the OS.

const STYLE_ID = "bkpi-style";

const DARK = `
    --bkpi-surface: #2f1c3d;
    --bkpi-border: #4a3659;
    --bkpi-accent: #fabe21;
    --bkpi-text: #ffffff;
    --bkpi-text-secondary: #d9cfe3;
    --bkpi-eyebrow: #fabe21;
    --bkpi-good: #3cc43c;
    --bkpi-bad: #ff7a7a;
    --bkpi-neutral: #b3a8bf;`;

const CSS = `
.bkpi {
  --bkpi-surface: #f4fafb;
  --bkpi-border: #d9e7ea;
  --bkpi-accent: #fabe21;
  --bkpi-text: #161616;
  --bkpi-text-secondary: #4f4a57;
  --bkpi-eyebrow: #60397c;
  --bkpi-good: #0a8a0a;
  --bkpi-bad: #d03b3b;
  --bkpi-neutral: #77737e;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  padding: 20px 24px;
  border: 1px solid var(--bkpi-border);
  border-top: 4px solid var(--bkpi-accent);
  border-radius: 12px;
  background: var(--bkpi-surface);
  color: var(--bkpi-text);
  font-family: var(--bkpi-font, "proxima-nova", "Nunito Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif);
  line-height: 1.3;
}
.bkpi[data-theme="dark"] {${DARK}
}
@media (prefers-color-scheme: dark) {
  .bkpi[data-theme="auto"] {${DARK}
  }
}
.bkpi * { box-sizing: border-box; }
.bkpi-measure {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--bkpi-eyebrow);
}
.bkpi-title { margin: 0; font-family: inherit; font-size: 18px; font-weight: 400; line-height: 1.3; color: var(--bkpi-text); }
.bkpi-value { font-size: 44px; font-weight: 700; line-height: 1.05; letter-spacing: -0.01em; }
.bkpi-unit { font-size: 20px; font-weight: 400; color: var(--bkpi-text-secondary); margin-left: 4px; }
.bkpi-delta { display: flex; flex-wrap: wrap; align-items: baseline; align-content: flex-start; gap: 4px 8px; font-size: 15px; }
.bkpi-arrow { font-size: 13px; }
.bkpi-delta[data-status="improved"] .bkpi-arrow { color: var(--bkpi-good); }
.bkpi-delta[data-status="worsened"] .bkpi-arrow { color: var(--bkpi-bad); }
.bkpi-delta[data-status="unchanged"] .bkpi-arrow,
.bkpi-delta[data-status="neutral"] .bkpi-arrow { color: var(--bkpi-neutral); }
.bkpi-status { font-weight: 700; }
.bkpi-change { color: var(--bkpi-text-secondary); }
.bkpi-description { margin: 4px 0 0; font-size: 14px; line-height: 1.4; color: var(--bkpi-text-secondary); }
.bkpi-footer { margin-top: auto; padding-top: 12px; border-top: 1px solid var(--bkpi-border); font-size: 12px; color: var(--bkpi-text-secondary); }
.bkpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr));
  gap: 16px;
}
/* In a grid, each tile's parts (label, title, value, change, description)
   become rows of the parent grid via subgrid, so they line up across tiles
   in the same row even when titles wrap to different lengths. Browsers
   without subgrid fall back to the tile's normal stacked layout. */
@supports (grid-template-rows: subgrid) {
  .bkpi-grid > .bkpi {
    display: grid;
    grid-template-rows: subgrid;
    row-gap: 8px;
    align-content: start;
  }
}
.bkpi-grid-footer {
  margin-top: 12px;
  font-family: var(--bkpi-font, "proxima-nova", "Nunito Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif);
  font-size: 13px;
  color: #4f4a57;
}
`;

function ensureStyle(root = document) {
  const host = root.head ?? root;
  if (host.querySelector?.(`#${STYLE_ID}`)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  host.append(style);
}

const integer = new Intl.NumberFormat("en-US", {maximumFractionDigits: 0});
const oneDecimal = new Intl.NumberFormat("en-US", {minimumFractionDigits: 1, maximumFractionDigits: 1});

function formatValue(kpi) {
  switch (kpi.format) {
    case "percent": return {value: oneDecimal.format(kpi.value), unit: kpi.unit ?? "%"};
    case "days": return {value: integer.format(kpi.value), unit: kpi.unit ?? "days"};
    default: return {value: integer.format(kpi.value), unit: kpi.unit ?? ""};
  }
}

// Plain-language change vs. the prior year, e.g. "116 fewer than FY2025".
function describeChange(kpi, previousLabel) {
  const diff = kpi.value - kpi.previous;
  const up = diff > 0;
  let amount;
  let word;
  switch (kpi.format) {
    case "percent":
      amount = `${oneDecimal.format(Math.abs(diff))} pts`;
      word = up ? "higher" : "lower";
      break;
    case "days":
      amount = `${integer.format(Math.abs(diff))} ${Math.round(Math.abs(diff)) === 1 ? "day" : "days"}`;
      word = up ? "longer" : "shorter";
      break;
    default:
      amount = integer.format(Math.abs(diff));
      word = up ? "more" : "fewer";
  }
  return `${amount} ${word} than ${previousLabel}`;
}

function statusOf(kpi) {
  const diff = kpi.value - kpi.previous;
  // Treat changes that round to zero at display precision as unchanged.
  const epsilon = kpi.format === "percent" ? 0.05 : 0.5;
  if (Math.abs(diff) < epsilon) return "unchanged";
  // No better direction (e.g. Street Outreach exits): report the change only.
  if (!kpi.better) return "neutral";
  return (diff < 0) === (kpi.better === "lower") ? "improved" : "worsened";
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function formatFiscalYear(fy) {
  const month = (iso) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", {month: "short", year: "numeric"});
  return `${fy.label} (${month(fy.start)} – ${month(fy.end)})`;
}

/**
 * Narrow the spm.json document to one project scope. By default every CoC
 * project; with {mohsFunded: true}, only MOHS-funded projects (grants UNCGF
 * and UNBFO), which the data loader computes as data.filters["mohs-funded"].
 * Embedding sites choose the scope in code; there's no visible toggle.
 */
export function scopeData(data, {mohsFunded = false} = {}) {
  if (!mohsFunded) return data;
  const filter = data.filters?.["mohs-funded"];
  if (!filter) throw new Error("This KPI data has no MOHS-funded figures yet");
  return {...data, kpis: filter.kpis, scope_label: filter.label};
}

function footerText(data) {
  return [formatFiscalYear(data.fiscal_year), data.scope_label, data.source].filter(Boolean).join(" · ");
}

/**
 * Render one KPI tile. Pass data through scopeData() first to pick a scope.
 * @param {object} data   the parsed spm.json document
 * @param {object} kpi    one entry of data.kpis
 * @param {object} [options]
 * @param {"light"|"dark"|"auto"} [options.theme="light"]  "auto" follows the OS
 * @param {boolean} [options.description=true]  show the one-line definition
 * @param {boolean} [options.footer=true]  show fiscal year + source line
 */
export function renderKpi(data, kpi, {theme = "light", description = true, footer = true} = {}) {
  ensureStyle();
  const tile = el("article", "bkpi");
  tile.dataset.theme = theme;
  tile.dataset.kpi = kpi.id;

  tile.append(el("div", "bkpi-measure", `HUD ${kpi.measure}`));
  tile.append(el("h3", "bkpi-title", kpi.title));

  const {value, unit} = formatValue(kpi);
  const valueNode = el("div", "bkpi-value", value);
  if (unit) valueNode.append(el("span", "bkpi-unit", unit));
  tile.append(valueNode);

  if (kpi.previous != null) {
    const status = statusOf(kpi);
    const delta = el("div", "bkpi-delta");
    delta.dataset.status = status;
    const arrow = kpi.value > kpi.previous ? "▲" : kpi.value < kpi.previous ? "▼" : "●";
    delta.append(el("span", "bkpi-arrow", arrow));
    delta.lastChild.setAttribute("aria-hidden", "true");
    const label = {improved: "Improved", worsened: "Worsened", unchanged: "No change"}[status];
    if (label) delta.append(el("span", "bkpi-status", label));
    delta.append(el("span", "bkpi-change", describeChange(kpi, data.previous_fiscal_year.label)));
    tile.append(delta);
  }

  if (description) tile.append(el("p", "bkpi-description", kpi.description));
  if (footer) tile.append(el("div", "bkpi-footer", footerText(data)));
  return tile;
}

/**
 * Render several KPI tiles in a responsive grid (all of them by default). The
 * fiscal year + source line is shown once below the grid rather than on every
 * tile; pass {footer: false} to omit it entirely.
 */
export function renderKpiGrid(data, ids = data.kpis.map((d) => d.id), {footer = true, ...options} = {}) {
  ensureStyle();
  const wrapper = el("div", "bkpi-grid-wrapper");
  const grid = el("div", "bkpi-grid");
  for (const id of ids) {
    const tile = renderKpi(data, findKpi(data, id), {...options, footer: false});
    // One parent-grid row per tile part, for the subgrid alignment above.
    tile.style.gridRow = `span ${tile.children.length}`;
    grid.append(tile);
  }
  wrapper.append(grid);
  if (footer) wrapper.append(el("div", "bkpi-grid-footer", footerText(data)));
  return wrapper;
}

export function findKpi(data, id) {
  const kpi = data.kpis.find((d) => d.id === id);
  if (!kpi) throw new Error(`Unknown KPI "${id}". Available: ${data.kpis.map((d) => d.id).join(", ")}`);
  return kpi;
}
