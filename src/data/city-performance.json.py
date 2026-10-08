"""Observable Framework data loader: City Performance Measures dashboard.

A ground-up replacement for FY27_Measures_and_Notes.xlsx's own methodology
column: that workbook's 19 measures are currently pulled from a mix of
manual HMIS report exports ("HMIS Active Client List"), HUD SPM/APR report
pulls, and annual PIT/HIC submissions. This loader computes the same
measures directly from balhmiscsv instead, so they can be rebuilt on demand
rather than hand-assembled each quarter.

Built and reviewed one service category at a time, per sql/<name>.sql file:
"Outreach to the Homeless" (8941-8943, sql/city_outreach.sql) and
"Homeless Prevention" (8931, 8932, sql/city_prevention.sql) so far.
Permanent Housing and Temporary Housing aren't built yet -- add them the
same way. PIT-sourced measures (8955, 8956) are out of scope entirely: a
Point-in-Time count is a single-night manual count, not HMIS enrollment
data -- the same reasoning the Westchester repo's own CLAUDE.md documents
for omitting PIT from spm.json.py there.

Uses the City's fiscal year (July 1 - June 30, confirmed against
FY27_Measures_and_Notes.xlsx's own "CFY" quarter columns), NOT the federal
fiscal year (Oct 1 - Sep 30) every other dashboard in this repo uses --
genuinely a different calendar, specific to this one dashboard.

Known divergence from the workbook's own historical numbers, expected and
not a bug: this loader's Active-Clients methodology (matching how every
other measure in this repo counts "active" enrollments) doesn't reproduce
the legacy "HMIS Active Client List" report's exact figures. That's the
point of switching data sources, not a defect -- see sql/city_outreach.sql's
own header for the one caveat on measure 8943 (destination code 116, "place
not meant for habitation") that *was* a real methodology bug and got fixed.
"""

import json
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone
from pathlib import Path

from google.cloud import bigquery

BQ_PROJECT_ID = "baldash-508920"
SQL_DIR = Path(__file__).resolve().parents[2] / "sql"

client = bigquery.Client(project=BQ_PROJECT_ID)

SQL_FILES = {
    "outreach": (SQL_DIR / "city_outreach.sql").read_text(),
    "prevention": (SQL_DIR / "city_prevention.sql").read_text(),
    "permanent": (SQL_DIR / "city_permanent.sql").read_text(),
    "temporary": (SQL_DIR / "city_temporary.sql").read_text(),
}

# FY25/FY26/FY27 targets, copied from FY27_Measures_and_Notes.xlsx's own
# Results sheet (columns J, P, V) -- not derived from HMIS data at all.
# Omitted where the workbook's own CY27 Target column reads "N/A" (8931).
TARGETS = {
    "street-outreach-enrollments": {"CFY25": 4000, "CFY26": 4000, "CFY27": 3800},
    "street-outreach-ce-overlap": {"CFY25": 0.20, "CFY26": 0.20, "CFY27": 0.20},
    "street-outreach-successful-exits": {"CFY25": 0.27, "CFY26": 0.27, "CFY27": 0.27},
    "homeless-prevention-enrollments": {"CFY25": 600, "CFY26": 600},
    "homeless-prevention-first-time": {"CFY25": 0.75, "CFY26": 0.75, "CFY27": 0.75},
    "ph-retention": {"CFY25": 0.90, "CFY26": 0.97, "CFY27": 0.95},
    "ph-beds": {"CFY25": 4000, "CFY26": 4000, "CFY27": 5000},
    "ph-returns": {"CFY25": 0.14, "CFY26": 0.14, "CFY27": 0.14},
    "th-exits-to-ph": {"CFY25": 0.45, "CFY26": 0.45, "CFY27": 0.45},
    "th-length-of-time": {"CFY25": 150, "CFY26": 120, "CFY27": 120},
    "es-beds": {"CFY25": 1535, "CFY26": 1535, "CFY27": 1535},
}


def query(sql, params):
    job = client.query(sql, job_config=bigquery.QueryJobConfig(query_parameters=params))
    return dict(next(iter(job.result())))


def run_period(report_start, report_end):
    params = [
        bigquery.ScalarQueryParameter("report_start", "DATE", report_start),
        bigquery.ScalarQueryParameter("report_end", "DATE", report_end),
    ]
    merged = {}
    for sql in SQL_FILES.values():
        merged.update(query(sql, params))
    return merged


