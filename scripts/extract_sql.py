"""Re-extract the KPI queries from the baltimore repo's System Performance dashboard.

The SQL in sql/ is a copy of specific widgets in balspm.yml (hmisguru/baltimore,
`staging` branch), so the published KPIs match the dashboard exactly. When a
measure's logic changes there, re-run this against a fresh copy of that file:

    git -C ../baltimore show origin/staging:balspm.yml > /tmp/balspm.yml
    python scripts/extract_sql.py /tmp/balspm.yml

The dashboard's Jinja is rendered with no Project filter (CoC-wide), and its
`{{ filters.report_start }}` date becomes the BigQuery query parameter
`@report_start`, which the data loader sets to the fiscal year being reported.
"""

import sys
from pathlib import Path

import jinja2
import yaml

SQL_DIR = Path(__file__).resolve().parent.parent / "sql"

# Output file -> exact widget name in balspm.yml.
WIDGETS = {
    "m1_length_of_time.sql": "Measures 1a and 1b — Average and Median Length of Time Homeless",
    "m2_returns.sql": "Measure 2a/2b — Returns to Homelessness Within 6, 12, and 24 Months",
    "m3_sheltered.sql": "Metric 3.2 — Unduplicated Sheltered Persons",
    "m5_first_time.sql": "Metric 5.1 — First-Time Homeless (ES, SH, TH)",
    "m7a1_street_outreach.sql": "Metric 7a.1 — Successful Placement from Street Outreach",
    "m7b1_placement.sql": "Metric 7b.1 — Successful Placement (ES, SH, TH, PH-RRH, PH exits without move-in)",
}

PLACEHOLDER = "__REPORT_START__"


def main(dashboard_path):
    dashboard = yaml.safe_load(Path(dashboard_path).read_text())
    widgets = {
        w["name"]: w
        for row in dashboard["rows"]
        for w in row.get("widgets", [])
    }
    env = jinja2.Environment()
    SQL_DIR.mkdir(exist_ok=True)
    for filename, name in WIDGETS.items():
        if name not in widgets:
            sys.exit(f"Widget not found in {dashboard_path}: {name}")
        sql = env.from_string(widgets[name]["sql"]).render(
            filters={"report_start": PLACEHOLDER, "project": []}
        )
        sql = sql.replace(f"DATE('{PLACEHOLDER}')", "@report_start")
        if PLACEHOLDER in sql:
            sys.exit(f"Unreplaced report_start placeholder in {name}")
        # Drop blank lines left behind by the removed Project-filter blocks.
        sql = "\n".join(line for line in sql.splitlines() if line.strip()) + "\n"
        header = (
            f"-- Copied from balspm.yml (hmisguru/baltimore, staging): \"{name}\".\n"
            "-- Regenerate with scripts/extract_sql.py; do not edit by hand.\n"
        )
        (SQL_DIR / filename).write_text(header + sql)
        print(f"wrote sql/{filename}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: python scripts/extract_sql.py path/to/balspm.yml")
    main(sys.argv[1])
