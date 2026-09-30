"""Re-extract the KPI queries from the baltimore repo's System Performance dashboard.

The SQL in sql/ is a copy of specific widgets in balspm.yml (hmisguru/baltimore,
`staging` branch), so the published KPIs match the dashboard exactly. When a
measure's logic changes there, re-run this against a fresh copy of that file:

    git -C ../baltimore show origin/staging:balspm.yml > /tmp/balspm.yml
    python scripts/extract_sql.py /tmp/balspm.yml

The dashboard's `{{ filters.report_start }}` date becomes the BigQuery query
parameter `@report_start`, which the data loader sets to the fiscal year being
reported. Its Project filter (by ProjectName) becomes
`(@all_projects OR p.ProjectID IN UNNEST(@project_ids))`, so one query serves
both the CoC-wide KPIs (`@all_projects = TRUE`) and the "MOHS-funded only"
variant (the loader passes that project list).

One intentional deviation from the dashboard, listed in UNFILTERED_CTES: when
Measure 5.1 is filtered to some projects, the dashboard also narrows its
search for prior homeless-system activity to those same projects, so someone
with a stay elsewhere in the CoC would count as "first-time". The KPIs always
search the whole CoC for prior activity, the same way the dashboard's own
Measure 2 always searches CoC-wide for returns.
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

# CTEs whose Project filter is dropped so they always cover every CoC project.
UNFILTERED_CTES = {
    "m5_first_time.sql": ["scan_projects"],
}

PLACEHOLDER = "__REPORT_START__"
PROJECT_PLACEHOLDER = "__PROJECT_FILTER__"
RENDERED_FILTER = f"AND p.ProjectName IN ('{PROJECT_PLACEHOLDER}')"
PARAM_FILTER = "AND (@all_projects OR p.ProjectID IN UNNEST(@project_ids))"


def drop_cte_filter(sql, cte, filename):
    """Remove the rendered Project filter line from one CTE."""
    start = sql.find(f"{cte} AS (")
    end = sql.find("\n),", start)
    if start < 0 or end < 0 or RENDERED_FILTER not in sql[start:end]:
        sys.exit(f"Could not find the Project filter in CTE {cte} of {filename}")
    body = "\n".join(line for line in sql[start:end].splitlines() if RENDERED_FILTER not in line)
    return sql[:start] + body + sql[end:]


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
            filters={"report_start": PLACEHOLDER, "project": [PROJECT_PLACEHOLDER]}
        )
        sql = sql.replace(f"DATE('{PLACEHOLDER}')", "@report_start")
        if PLACEHOLDER in sql:
            sys.exit(f"Unreplaced report_start placeholder in {name}")
        if RENDERED_FILTER not in sql:
            sys.exit(f"No Project filter found in {name}; the dashboard's filter markup changed")
        for cte in UNFILTERED_CTES.get(filename, []):
            sql = drop_cte_filter(sql, cte, filename)
        sql = sql.replace(RENDERED_FILTER, PARAM_FILTER)
        if PROJECT_PLACEHOLDER in sql:
            sys.exit(f"Unreplaced Project filter placeholder in {name}")
        # Drop blank lines left behind by the Jinja blocks.
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
