-- Hand-written for the City Performance Measures dashboard (Homeless
-- Prevention service category) -- same ground-up HMIS CSV replacement as
-- sql/city_outreach.sql, no DAC YAML widget to extract from. Takes
-- @report_start/@report_end directly (a city fiscal quarter is 3 months),
-- same convention as city_outreach.sql.
--
-- Two measures (FY27_Measures_and_Notes.xlsx, "Homeless Prevention"):
--   8931 -- unduplicated count of clients with an active Homeless
--          Prevention (ProjectType = 12) enrollment at any point in the
--          period. Same Active-Clients convention as city_outreach.sql/
--          sql/m3_sheltered.sql (EntryDate <= period_end AND (no exit, or
--          exit after period_start)) -- NOT the legacy "HMIS Active Client
--          List" report's own figures; expect this count to differ from
--          the workbook's historical values for that reason (e.g. 386 vs.
--          the workbook's 294 for CFY25 Q1), same divergence already
--          documented for 8941 in sql/city_outreach.sql.
--   8932 -- % of HOUSEHOLDS (by Head of Household) entering ES, SH, or TH
--          in the period who have NO prior enrollment in ES, SH, TH, or PH
--          (scanned via the HoH's own PersonalID) in the lookback window.
--          This is the household-level variant (HUD SPM 5.2) of the
--          person-level 5.1 logic already in sql/m5_first_time.sql --
--          entry_projects, scan_projects, and the lookback rule
--          (GREATEST(report_start - 7yr, client_start - 730 days), i.e.
--          "no activity in ES/SH/TH/PH in the past 2 years") are copied
--          verbatim from there; only the population is restricted to
--          Heads of Household and HouseholdID is carried through instead
--          of counting every household member. Validated live against
--          CFY25 Q1 (54.8% here vs. the workbook's 43.9%) and CFY26 Q1
--          (62.8% vs. 64.9%) -- same ballpark and matching trend
--          direction, not an exact match, for the same reason as 8931.
WITH hp_projects AS (
  SELECT ProjectID FROM balhmiscsv.Project WHERE ProjectType = 12
),
hp_active AS (
  SELECT DISTINCT en.PersonalID
  FROM balhmiscsv.Enrollment en
  JOIN hp_projects hp ON en.ProjectID = hp.ProjectID
  LEFT JOIN balhmiscsv.Exit ex ON en.EnrollmentID = ex.EnrollmentID
  WHERE (en.EnrollmentCoC = 'MD-501' OR en.EnrollmentCoC IS NULL)
    AND en.EntryDate <= @report_end
    AND (ex.ExitDate IS NULL OR ex.ExitDate > @report_start)
),
entry_projects AS (
  SELECT p.ProjectID FROM balhmiscsv.Project p
  WHERE p.ContinuumProject = 1 AND p.ProjectType IN (0, 1, 2, 8)
),
scan_projects AS (
  SELECT p.ProjectID FROM balhmiscsv.Project p
  WHERE p.ContinuumProject = 1 AND p.ProjectType IN (0, 1, 2, 3, 8, 9, 10, 13)
),
hoh_entries AS (
  SELECT en.PersonalID, en.HouseholdID, en.EntryDate
  FROM balhmiscsv.Enrollment en
  JOIN entry_projects ep ON en.ProjectID = ep.ProjectID
  WHERE en.RelationshipToHoH = 1
    AND en.EntryDate BETWEEN @report_start AND @report_end
    AND (en.EnrollmentCoC = 'MD-501' OR en.EnrollmentCoC IS NULL)
),
household_start AS (
  SELECT HouseholdID, PersonalID, MIN(EntryDate) AS client_start_date
  FROM hoh_entries
  GROUP BY HouseholdID, PersonalID
),
prior_history AS (
  SELECT DISTINCT hs.HouseholdID
  FROM household_start hs
  JOIN balhmiscsv.Enrollment en2 ON en2.PersonalID = hs.PersonalID AND en2.EntryDate < hs.client_start_date
  JOIN scan_projects sp ON en2.ProjectID = sp.ProjectID
  LEFT JOIN balhmiscsv.Exit ex2 ON en2.EnrollmentID = ex2.EnrollmentID
  WHERE (en2.EnrollmentCoC = 'MD-501' OR en2.EnrollmentCoC IS NULL)
    AND (
      ex2.ExitDate IS NULL
      OR ex2.ExitDate >= GREATEST(DATE_SUB(@report_start, INTERVAL 7 YEAR), DATE_SUB(hs.client_start_date, INTERVAL 730 DAY))
    )
)
SELECT
  (SELECT COUNT(DISTINCT PersonalID) FROM hp_active) AS hp_active_clients,
  (SELECT COUNT(DISTINCT HouseholdID) FROM household_start) AS hh_entries_total,
  (SELECT COUNT(DISTINCT HouseholdID) FROM household_start) - (SELECT COUNT(DISTINCT HouseholdID) FROM prior_history) AS hh_first_time
