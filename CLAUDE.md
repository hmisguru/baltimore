# baltimore-kpis

Public repo: embeddable HUD System Performance Measure KPIs for the Baltimore City CoC (MD-501), built with Observable Framework (`src/`, config in `observablehq.config.js`) and deployed to GitHub Pages (https://hmisguru.github.io/baltimore-kpis/) by `.github/workflows/deploy.yml`. Companion to the private `hmisguru/baltimore` repo (DAC dashboards + ClientTrack syncs), which is where the data and query logic come from.

**This repo is public.** Never commit credentials, row-level data, internal service IDs/URLs, or anything from `hmisguru/baltimore`'s CLAUDE.md beyond what's needed here. Only CoC-wide aggregates are published. No small-count suppression is applied, per explicit choice: every KPI is a system-wide total or rate.

## Data flow

- `sql/*.sql` are **generated copies** of specific widgets in `balspm.yml` (System Performance Dashboard, `staging` branch of `hmisguru/baltimore`), rendered with no Project filter and with `{{ filters.report_start }}` turned into the BigQuery parameter `@report_start`. Regenerate with `scripts/extract_sql.py <path to balspm.yml>` whenever the dashboard's measure logic changes; never hand-edit, or the published numbers will drift from the dashboard.
- `src/data/spm.json.py` is the only data loader. It reads `MAX(ExportEndDate)` from `balhmiscsv.Export`, reports the most recent **complete** federal fiscal year ending on or before it (FY = Oct 1 – Sep 30), and compares against the prior FY. Measures 1 and 2 are single-period queries, so they run once per FY; 3.2, 5.1 and 7b.1 already return Current/Previous FY columns. It picks one row per measure by exact label and `sys.exit`s if a label is missing, so a changed dashboard query fails the build instead of publishing nulls.
- KPI ids are hardcoded in both the loader (`"id"` fields) and `observablehq.config.js` (`kpiIds`, used for the `/embed/<id>` dynamic paths). Keep the two lists in sync.
- Auth: Application Default Credentials. In CI, the `GCP_SERVICE_ACCOUNT_JSON` repository secret is written to a temp file and pointed to by `GOOGLE_APPLICATION_CREDENTIALS`.

## Embedding surfaces (keep all three working)

1. **Iframes**: `src/embed/[kpi].md` (one parameterized page per KPI) and `src/embed/all.md` (grid). Chrome-free (no header/footer/sidebar), `?theme=light|dark` override.
2. **Exported JS module**: `src/kpis.js` → published unhashed at `/kpis.js` via `dynamicPaths`. Exports `KPI(id, options)`, `KPIGrid(ids, options)`, `data()`. Its `FileAttachment` resolves relative to `import.meta.url`, so cross-origin imports work (GitHub Pages sends `Access-Control-Allow-Origin: *`).
3. **Raw JSON**: `/data/spm.json`, also via `dynamicPaths`.

`src/components/kpi.js` is the one tile renderer all three share: plain DOM, no dependencies, self-injected CSS scoped to `.bkpi`, restylable via `--bkpi-*` custom properties. Styled to match baltimorecity.gov (purple/gold palette, Proxima Nova via the host page's Typekit, Nunito Sans fallback), light by default since that site has no dark mode (`theme: "dark"` or `"auto"` opt in). Delta color is never the only signal: every tile shows an arrow plus an "Improved"/"Worsened"/"No change" label, based on each KPI's `better` direction.

## Scheduling

Monthly cron (3rd, 13:17 UTC), plus on push to `main` and manual dispatch. GitHub disables scheduled workflows in public repos after 60 days of no repo activity; the `keepalive` job re-enables the workflow via the API on each scheduled run to reset that clock.
