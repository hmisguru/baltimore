# baltimore-kpis

Embeddable KPIs for the Baltimore City Continuum of Care (MD-501), built from HMIS data with [Observable Framework](https://observablehq.com/framework/) and published on GitHub Pages at **https://hmisguru.github.io/baltimore-kpis/**.

## KPIs

Six HUD System Performance Measures, for the most recent complete federal fiscal year (Oct 1 – Sep 30) compared with the year before:

| id | Measure | KPI |
|---|---|---|
| `length-of-time-homeless` | 1a | Average length of time homeless (ES + Safe Haven) |
| `returns-to-homelessness` | 2 | People returning to homelessness within 2 years of exiting to permanent housing (with the % rate) |
| `people-sheltered` | 3.2 | Unduplicated people in ES, Safe Haven, or TH |
| `first-time-homeless` | 5.1 | People homeless for the first time (no activity in prior 24 months) |
| `street-outreach-exits` | 7a.1 | People exiting Street Outreach (with the % placed successfully) |
| `exits-to-permanent-housing` | 7b.1 | People exiting ES/SH/TH/RRH to permanent housing (with the % rate) |

## Embedding

See the site's [embedding guide](https://hmisguru.github.io/baltimore-kpis/embedding). In short:

```html
<!-- iframe: one KPI, or embed/all for the grid -->
<iframe src="https://hmisguru.github.io/baltimore-kpis/embed/people-sheltered"
  title="People in shelter" width="360" height="280" style="border:0"></iframe>

<!-- JS module: renders into your page, no iframe -->
<div id="kpis"></div>
<script type="module">
  import {KPIGrid} from "https://hmisguru.github.io/baltimore-kpis/kpis.js";
  document.querySelector("#kpis").append(await KPIGrid());
</script>
```

Raw numbers: https://hmisguru.github.io/baltimore-kpis/data/spm.json

## How it works

- `sql/*.sql` are copies of widgets in the System Performance Dashboard (`balspm.yml` in the private `hmisguru/baltimore` repo), so published numbers match the dashboard. Regenerate with `scripts/extract_sql.py`; don't hand-edit.
- `src/data/spm.json.py` is a build-time data loader: it runs those queries in BigQuery and writes a small JSON of CoC-wide aggregates. No row-level data or credentials reach the site.
- `.github/workflows/deploy.yml` rebuilds and deploys monthly (3rd of the month), on every push to `main`, and on demand (Actions → Build and deploy KPIs → Run workflow).

## Local development

```sh
npm install
pip install -r requirements.txt
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
npm run dev      # preview at http://127.0.0.1:3000
npm run build    # static site in dist/
```

The loader's output is cached in `src/.observablehq/cache/`; run `npm run clean` to force a fresh BigQuery pull.