def add_months(d, months):
    m = d.month - 1 + months
    return date(d.year + m // 12, m % 12 + 1, 1)


def cfy_label(quarter_start):
    """The city fiscal year (Jul 1 - Jun 30) a quarter start date falls in,
    labeled by the calendar year it ends in -- Jul-Dec of year N and
    Jan-Jun of year N+1 are both "CFY<N+1>"."""
    end_year = quarter_start.year + 1 if quarter_start.month >= 7 else quarter_start.year
    return f"CFY{end_year % 100}"


def city_quarters(first_start, export_end):
    """[(cfy_label, quarter_label, start, end), ...] for every complete city
    fiscal quarter (Jul-Sep, Oct-Dec, Jan-Mar, Apr-Jun) from first_start
    through the latest one fully covered by export_end."""
    quarters = []
    start = first_start
    q_num = (((start.month - 7) % 12) // 3) + 1
    while True:
        end = add_months(start, 3) - date.resolution
        if end > export_end:
            break
        quarters.append((cfy_label(start), f"Q{q_num}", start, end))
        start = add_months(start, 3)
        q_num = q_num % 4 + 1
    return quarters


def cfy_bounds(cfy_label):
    end_year = 2000 + int(cfy_label[3:])
    return date(end_year - 1, 7, 1), date(end_year, 6, 30)


def build_measure(service, measure_id_key, measure_id, title, description, fmt, unit, better, by_quarter, by_cfy):
    return {
        "id": measure_id_key,
        "service": service,
        "measureId": measure_id,
        "title": title,
        "description": description,
        "format": fmt,
        "unit": unit,
        "better": better,
        "quarters": by_quarter,
        "annual": by_cfy,
        "targets": TARGETS[measure_id_key],
    }


def main():
    export_end = query(
        "SELECT MAX(ExportEndDate) AS d FROM balhmiscsv.Export", []
    )["d"]

    quarters = city_quarters(date(2024, 7, 1), export_end)
    complete_cfys = sorted({q[0] for q in quarters if q[1] == "Q4"})

    with ThreadPoolExecutor(max_workers=len(quarters) + len(complete_cfys)) as pool:
        quarter_futures = {
            (cfy, q): pool.submit(run_period, start, end)
            for cfy, q, start, end in quarters
        }
        cfy_futures = {
            cfy: pool.submit(run_period, *cfy_bounds(cfy))
            for cfy in complete_cfys
        }
        quarter_results = {key: f.result() for key, f in quarter_futures.items()}
        cfy_results = {cfy: f.result() for cfy, f in cfy_futures.items()}

    def series(field, targets, pct=False):
        by_quarter = [
            {
                "cfy": cfy,
                "quarter": q,
                "label": f"{cfy} {q}",
                "value": (quarter_results[(cfy, q)][field[0]] / quarter_results[(cfy, q)][field[1]])
                if pct else quarter_results[(cfy, q)][field],
            }
            for cfy, q, _, _ in quarters
        ]
        by_cfy = [
            {
                "cfy": cfy,
                "value": (cfy_results[cfy][field[0]] / cfy_results[cfy][field[1]]) if pct else cfy_results[cfy][field],
                "target": targets.get(cfy),
            }
            for cfy in complete_cfys
        ]
        return by_quarter, by_cfy

    measures = []
    for service, key, measure_id, title, description, fmt, unit, better, field, pct in [
        (
            "Outreach to the Homeless", "street-outreach-enrollments", 8941, "Street outreach enrollments",
            "Unduplicated clients with an active Street Outreach enrollment at any point in the period.",
            "number", "clients", "higher", "so_active_clients", False,
        ),
        (
            "Outreach to the Homeless", "street-outreach-ce-overlap", 8942, "Street outreach → Coordinated Access",
            "Of those clients, the percent who also have an active Coordinated Access enrollment in the same period.",
            "percent", "%", "higher", ("so_also_ce", "so_active_clients"), True,
        ),
        (
            "Outreach to the Homeless", "street-outreach-successful-exits", 8943, "Successful street outreach exits",
            "Percent of street outreach exits to shelter, Safe Haven, transitional housing, or permanent housing.",
            "percent", "%", "higher", ("so_exits_successful", "so_exits_total"), True,
        ),
        (
            "Homeless Prevention", "homeless-prevention-enrollments", 8931, "Homeless Prevention enrollments",
            "Unduplicated clients with an active Homeless Prevention enrollment at any point in the period.",
            "number", "clients", "higher", "hp_active_clients", False,
        ),
        (
            "Homeless Prevention", "homeless-prevention-first-time", 8932, "First-time homeless households",
            "Of households entering shelter, Safe Haven, or transitional housing, the percent with no prior ES/SH/TH/PH enrollment in the past 2 years.",
            "percent", "%", "lower", ("hh_first_time", "hh_entries_total"), True,
        ),
        (
            "Permanent Housing", "ph-retention", 8961, "Households retaining permanent housing",
            "Of households with a moved-in PSH or Other Permanent Housing enrollment, the percent still housed or who exited to a non-homeless destination.",
            "percent", "%", "higher", ("ph_retained", "ph_retention_universe"), True,
        ),
        (
            "Permanent Housing", "ph-beds", 8964, "Permanent housing beds",
            "Total PSH and Other Permanent Housing beds active as of the end of the period.",
            "number", "beds", "higher", "ph_beds", False,
        ),
        (
            "Permanent Housing", "ph-returns", 8965, "Returns to homelessness after PH exit",
            "Of households who exited to permanent housing 2 years before the period, the percent who returned to a homeless service project by period end.",
            "percent", "%", "lower", ("ph_returned", "ph_return_universe"), True,
        ),
        (
            "Temporary Housing", "th-exits-to-ph", 8951, "Temporary housing exits to permanent housing",
            "Percent of persons exiting shelter, Safe Haven, transitional housing, or RRH to a permanent destination.",
            "percent", "%", "higher", ("th_exits_permanent", "th_exits_universe"), True,
        ),
        (
            "Temporary Housing", "th-length-of-time", 8952, "Length of time homeless",
            "Average number of days persons are continuously enrolled in shelter, Safe Haven, or transitional housing.",
            "number", "days", "lower", "th_avg_lot", False,
        ),
        (
            "Temporary Housing", "es-beds", 8957, "Emergency shelter beds",
            "Total emergency shelter beds active as of the end of the period.",
            "number", "beds", None, "es_beds", False,
        ),
    ]:
        by_quarter, by_cfy = series(field, TARGETS[key], pct)
        measures.append(build_measure(service, key, measure_id, title, description, fmt, unit, better, by_quarter, by_cfy))

    json.dump(
        {
            "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "export_end": export_end.isoformat(),
            "services": list(dict.fromkeys(m["service"] for m in measures)),
            "measures": measures,
        },
        sys.stdout,
        indent=2,
    )


if __name__ == "__main__":
    main()
