-- Hand-written for the City Performance Measures dashboard (Temporary
-- Housing service category) -- same ground-up HMIS CSV replacement as
-- sql/city_outreach.sql/city_prevention.sql/city_permanent.sql, no DAC
-- YAML widget to extract from. Takes @report_start/@report_end directly,
-- same convention as those files.
--
-- Three of the workbook's five non-PIT Temporary Housing measures
-- (8953/8954, income growth via HUD SPM 4/APR Q19, deferred -- see
-- sql/city_permanent.sql's own header for why; 8955/8956 are PIT, out of
-- scope entirely per CLAUDE.md):
--   8951 -- % of persons exiting ES, SH, TH, PH-RRH, or PH-without-move-in
--          to a permanent destination (HUD SPM 7b.1). A near-verbatim
--          reuse of sql/m7b1_placement.sql's own classification logic
--          (own_movein/hoh_movein/effective_movein, the still-active
--          leavers filter, the 4-code exclude list) with @report_start/
--          @report_end taken directly instead of implying a 1-year
--          window. Matches the workbook's own rate closely (33.9% vs.
--          34.07% for CFY25 Q1).
--   8952 -- average length of time (days) persons are continuously
--          enrolled in ES, SH, and TH (HUD SPM 1a.2 -- Method 1,
--          literal-homeless-at-entry only, no self-reported start date).
--          A trimmed copy of sql/m1_length_of_time.sql's own row 2
--          ("Persons in ES-EE, ES-NbN, SH, and TH") from its "_base"
--          (1a) computation only: the self-report CTEs (selfreport_*,
--          the "_1b" variants) and the TH-negation/PH-own-nights logic
--          used only by rows 1/3/4 are dropped entirely, since row 2
--          negates only by PH move-in, not by itself; everything that
--          remains (entry_criteria/MoveInDate inheritance, the
--          gaps-and-islands 365-day/7-year lookback window) is copied
--          verbatim. @report_start/@report_end taken directly instead of
--          implying a 1-year window -- correctness isn't affected by
--          period length, since every step is already period-bound
--          through bounds.report_start/report_end. Same-ballpark match
--          to the workbook (230.4 vs. 217.1 days for CFY25 Q1; 228.4 vs.
--          216.9 for CFY26 Q1), same divergence-is-expected posture as
--          this dashboard's other measures.
--   8957 -- total ES-EE + ES-NbN (ProjectType 0, 1 -- not Safe Haven)
--          beds active as of report_end, same balhmiscsv.Inventory
--          point-in-time-snapshot convention as 8964 in
--          sql/city_permanent.sql. Expect divergence from the workbook's
--          "Previous FY HIC" figures for the same reason as 8964 (e.g.
--          1,283 here vs. the workbook's 1,144 for CFY25 Q1).
WITH b1_projects AS (
  SELECT p.ProjectID, p.ProjectType
  FROM balhmiscsv.Project p
  WHERE p.ContinuumProject = 1 AND p.ProjectType IN (0, 1, 2, 3, 8, 9, 10, 13)
),
own_movein AS (
  SELECT en.EnrollmentID, en.HouseholdID, en.RelationshipToHoH, en.EntryDate, ex.ExitDate,
    CASE WHEN en.MoveInDate IS NOT NULL
      AND en.MoveInDate >= en.EntryDate
      AND (ex.ExitDate IS NULL OR en.MoveInDate <= ex.ExitDate)
      AND en.MoveInDate <= @report_end
    THEN en.MoveInDate END AS own_move_in
  FROM balhmiscsv.Enrollment en
  JOIN b1_projects bp ON en.ProjectID = bp.ProjectID
  LEFT JOIN balhmiscsv.Exit ex ON en.EnrollmentID = ex.EnrollmentID
),
hoh_movein_7b1 AS (
  SELECT HouseholdID, own_move_in AS hoh_move_in_date FROM own_movein WHERE RelationshipToHoH = 1
),
effective_movein AS (
  SELECT ov.EnrollmentID,
    CASE
      WHEN ov.RelationshipToHoH = 1 THEN ov.own_move_in
      WHEN hm.hoh_move_in_date IS NULL THEN NULL
      WHEN ov.EntryDate <= hm.hoh_move_in_date AND (ov.ExitDate IS NULL OR ov.ExitDate >= hm.hoh_move_in_date) THEN hm.hoh_move_in_date
      WHEN ov.EntryDate > hm.hoh_move_in_date THEN ov.EntryDate
      ELSE NULL
    END AS MoveInDate
  FROM own_movein ov
  LEFT JOIN hoh_movein_7b1 hm ON hm.HouseholdID = ov.HouseholdID
),
b1_exits AS (
  SELECT en.PersonalID, en.EnrollmentID, bp.ProjectType, ex.ExitDate, ex.Destination, em.MoveInDate
  FROM balhmiscsv.Enrollment en
  JOIN b1_projects bp ON en.ProjectID = bp.ProjectID
  JOIN balhmiscsv.Exit ex ON en.EnrollmentID = ex.EnrollmentID
  LEFT JOIN effective_movein em ON em.EnrollmentID = en.EnrollmentID
  WHERE ex.ExitDate >= @report_start AND ex.ExitDate <= @report_end
    AND (en.EnrollmentCoC = 'MD-501' OR en.EnrollmentCoC IS NULL)
),
b1_still_active AS (
  SELECT DISTINCT en.PersonalID
  FROM balhmiscsv.Enrollment en
  JOIN b1_projects bp ON en.ProjectID = bp.ProjectID
  LEFT JOIN balhmiscsv.Exit ex ON en.EnrollmentID = ex.EnrollmentID
  WHERE en.EntryDate <= @report_end
    AND (ex.ExitDate IS NULL OR ex.ExitDate > @report_end)
    AND (en.EnrollmentCoC = 'MD-501' OR en.EnrollmentCoC IS NULL)
),
b1_leavers_raw AS (
  SELECT e.* FROM b1_exits e
  LEFT JOIN b1_still_active sa ON sa.PersonalID = e.PersonalID
  WHERE sa.PersonalID IS NULL
),
b1_latest_exit AS (
  SELECT PersonalID, ProjectType, ExitDate, Destination, MoveInDate,
    ROW_NUMBER() OVER (PARTITION BY PersonalID ORDER BY ExitDate DESC, EnrollmentID ASC) AS rn
  FROM b1_leavers_raw
),
b1_move_in_filtered AS (
  SELECT * FROM b1_latest_exit
  WHERE rn = 1 AND NOT (ProjectType IN (3, 9, 10) AND MoveInDate IS NOT NULL AND MoveInDate <= @report_end)
),
b1_classified AS (
  SELECT PersonalID,
    CASE WHEN Destination BETWEEN 400 AND 499 THEN 'permanent'
         WHEN Destination IN (206, 215, 225, 24) THEN 'exclude'
         ELSE 'neutral' END AS bucket
  FROM b1_move_in_filtered
),
b1_remaining AS (SELECT * FROM b1_classified WHERE bucket != 'exclude'),

bounds AS (
  SELECT @report_start AS report_start, @report_end AS report_end,
    DATE_SUB(@report_start, INTERVAL 7 YEAR) AS lookback_stop
),
lot_qualifying_projects AS (
  SELECT p.ProjectID, p.ProjectType
  FROM balhmiscsv.Project p
  WHERE p.ContinuumProject = 1 AND p.ProjectType IN (0, 1, 2, 3, 8, 9, 10, 13)
),
entry_criteria_raw AS (
  SELECT en.EnrollmentID, en.PersonalID, en.HouseholdID, en.RelationshipToHoH,
    qp.ProjectType, en.EntryDate, ex.ExitDate, b.report_start, b.report_end, b.lookback_stop,
    CASE WHEN en.MoveInDate IS NOT NULL AND en.MoveInDate >= en.EntryDate
      AND (ex.ExitDate IS NULL OR en.MoveInDate <= ex.ExitDate) AND en.MoveInDate <= b.report_end
    THEN en.MoveInDate END AS own_move_in
  FROM balhmiscsv.Enrollment en
  JOIN lot_qualifying_projects qp ON en.ProjectID = qp.ProjectID
  LEFT JOIN balhmiscsv.Exit ex ON en.EnrollmentID = ex.EnrollmentID
  CROSS JOIN bounds b
  WHERE (en.EnrollmentCoC = 'MD-501' OR en.EnrollmentCoC IS NULL)
),
hoh_movein_lot AS (
  SELECT HouseholdID, own_move_in AS hoh_move_in_date FROM entry_criteria_raw WHERE RelationshipToHoH = 1
),
entry_criteria AS (
  SELECT ecr.EnrollmentID, ecr.PersonalID, ecr.ProjectType, ecr.EntryDate, ecr.ExitDate,
    ecr.report_start, ecr.report_end, ecr.lookback_stop,
    CASE
      WHEN ecr.RelationshipToHoH = 1 THEN ecr.own_move_in
      WHEN hm.hoh_move_in_date IS NULL THEN NULL
      WHEN ecr.EntryDate <= hm.hoh_move_in_date AND (ecr.ExitDate IS NULL OR ecr.ExitDate >= hm.hoh_move_in_date) THEN hm.hoh_move_in_date
      WHEN ecr.EntryDate > hm.hoh_move_in_date THEN ecr.EntryDate
      ELSE NULL
    END AS MoveInDate
  FROM entry_criteria_raw ecr
  LEFT JOIN hoh_movein_lot hm ON hm.HouseholdID = ecr.HouseholdID
),
ee_th_sh_nights AS (
  SELECT ec.PersonalID, ec.ProjectType, ec.EnrollmentID, stay_date
  FROM entry_criteria ec,
    UNNEST(GENERATE_DATE_ARRAY(
      GREATEST(ec.EntryDate, ec.lookback_stop),
      LEAST(DATE_SUB(COALESCE(ec.ExitDate, DATE_ADD(ec.report_end, INTERVAL 1 DAY)), INTERVAL 1 DAY), ec.report_end)
    )) AS stay_date
  WHERE ec.ProjectType IN (0, 2, 8)
    AND GREATEST(ec.EntryDate, ec.lookback_stop) <= LEAST(DATE_SUB(COALESCE(ec.ExitDate, DATE_ADD(ec.report_end, INTERVAL 1 DAY)), INTERVAL 1 DAY), ec.report_end)
),
nbn_nights AS (
  SELECT ec.PersonalID, ec.ProjectType, ec.EnrollmentID, s.DateProvided AS stay_date
  FROM entry_criteria ec
  JOIN balhmiscsv.Services s ON s.EnrollmentID = ec.EnrollmentID
  WHERE ec.ProjectType = 1 AND s.RecordType = 200
    AND s.DateProvided >= GREATEST(ec.EntryDate, ec.lookback_stop)
    AND s.DateProvided <= LEAST(COALESCE(DATE_SUB(ec.ExitDate, INTERVAL 1 DAY), ec.report_end), ec.report_end)
),
shelter_nights AS (
  SELECT * FROM ee_th_sh_nights UNION ALL SELECT * FROM nbn_nights
),
ph_negation AS (
  SELECT PersonalID, MoveInDate AS neg_start, COALESCE(ExitDate, DATE_ADD(report_end, INTERVAL 1 DAY)) AS neg_end
  FROM entry_criteria
  WHERE ProjectType IN (3, 9, 10, 13) AND MoveInDate IS NOT NULL AND MoveInDate <= report_end
),
shelter_nights_flagged AS (
  SELECT sn.PersonalID, sn.ProjectType, sn.stay_date,
    EXISTS (SELECT 1 FROM ph_negation pn WHERE pn.PersonalID = sn.PersonalID AND sn.stay_date >= pn.neg_start AND sn.stay_date < pn.neg_end) AS negated_by_ph
  FROM shelter_nights sn
),
bounded_m AS (
  SELECT sn.PersonalID, sn.stay_date FROM shelter_nights_flagged sn CROSS JOIN bounds b
  WHERE sn.ProjectType IN (0, 1, 2, 8) AND NOT sn.negated_by_ph AND sn.stay_date <= b.report_end
),
client_end AS (
  SELECT PersonalID, MAX(stay_date) AS client_end_date
  FROM bounded_m CROSS JOIN bounds b
  WHERE stay_date >= b.report_start
  GROUP BY PersonalID
),
islands AS (
  SELECT PersonalID, MIN(stay_date) AS island_min, MAX(stay_date) AS island_max
  FROM (
    SELECT PersonalID, stay_date,
      DATE_SUB(stay_date, INTERVAL CAST(ROW_NUMBER() OVER (PARTITION BY PersonalID ORDER BY stay_date) AS INT64) DAY) AS grp
    FROM (
      SELECT DISTINCT bm.PersonalID, bm.stay_date
      FROM bounded_m bm
      JOIN client_end ce ON ce.PersonalID = bm.PersonalID
      WHERE bm.stay_date <= ce.client_end_date
    )
  )
  GROUP BY PersonalID, grp
),
client_window AS (
  SELECT ce.PersonalID, ce.client_end_date,
    DATE_SUB(ce.client_end_date, INTERVAL 365 DAY) AS client_start_raw,
    b.lookback_stop AS lookback_stop
  FROM client_end ce CROSS JOIN bounds b
),
client_window_extended AS (
  SELECT cw.PersonalID, cw.client_end_date,
    CASE WHEN isl.island_min IS NOT NULL THEN GREATEST(isl.island_min, cw.lookback_stop)
         ELSE GREATEST(cw.client_start_raw, cw.lookback_stop) END AS client_start_date
  FROM client_window cw
  LEFT JOIN islands isl ON isl.PersonalID = cw.PersonalID
    AND isl.island_min <= DATE_SUB(cw.client_start_raw, INTERVAL 1 DAY)
    AND isl.island_max >= DATE_SUB(cw.client_start_raw, INTERVAL 1 DAY)
),
client_lot AS (
  SELECT cw.PersonalID, COUNT(DISTINCT b.stay_date) AS length_of_time
  FROM client_window_extended cw
  JOIN bounded_m b ON b.PersonalID = cw.PersonalID AND b.stay_date >= cw.client_start_date AND b.stay_date <= cw.client_end_date
  GROUP BY cw.PersonalID
),

es_beds AS (
  SELECT SUM(i.BedInventory) AS n
  FROM balhmiscsv.Inventory i
  JOIN balhmiscsv.Project p ON i.ProjectID = p.ProjectID
  WHERE i.InventoryStartDate <= @report_end
    AND (i.InventoryEndDate IS NULL OR i.InventoryEndDate >= @report_end)
    AND p.ProjectType IN (0, 1)
)

SELECT
  (SELECT COUNT(DISTINCT PersonalID) FROM b1_remaining) AS th_exits_universe,
  (SELECT COUNT(DISTINCT PersonalID) FROM b1_remaining WHERE bucket = 'permanent') AS th_exits_permanent,
  (SELECT ROUND(AVG(length_of_time), 2) FROM client_lot) AS th_avg_lot,
  (SELECT n FROM es_beds) AS es_beds
