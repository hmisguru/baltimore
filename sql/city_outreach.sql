-- Hand-written for the City Performance Measures dashboard (Outreach to the
-- Homeless service category) -- no balspm.yml widget to extract from, since
-- this dashboard is a ground-up HMIS CSV replacement for FY27_Measures_and_
-- Notes.xlsx's legacy methodology column ("HMIS Active Client List" report
-- exports, SPM 7a.1 report pulls), not a copy of an existing DAC dashboard.
--
-- Unlike sql/*.sql extracted from balspm.yml, this takes an explicit
-- @report_end (the city's fiscal quarters are 3 months, not the +1-year
-- window the other files' single @report_start implies) rather than
-- deriving one period length from @report_start alone.
--
-- Three measures (FY27_Measures_and_Notes.xlsx, "Outreach to the Homeless"):
--   8941 -- unduplicated count of clients with an active Street Outreach
--          (ProjectType = 4) enrollment at any point in the period. "Active"
--          here matches this repo's own Active-Clients convention used
--          throughout sql/m3_sheltered.sql etc (EntryDate <= period_end AND
--          (no exit, or exit after period_start)) -- NOT the legacy report's
--          own exact figures, which this new methodology is deliberately
--          replacing; expect this count to differ from FY27_Measures_and_
--          Notes.xlsx's historical values for that reason, not as an error.
--   8942 -- % of that same cohort who also have an active Coordinated Entry
--          (ProjectType = 14) enrollment in the same period.
--   8943 -- % of Street Outreach exits in the period whose destination is
--          Safe Haven or Emergency Shelter (101, 118), Temporary (300-399,
--          e.g. Transitional Housing) or Permanent (400-499) -- i.e. moved
--          into some form of housing or shelter, not still unsheltered.
--          Destination 116 ("place not meant for habitation") is explicitly
--          excluded even though it falls in the 100-199 range, since it
--          means the person is still unsheltered, not a successful exit;
--          catching that was the single biggest fix needed to bring this
--          number in line with FY27_Measures_and_Notes.xlsx's own historical
--          rate (an earlier draft that bucketed the whole 100-199 range as
--          "shelter" came out 3x too high). Institutional (200-299) and
--          other/unknown (8, 9, 17, 24, 30, 37, 99) destinations don't count
--          as success either way.
WITH so_projects AS (
  SELECT ProjectID
  FROM balhmiscsv.Project
  WHERE ProjectType = 4 AND ContinuumProject = 1
),
ce_projects AS (
  SELECT ProjectID
  FROM balhmiscsv.Project
  WHERE ProjectType = 14 AND ContinuumProject = 1
),
so_active AS (
  SELECT DISTINCT en.PersonalID
  FROM balhmiscsv.Enrollment en
  JOIN so_projects sp ON en.ProjectID = sp.ProjectID
  LEFT JOIN balhmiscsv.Exit ex ON en.EnrollmentID = ex.EnrollmentID
  WHERE (en.EnrollmentCoC = 'MD-501' OR en.EnrollmentCoC IS NULL)
    AND en.EntryDate <= @report_end
    AND (ex.ExitDate IS NULL OR ex.ExitDate > @report_start)
),
ce_active AS (
  SELECT DISTINCT en.PersonalID
  FROM balhmiscsv.Enrollment en
  JOIN ce_projects cp ON en.ProjectID = cp.ProjectID
  LEFT JOIN balhmiscsv.Exit ex ON en.EnrollmentID = ex.EnrollmentID
  WHERE (en.EnrollmentCoC = 'MD-501' OR en.EnrollmentCoC IS NULL)
    AND en.EntryDate <= @report_end
    AND (ex.ExitDate IS NULL OR ex.ExitDate > @report_start)
),
so_exits AS (
  SELECT
    en.PersonalID,
    IF(ex.Destination IN (101, 118) OR (ex.Destination >= 300 AND ex.Destination < 500), 1, 0) AS success
  FROM balhmiscsv.Enrollment en
  JOIN so_projects sp ON en.ProjectID = sp.ProjectID
  JOIN balhmiscsv.Exit ex ON en.EnrollmentID = ex.EnrollmentID
  WHERE (en.EnrollmentCoC = 'MD-501' OR en.EnrollmentCoC IS NULL)
    AND ex.ExitDate BETWEEN @report_start AND @report_end
)
SELECT
  (SELECT COUNT(DISTINCT PersonalID) FROM so_active) AS so_active_clients,
  (SELECT COUNT(DISTINCT a.PersonalID) FROM so_active a JOIN ce_active c USING (PersonalID)) AS so_also_ce,
  (SELECT COUNT(*) FROM so_exits) AS so_exits_total,
  (SELECT COUNTIF(success = 1) FROM so_exits) AS so_exits_successful
