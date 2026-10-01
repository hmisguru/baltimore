"""Observable Framework data loader: Coordinated Entry Line dashboard.

Renders the DAC dashboard definition in
coordinated-entry/balcoordinatedentry.yml statically: runs each widget's own
SQL once at build time (the dashboard has no filters) and writes the widget
layout plus all results as one JSON document.

Reads clienttrack.Call and clienttrack.CodeLink directly -- plain BigQuery
tables kept fresh by the ClientTrack CTAPI sync in the private hmisguru/
baltimore repo (scripts/sync_call.py, sync_codelink.py, via the
baltimore-call-sync Render service). No Google Sheets/Drive involvement,
unlike bridge.json.py's performance_metrics source, so this loader only
needs the plain BigQuery scope.

Unlike bridge.json.py, this dashboard's rows have no "tab" key at all (it's
a single-page dashboard), so the layout is one flat list of rows rather than
tabs grouped by name.
"""

import json
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

import google.auth
import yaml
from google.cloud import bigquery

BQ_PROJECT_ID = "baldash-508920"
DASHBOARD = Path(__file__).resolve().parents[2] / "coordinated-entry" / "balcoordinatedentry.yml"

credentials, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/bigquery"])
client = bigquery.Client(project=BQ_PROJECT_ID, credentials=credentials)

# Widget keys passed through to the page as display config (never SQL).
DISPLAY_KEYS = ["chart", "x", "y", "color", "stacked", "value", "label", "columns", "pivot"]


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


def main():
    dashboard = yaml.safe_load(DASHBOARD.read_text())

    # Layout: a flat list of rows (no tabs), each a list of widgets. Widget
    # ids (r<row>-w<widget>) match DAC's, so results can be compared
    # one-to-one against the live dashboard.
    rows_out, sqls = [], {}
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
                sqls[wid] = w["sql"]
        rows_out.append(widgets)

    print(f"{len(sqls)} widgets, no filters", file=sys.stderr)
    with ThreadPoolExecutor(max_workers=8) as pool:
        data = dict(zip(sqls, pool.map(run, sqls.values())))

    json.dump(
        {
            "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "name": dashboard["name"],
            "description": dashboard.get("description"),
            "rows": rows_out,
            "data": data,
        },
        sys.stdout,
        separators=(",", ":"),
    )


if __name__ == "__main__":
    main()
