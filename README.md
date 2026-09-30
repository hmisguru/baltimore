# baltimore-kpis

Embeddable KPIs for the Baltimore City Continuum of Care (MD-501), built from HMIS data with [Observable Framework](https://observablehq.com/framework/) and published on GitHub Pages at **https://hmisguru.github.io/baltimore-kpis/**.

## KPIs

Six HUD System Performance Measures, for the most recent complete federal fiscal year (Oct 1 – Sep 30) compared with the year before:

| id | Measure | KPI |
|---|---|---|
| `length-of-time-homeless` | 1a | Average length of time homeless (ES + Safe Haven) |
| `returns-to-homelessness` | 2 | People returning to homelessness within 2 years of exiting to permanent housing |
| `people-sheltered` | 3.2 | Unduplicated people in ES, Safe Haven, or TH |
| `first-time-homeless` | 5.1 | People homeless for the first time (no activity in prior 24 months) |
| `street-outreach-exits` | 7a.1 | People exiting Street Outreach |
| `exits-to-permanent-housing` | 7a.1 + 7b.1 | People exiting Street Outreach or ES/SH/TH/RRH to permanent housing, each person counted once |

## Embedding

There are three ways to put the KPIs on another website. All of them update automatically when this site rebuilds (first Wednesday of each month). The site's [embedding guide](https://hmisguru.github.io/baltimore-kpis/embedding) has copy-and-paste snippets.

### 1. JavaScript module (recommended)

Renders the tiles directly into your page, so they fit your layout, resize on phones, and pick up your site's fonts (on baltimorecity.gov, Proxima Nova).

```html
<div id="baltimore-kpis"></div>
<script type="module">
  import {KPIGrid} from "https://hmisguru.github.io/baltimore-kpis/kpis.js";
  document.querySelector("#baltimore-kpis").append(await KPIGrid());
</script>
```

Common variations:

```js
// Add a "MOHS-funded projects only" switch visitors can flip
await KPIGrid(undefined, {toggle: true})

// Show MOHS-funded projects only (no switch)
await KPIGrid(undefined, {mohsFunded: true})

// Switch shown, starting on MOHS-funded
await KPIGrid(undefined, {toggle: true, mohsFunded: true})

// Only some KPIs, in this order
await KPIGrid(["people-sheltered", "first-time-homeless"])

// A single tile
import {KPI} from "https://hmisguru.github.io/baltimore-kpis/kpis.js";
await KPI("exits-to-permanent-housing")
```

| Export | What it returns |
|---|---|
| `KPIGrid(ids?, options?)` | A responsive grid of tiles (all six by default), with one source line below it |
| `KPI(id, options?)` | A single tile, with its own source line |
| `data(options?)` | The underlying numbers, for building your own display |

| Option | Applies to | Default | Effect |
|---|---|---|---|
| `toggle` | `KPIGrid` | `false` | Shows a "MOHS-funded projects only" switch above the grid |
| `mohsFunded` | all | `false` | Shows MOHS-funded projects only (or starts the switch on) |
| `theme` | `KPIGrid`, `KPI` | `"light"` | `"dark"` for the purple dark style, `"auto"` to follow the visitor's system setting |
| `description` | `KPIGrid`, `KPI` | `true` | `false` hides the one-line definition on each tile |
| `footer` | `KPIGrid`, `KPI` | `true` | `false` hides the fiscal year and source line |

The tiles are styled to match baltimorecity.gov. To adapt them to another site, override these CSS custom properties on `.bkpi`: `--bkpi-font`, `--bkpi-surface`, `--bkpi-border`, `--bkpi-accent` (top stripe), `--bkpi-eyebrow` (measure label), `--bkpi-text`, `--bkpi-text-secondary`, `--bkpi-good`, `--bkpi-bad`, `--bkpi-neutral`.

### 2. Iframe

Works anywhere you can paste HTML, but the iframe needs a fixed height and uses Nunito Sans rather than your site's font.

```html
<!-- Full grid with the switch -->
<iframe src="https://hmisguru.github.io/baltimore-kpis/embed/all?toggle=1"
  title="Baltimore CoC system performance KPIs"
  width="100%" height="680" style="border:0"></iframe>

<!-- One KPI -->
<iframe src="https://hmisguru.github.io/baltimore-kpis/embed/people-sheltered"
  title="People in shelter or transitional housing"
  width="360" height="340" style="border:0"></iframe>
```

| URL parameter | Pages | Effect |
|---|---|---|
| `toggle=1` | `embed/all` | Shows the "MOHS-funded projects only" switch |
| `mohs=1` | all | Shows MOHS-funded projects only (or starts the switch on) |
| `theme=dark` or `theme=auto` | all | Purple dark style, or follow the visitor's system setting |

Combine parameters with `&`, e.g. `embed/all?toggle=1&mohs=1`. Single-KPI pages are `embed/<id>`, using the ids in the KPI table above. Suggested heights: about 340px for a single tile at 360px wide; for `embed/all`, about 680px at desktop width (630px without the switch), about 790px around 900px wide, and about 1,700px on phones, where the tiles stack. That last one is why the JavaScript module is the better fit for responsive pages.

### 3. Raw JSON

https://hmisguru.github.io/baltimore-kpis/data/spm.json has every figure. Top-level `kpis` covers all CoC projects; `filters["mohs-funded"].kpis` has the same KPIs for MOHS-funded projects, along with that filter's `grant_ids` and `projects`.

### What "MOHS-funded" means

Projects with a funding record for grant **UNCGF** or **UNBFO** active at any point in the two fiscal years compared: 16 projects as of FY2026 (8 emergency shelters, 8 Street Outreach). For Measures 5.1 and 2, the filter only selects the starting group of people (MOHS shelter entrants; people who exited MOHS projects to permanent housing). Their prior homelessness or returns are then checked across the whole CoC, per HUD's System Performance Measures specs. The other measures follow the SPM dashboard's Project filter exactly.

## How it works

- `sql/*.sql` are copies of widgets in the System Performance Dashboard (`balspm.yml` in the private `hmisguru/baltimore` repo), so published numbers match the dashboard. Regenerate with `scripts/extract_sql.py`; don't hand-edit. `sql/m7_exits_to_ph.sql` is generated from the 7a.1 and 7b.1 copies: each measure's logic is unchanged, and only the final unduplicated count of people exiting either to permanent housing is added.
- `src/data/spm.json.py` is a build-time data loader: it runs those queries in BigQuery and writes a small JSON of aggregates, computed for all CoC projects and for MOHS-funded projects. No row-level data or credentials reach the site.
- `.github/workflows/deploy.yml` rebuilds and deploys monthly (first Wednesday of the month), on every push to `main`, and on demand (Actions → Build and deploy KPIs → Run workflow).

## Local development

```sh
npm install
pip install -r requirements.txt
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
npm run dev      # preview at http://127.0.0.1:3000
npm run build    # static site in dist/
```

The loader's output is cached in `src/.observablehq/cache/`; run `npm run clean` to force a fresh BigQuery pull.
