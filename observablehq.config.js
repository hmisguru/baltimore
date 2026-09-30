// KPI ids, matching the "id" fields written by src/data/spm.json.py. Each gets
// a chrome-free iframe page at /embed/<id>.
const kpiIds = [
  "length-of-time-homeless",
  "returns-to-homelessness",
  "people-sheltered",
  "first-time-homeless",
  "street-outreach-exits",
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
  // Light only, to match baltimorecity.gov (which has no dark mode).
  theme: "air",
  // Nunito Sans is baltimorecity.gov's body font. Its headline font, Proxima
  // Nova, comes from an Adobe Typekit kit that only serves on
  // baltimorecity.gov, so it applies to tiles embedded there via kpis.js and
  // Nunito Sans stands in everywhere else (this site and the iframe pages).
  head: `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nunito+Sans:opsz,wght@6..12,400;6..12,700&display=swap">
<style>:root { --serif: "Nunito Sans", system-ui, sans-serif; --sans-serif: "Nunito Sans", system-ui, sans-serif; --theme-foreground-focus: #60397c; }</style>`,
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
