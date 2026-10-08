-- Hand-written for the City Performance Measures dashboard (Permanent
-- Housing service category) -- same ground-up HMIS CSV replacement as
-- sql/city_outreach.sql/city_prevention.sql, no DAC YAML widget to extract
-- from. Takes @report_start/@report_end directly, same convention as
-- those files.
--
-- Three of the workbook's five Permanent Housing measures (8962/8963,
-- income growth via HUD SPM 4/APR Q19, are a substantial new methodology
-- not yet built anywhere in this repo -- deferred to a dedicated
-- follow-up rather than rushed into this file):
--   8961 -- % of HOUSEHOLDS (by Head of Household) with an active,
--          moved-in PSH or OPH (ProjectType 3, 9 -- "PH beds" throughout
--          this dashboard means PSH+OPH, never RRH) enrollment at any
--          point in the period who retained permanent housing: still
--          active (no exit) OR exited to anything other than a literal
--          "still homeless" destination (100-199). Households whose exit
--          destination is a non-informative code (client doesn't know/
--          refused, no exit interview, data not collected, deceased, or
--          an invalid/deleted code -- 8, 9, 17, 24, 30, 99, 206, 215, 225)
--          are excluded from the universe entirely, same exclusion
--          pattern as sql/m7b1_placement.sql's narrower 4-code list.
--          This reproduces the workbook's own historical rate almost
--          exactly (CFY25 Q1: 98.6% here vs. 98.51%; CFY26 Q1: 99.5% vs.
--          99.14%) -- a much tighter match than this dashboard's other
--          measures get, because (unlike Active-Clients vs. the legacy
--          "HMIS Active Client List" report) this is the same underlying
--          exit-destination classification HUD's own SPM 7b.2 spec uses,
--          just reimplemented directly instead of pulled from a report.
--   8964 -- total PSH + OPH (ProjectType 3, 9) beds active as of
--          report_end (balhmiscsv.Inventory, same InventoryStartDate <=
--          as_of AND (InventoryEndDate IS NULL OR InventoryEndDate >=
--          as_of) convention as inventory.json.py's own active-inventory
--          window), not a true annual HIC submission -- expect this to
--          diverge somewhat from the workbook's "Previous FY HIC" figures
--          for that reason (e.g. 4,951 here vs. the workbook's 5,362 for
--          CFY25 Q1), same divergence-is-expected posture as every other
--          measure in this dashboard.
--   8965 -- % of HOUSEHOLDS (by Head of Household) who exited to a
--          permanent destination (400-499) 2 years before this period and
--          returned to any homeless service project (SO/ES/TH/SH, or a PH
--          project after a 14-day grace period with no overlapping PH
--          enrollment) by period end. Adapted from sql/m2_returns.sql's
--          existing "TOTAL Returns to Homelessness" row logic (candidates/
--          matches, the 14-day PH grace period, the NOT EXISTS overlap
--          check) with two changes: @report_start/@report_end taken
--          directly instead of implying a 1-year window, and the exiting
--          side restricted to Heads of Household only (so a household's
--          identity is tracked via its HoH's own PersonalID, same
--          approximation already used for 8932) -- the return side still
--          scans CoC-wide by PersonalID, unchanged. Reproduces the
--          workbook's own rate closely (CFY25 Q1: 18.2% here vs. 18.6%;
--          CFY26 Q1: 14.7% vs. 14.6%).
WITH ph_projects AS (
  SELECT ProjectID FROM balhmiscsv.Project WHERE ProjectType IN (3, 9) AND ContinuumProject = 1
),
hoh_ph AS (
  SELECT en.HouseholdID, ex.ExitDate, ex.Destination
  FROM balhmiscsv.Enrollment en
  JOIN ph_projects pp ON en.ProjectID = pp.ProjectID
  LEFT JOIN balhmiscsv.Exit ex ON en.EnrollmentID = ex.EnrollmentID
  WHERE en.RelationshipToHoH = 1
    AND (en.EnrollmentCoC = 'MD-501' OR en.EnrollmentCoC IS NULL)
    AND en.MoveInDate IS NOT NULL AND en.MoveInDate <= @report_end
    AND en.EntryDate <= @report_end
    AND (ex.ExitDate IS NULL OR ex.ExitDate > @report_start)
),
retention_elig AS (
  SELECT * FROM hoh_ph
  WHERE ExitDate IS NULL OR Destination NOT IN (8, 9, 17, 24, 30, 99, 206, 215, 225)
),
beds AS (
  SELECT SUM(i.BedInventory) AS n
  FROM balhmiscsv.Inventory i
  JOIN balhmiscsv.Project p ON i.ProjectID = p.ProjectID
  WHERE i.InventoryStartDate <= @report_end
    AND (i.InventoryEndDate IS NULL OR i.InventoryEndDate >= @report_end)
    AND p.ProjectType IN (3, 9)
),
return_qualifying_projects AS (
  SELECT p.ProjectID, p.ProjectType FROM balhmiscsv.Project p
  WHERE p.ContinuumProject = 1 AND p.ProjectType IN (0, 1, 2, 3, 4, 8, 9, 10, 13)
),
lookback_exits AS (
  SELECT en.PersonalID, en.EnrollmentID, ex.ExitDate, ex.Destination
  FROM balhmiscsv.Enrollment en
  JOIN return_qualifying_projects qp ON en.ProjectID = qp.ProjectID
  JOIN balhmiscsv.Exit ex ON en.EnrollmentID = ex.EnrollmentID
  WHERE en.RelationshipToHoH = 1
    AND ex.ExitDate >= DATE_SUB(@report_start, INTERVAL 730 DAY)
    AND ex.ExitDate <= DATE_SUB(@report_end, INTERVAL 730 DAY)
    AND (en.EnrollmentCoC = 'MD-501' OR en.EnrollmentCoC IS NULL)
),
ph_exits AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY PersonalID ORDER BY ExitDate ASC, EnrollmentID ASC) AS rn
  FROM lookback_exits WHERE Destination BETWEEN 400 AND 499
),
exited_hoh AS (
  SELECT PersonalID, ExitDate FROM ph_exits WHERE rn = 1
),
return_candidates AS (
  SELECT en2.PersonalID, en2.EnrollmentID, en2.EntryDate, qp2.ProjectType
  FROM balhmiscsv.Enrollment en2
  JOIN return_qualifying_projects qp2 ON en2.ProjectID = qp2.ProjectID
  WHERE (en2.EnrollmentCoC = 'MD-501' OR en2.EnrollmentCoC IS NULL)
),
returned_hoh AS (
  SELECT eh.PersonalID
  FROM exited_hoh eh
  JOIN return_candidates c ON c.PersonalID = eh.PersonalID
    AND c.EntryDate >= eh.ExitDate AND c.EntryDate <= @report_end
  WHERE c.ProjectType IN (4, 0, 1, 2, 8)
    OR (
      c.ProjectType IN (3, 9, 10, 13)
      AND c.EntryDate > DATE_ADD(eh.ExitDate, INTERVAL 14 DAY)
      AND NOT EXISTS (
        SELECT 1
        FROM balhmiscsv.Enrollment en3
        JOIN return_qualifying_projects qp3 ON en3.ProjectID = qp3.ProjectID
        LEFT JOIN balhmiscsv.Exit ex3 ON en3.EnrollmentID = ex3.EnrollmentID
        WHERE en3.PersonalID = eh.PersonalID
          AND qp3.ProjectType IN (3, 9, 10, 13)
          AND en3.EnrollmentID != c.EnrollmentID
          AND c.EntryDate >= DATE_ADD(en3.EntryDate, INTERVAL 1 DAY)
          AND c.EntryDate <= LEAST(COALESCE(DATE_ADD(ex3.ExitDate, INTERVAL 14 DAY), @report_end), @report_end)
      )
    )
  GROUP BY eh.PersonalID
)
SELECT
  (SELECT COUNT(DISTINCT HouseholdID) FROM retention_elig) AS ph_retention_universe,
  (SELECT COUNT(DISTINCT HouseholdID) FROM retention_elig WHERE ExitDate IS NULL OR Destination NOT BETWEEN 100 AND 199) AS ph_retained,
  (SELECT n FROM beds) AS ph_beds,
  (SELECT COUNT(DISTINCT PersonalID) FROM exited_hoh) AS ph_return_universe,
  (SELECT COUNT(DISTINCT PersonalID) FROM returned_hoh) AS ph_returned
