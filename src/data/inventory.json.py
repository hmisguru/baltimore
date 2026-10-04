"""Observable Framework data loader: Housing Inventory dashboard (prototype).

Renders the DAC dashboard definition in inventory/balinventory.yml statically:
runs each widget's own SQL at build time for every combination of the
dashboard's two filters (household type x HMIS participation), and writes the
widget layout plus all results as one JSON document. The page then switches
filters instantly in the browser, with no queries at view time -- same
approach as bridge.json.py.

Unlike bridge.json.py, this dashboard's rows have no "tab" key at all (it's a
single-page dashboard), so the layout is one flat list of rows, same as
coordinated-entry.json.py.

Queries are deduplicated by their rendered SQL. Unlike balbridge.yml's
`{{ filters.x }}` usage inside Jinja conditionals, balinventory.yml's filters
are interpolated as bare literal strings directly into each query's WHERE
clause (e.g. `'{{ filters.household_type }}' = 'All'`), so every one of the
12 filter combinations renders genuinely distinct SQL text for any widget
that references either filter -- there's no cross-combination dedup to be
had here the way Bridge sometimes gets it from a widget that ignores one of
its two filters.

Reads balhmiscsv (plain BigQuery tables) and clienttrack.HMISPITCount (also
plain BigQuery, kept fresh by the ClientTrack CTAPI sync -- see CLAUDE.md's
Coordinated Entry section for that pipeline) for the non-HMIS-participating
fallback rate. No Google Sheets/Drive involvement, so this loader only needs
the plain `bigquery` OAuth scope, like coordinated-entry.json.py.

Also writes a top-level `dvProjects` list (project names with Project.csv's
TargetPopulation = 1, i.e. domestic-violence-survivor-targeted) alongside the
widget data, so src/components/inventory.js can badge those rows in the
"Current Inventory by Project" table -- a one-off query outside
balinventory.yml's own widgets, since that file stays a verbatim copy of
DAC's source (see CLAUDE.md).
"""

import hashlib
import itertools
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

import google.auth
import jinja2
import yaml
from google.cloud import bigquery

BQ_PROJECT_ID = "baldash-508920"
DASHBOARD = Path(__file__).resolve().parents[2] / "inventory" / "balinventory.yml"

credentials, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/bigquery"])
client = bigquery.Client(project=BQ_PROJECT_ID, credentials=credentials)

# Widget keys passed through to the page as display config (never SQL).
DISPLAY_KEYS = ["value", "columns", "pivot"]


def json_value(v):
    if isinstance(v, Decimal):
        return float(v)
    if hasattr(v, "isoformat"):
        return v.isoformat()
    return v


def run(sql):
    job = client.query(sql)
    result = job.result()
    return {
        "columns": [field.name for field in result.schema],
        "rows": [[json_value(v) for v in row.values()] for row in result],
    }


def dv_project_names():
    """Names of projects targeting survivors of domestic violence (HUD's
    Project.csv TargetPopulation = 1), for the "Current Inventory by
    Project" table's DV badge (src/components/inventory.js). Matched by
    name rather than ProjectID since that table's own query (balinventory.yml,
    not touched here) already groups down to (project_type_label,
    project_name) with no ProjectID in its result."""
    result = run("SELECT DISTINCT ProjectName FROM balhmiscsv.Project WHERE TargetPopulation = 1")
    name_col = result["columns"].index("ProjectName")
    return sorted({row[name_col] for row in result["rows"]})


def main():
    dashboard = yaml.safe_load(DASHBOARD.read_text())
    filters = [
        {"name": f["name"], "options": f["options"]["values"], "default": f["default"]}
        for f in dashboard["filters"]
    ]
    combos = list(itertools.product(*[f["options"] for f in filters]))
    env = jinja2.Environment(undefined=jinja2.StrictUndefined)

    # Layout: a flat list of rows (no tabs), each a list of widgets. Widget
    # ids (r<row>-w<widget>) match DAC's, so results can be compared
    # one-to-one against the live dashboard.
    rows_out, sql_templates = [], {}
    for ri, row in enumerate(dashboard["rows"]):
        widgets = []
        for wi, w in enumerate(row.get("widgets", [])):
            wid = f"r{ri}-w{wi}"
            widgets.append({
                "id": wid,
                "type": w["type"],
                "name": w.get("name"),
                "description": (w.get("description") or "").strip() or None,
                "col": w.get("col", 12),
                **{k: w[k] for k in DISPLAY_KEYS if k in w},
            })
            if w.get("sql"):
                sql_templates[wid] = env.from_string(w["sql"])
        rows_out.append(widgets)

    # Render every widget's SQL for every filter combination; run each
    # distinct query once.
    queries, results = {}, {}
    for combo in combos:
        values = {f["name"]: v for f, v in zip(filters, combo)}
        key = "|".join(combo)
        results[key] = {}
        for wid, template in sql_templates.items():
            sql = template.render(filters=values)
            qid = hashlib.sha1(sql.encode()).hexdigest()[:12]
            queries.setdefault(qid, sql)
            results[key][wid] = qid

    print(f"{len(sql_templates)} widgets x {len(combos)} filter combinations = "
          f"{len(sql_templates) * len(combos)} widget results, {len(queries)} distinct queries",
          file=sys.stderr)
    with ThreadPoolExecutor(max_workers=8) as pool:
        data = dict(zip(queries, pool.map(run, queries.values())))

    json.dump(
        {
            "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "name": dashboard["name"],
            "description": dashboard.get("description"),
            "filters": filters,
            "rows": rows_out,
            "results": results,
            "data": data,
            "dvProjects": dv_project_names(),
        },
        sys.stdout,
        separators=(",", ":"),
    )


if __name__ == "__main__":
    main()
