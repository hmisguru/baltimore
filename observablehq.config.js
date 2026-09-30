// KPI ids, matching the "id" fields written by src/data/spm.json.py. Each gets
// a chrome-free iframe page at /embed/<id>.
const kpiIds = [
  "length-of-time-homeless",
  "returns-to-homelessness",
  "people-sheltered",
  "first-time-homeless",
  "exits-to-permanent-housing"
];

export default {
  title: "Baltimore CoC System Performance KPIs",
  root: "src",
  pages: [{name: "Embedding guide", path: "/embedding"}],
  sidebar: false,
  toc: false,
  pager: false,
  search: false,
  theme: ["air", "near-midnight"],
  footer: "Source: Baltimore City Continuum of Care (MD-501) HMIS. Built with Observable Framework.",
  // Stable, unhashed URLs for embedding: the importable module, the raw JSON,
  // and one iframe page per KPI plus one for the full grid.
  dynamicPaths: [
    "/kpis.js",
    "/data/spm.json",
    "/embed/all",
    ...kpiIds.map((id) => `/embed/${id}`)
  ]
};
