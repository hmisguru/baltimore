// KPI stat tile: plain DOM, no dependencies, so it renders the same inside an
// Observable page, an iframe, or a third-party site importing kpis.js.
//
// Host sites can restyle it through the --bkpi-* custom properties below, and
// force a theme with the tile's data-theme="light"|"dark" attribute.

const STYLE_ID = "bkpi-style";

const CSS = `
.bkpi {
  --bkpi-surface: #fcfcfb;
  --bkpi-border: #e3e2de;
  --bkpi-text: #0b0b0b;
  --bkpi-text-secondary: #52514e;
  --bkpi-good: #0ca30c;
  --bkpi-bad: #d03b3b;
  --bkpi-neutral: #8a8984;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: 16px 20px;
  border: 1px solid var(--bkpi-border);
  border-radius: 8px;
  background: var(--bkpi-surface);
  color: var(--bkpi-text);
  font-family: var(--bkpi-font, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif);
  line-height: 1.3;
}
@media (prefers-color-scheme: dark) {
  .bkpi:where(:not([data-theme="light"])) {
    --bkpi-surface: #1a1a19;
    --bkpi-border: #3a3936;
    --bkpi-text: #ffffff;
    --bkpi-text-secondary: #c3c2b7;
    --bkpi-good: #0ca30c;
    --bkpi-bad: #e25c5c;
  }
}
.bkpi[data-theme="dark"] {
  --bkpi-surface: #1a1a19;
  --bkpi-border: #3a3936;
  --bkpi-text: #ffffff;
  --bkpi-text-secondary: #c3c2b7;
  --bkpi-good: #0ca30c;
  --bkpi-bad: #e25c5c;
}
.bkpi * { box-sizing: border-box; }
.bkpi-measure {
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--bkpi-text-secondary);
}
.bkpi-title { margin: 0; font-size: 15px; font-weight: 600; }
.bkpi-value { font-size: 40px; font-weight: 600; line-height: 1.1; }
.bkpi-unit { font-size: 18px; font-weight: 500; color: var(--bkpi-text-secondary); margin-left: 4px; }
.bkpi-delta { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; font-size: 14px; }
.bkpi-arrow { font-size: 12px; }
.bkpi-delta[data-status="improved"] .bkpi-arrow { color: var(--bkpi-good); }
.bkpi-delta[data-status="worsened"] .bkpi-arrow { color: var(--bkpi-bad); }
.bkpi-delta[data-status="unchanged"] .bkpi-arrow { color: var(--bkpi-neutral); }
.bkpi-status { font-weight: 600; }
.bkpi-change { color: var(--bkpi-text-secondary); }
.bkpi-description { margin: 4px 0 0; font-size: 13px; color: var(--bkpi-text-secondary); }
.bkpi-footer { margin-top: auto; padding-top: 8px; font-size: 12px; color: var(--bkpi-text-secondary); }
.bkpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(200px, 100%), 1fr));
  gap: 16px;
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
    case "percent": return {value: oneDecimal.format(kpi.value), unit: "%"};
    case "days": return {value: integer.format(kpi.value), unit: "days"};
    default: return {value: integer.format(kpi.value), unit: ""};
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
  if (!kpi.better) return "unchanged";
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
 * Render one KPI tile.
 * @param {object} data   the parsed spm.json document
 * @param {object} kpi    one entry of data.kpis
 * @param {object} [options]
 * @param {"light"|"dark"} [options.theme]  force a theme (default: follows OS)
 * @param {boolean} [options.description=true]  show the one-line definition
 * @param {boolean} [options.footer=true]  show fiscal year + source line
 */
export function renderKpi(data, kpi, {theme, description = true, footer = true} = {}) {
  ensureStyle();
  const tile = el("article", "bkpi");
  if (theme) tile.dataset.theme = theme;
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
    delta.append(el("span", "bkpi-status", {improved: "Improved", worsened: "Worsened", unchanged: "No change"}[status]));
    delta.append(el("span", "bkpi-change", describeChange(kpi, data.previous_fiscal_year.label)));
    tile.append(delta);
  }

  if (description) tile.append(el("p", "bkpi-description", kpi.description));
  if (footer) tile.append(el("div", "bkpi-footer", `${formatFiscalYear(data.fiscal_year)} · ${data.source}`));
  return tile;
}

/** Render several KPI tiles in a responsive grid (all of them by default). */
export function renderKpiGrid(data, ids = data.kpis.map((d) => d.id), options) {
  ensureStyle();
  const grid = el("div", "bkpi-grid");
  for (const id of ids) grid.append(renderKpi(data, findKpi(data, id), options));
  return grid;
}

export function findKpi(data, id) {
  const kpi = data.kpis.find((d) => d.id === id);
  if (!kpi) throw new Error(`Unknown KPI "${id}". Available: ${data.kpis.map((d) => d.id).join(", ")}`);
  return kpi;
}
