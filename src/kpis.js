// Exported module for embedding KPIs directly in another site's page:
//
//   <div id="kpis"></div>
//   <script type="module">
//     import {KPIGrid} from "https://hmisguru.github.io/baltimore-kpis/kpis.js";
//     document.querySelector("#kpis").append(await KPIGrid());
//   </script>
//
// Published at a stable URL via dynamicPaths in observablehq.config.js.

import {FileAttachment} from "observablehq:stdlib";
import {findKpi, renderKpi, renderKpiGrid, scopeData} from "./components/kpi.js";

const spm = FileAttachment("./data/spm.json").json();

// Every function takes an optional {mohsFunded: true} to limit the figures to
// MOHS-funded projects (grants UNCGF and UNBFO) instead of the whole CoC.

/** The KPI document (fiscal year, source, and every KPI's values). */
export async function data(options) {
  return scopeData(await spm, options);
}

/** One KPI tile, e.g. await KPI("exits-to-permanent-housing"). */
export async function KPI(id, options) {
  const d = scopeData(await spm, options);
  return renderKpi(d, findKpi(d, id), options);
}

/**
 * A responsive grid of KPI tiles; all of them when ids is omitted. Add
 * {toggle: true} to show a "MOHS-funded projects only" switch above it.
 */
export async function KPIGrid(ids, options) {
  return renderKpiGrid(await spm, ids, options);
}
