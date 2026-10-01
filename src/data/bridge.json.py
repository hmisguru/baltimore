"""Observable Framework data loader: Bridge to Housing dashboard (prototype).

Renders the DAC dashboard definition in bridge/balbridge.yml statically: runs
each widget's own SQL at build time for every combination of the dashboard's
two filters (household type x project type), and writes the widget layout plus
all results as one JSON document. The page then switches filters instantly in
the browser, with no queries at view time.

Queries are deduplicated by their rendered SQL, so a widget that ignores a
filter (e.g. the tabs where Project Type doesn't apply) runs once per distinct
query rather than once per combination.

The dashboard reads baldashboard.performance_metrics, a view over a Google
Sheets external table, so credentials need the Drive scope as well as
BigQuery, and the service account must have access to the Sheet. The Sheet's
Drive modified time is included as "source_modified" for the page footer.

Google's Sheets backend has its own concurrent-read limit on a single
spreadsheet, separate from BigQuery's own quotas -- hit twice in a row
(2026-10-01) as `400 Resources exceeded ... Google Sheets service
overloaded for spreadsheet id: ...` once query concurrency against this
table grew to 190 distinct queries. Addressed two ways: a smaller
ThreadPoolExecutor (8 -> 3 workers) so fewer queries hit the Sheet at once,
and a retry with exponential backoff in `run()` scoped specifically to that
error string -- any other BigQuery error still fails the build immediately,
since retrying a real query bug would just waste CI minutes before failing
anyway.
"""

import hashlib
import itertools
import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

import google.auth
from google.api_core.exceptions import BadRequest
from google.auth.transport.requests import AuthorizedSession
import jinja2
import yaml
from google.cloud import bigquery

# Retries only kick in for the Sheets-overload error specifically (see above);
# any other failure raises immediately. 4 attempts with 5s/10s/20s/40s delays
# comfortably outlasts a transient overload without risking a silent hang.
SHEETS_OVERLOAD_MARKER = "Sheets service overloaded"
MAX_RETRIES = 4
RETRY_BASE_DELAY_S = 5

BQ_PROJECT_ID = "baldash-508920"
# The Google Sheets external table behind baldashboard.performance_metrics.
SOURCE_TABLE = f"{BQ_PROJECT_ID}.baldashboard.sheet"
DASHBOARD = Path(__file__).resolve().parents[2] / "bridge" / "balbridge.yml"
SCOPES = [
    "https://www.googleapis.com/auth/bigquery",
    "https://www.googleapis.com/auth/drive.readonly",
]

credentials, _ = google.auth.default(scopes=SCOPES)
client = bigquery.Client(project=BQ_PROJECT_ID, credentials=credentials)

# Widget keys passed through to the page as display config (never SQL).
DISPLAY_KEYS = ["chart", "x", "y", "color", "stacked", "value", "label", "columns", "slices", "content"]


def json_value(v):
    if isinstance(v, Decimal):
        return float(v)
    if hasattr(v, "isoformat"):
        return v.isoformat()
    return v


def run(sql):
    for attempt in range(MAX_RETRIES + 1):
        try:
            job = client.query(sql)
            result = job.result()
            return {
                "columns": [field.name for field in result.schema],
                "rows": [[json_value(v) for v in row.values()] for row in result],
            }
        except BadRequest as e:
            if SHEETS_OVERLOAD_MARKER not in str(e) or attempt == MAX_RETRIES:
                raise
            delay = RETRY_BASE_DELAY_S * (2 ** attempt)
            print(f"Sheets overloaded, retrying in {delay}s (attempt {attempt + 1}/{MAX_RETRIES})...", file=sys.stderr)
            time.sleep(delay)


def source_modified():
    """When the source Sheet was last modified (ISO timestamp), or None.

    Only feeds the footer, so any failure is a warning, not a failed build.
    """
    try:
        uri = client.get_table(SOURCE_TABLE).external_data_configuration.source_uris[0]
        sheet_id = uri.split("/spreadsheets/d/")[1].split("/")[0]
        response = AuthorizedSession(credentials).get(
            f"https://www.googleapis.com/drive/v3/files/{sheet_id}",
            params={"fields": "modifiedTime", "supportsAllDrives": "true"},
            timeout=30,
        )
        response.raise_for_status()
        return response.json()["modifiedTime"]
    except Exception as e:  # noqa: BLE001
        print(f"warning: couldn't read the source Sheet's modified time: {e}", file=sys.stderr)
        return None


def main():
    dashboard = yaml.safe_load(DASHBOARD.read_text())
    filters = [
        {"name": f["name"], "options": f["options"]["values"], "default": f["default"]}
        for f in dashboard["filters"]
    ]
    combos = list(itertools.product(*[f["options"] for f in filters]))
    env = jinja2.Environment(undefined=jinja2.StrictUndefined)

    # Layout: rows are grouped by tab name, in order of each tab's first
    # appearance (as DAC does, even when a tab's rows aren't adjacent in the
    # YAML). Widget ids (r<row>-w<widget>) match DAC's, so results can be
    # compared one-to-one.
    tabs, notes, sql_templates = {}, [], {}
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
        if "tab" not in row:
            notes.extend(widgets)
        else:
            tabs.setdefault(row["tab"], {"name": row["tab"], "rows": []})["rows"].append(widgets)
    tabs = list(tabs.values())

    # Render every widget's SQL for every filter combination; run each distinct
    # query once.
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
    with ThreadPoolExecutor(max_workers=3) as pool:
        data = dict(zip(queries, pool.map(run, queries.values())))

    json.dump(
        {
            "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "source_modified": source_modified(),
            "name": dashboard["name"],
            "description": dashboard.get("description"),
            "filters": filters,
            "notes": notes,
            "tabs": tabs,
            "results": results,
            "data": data,
        },
        sys.stdout,
        separators=(",", ":"),
    )


if __name__ == "__main__":
    main()
