-- 020_department_arrival_info.sql
-- Clinic-arrival info (address / parking / transit / map coordinates) per
-- department, matching the Figma design's two-phase navigation flow
-- (get-to-the-hospital, then indoor step-by-step).

ALTER TABLE departments
  ADD COLUMN address TEXT,
  ADD COLUMN parking_info TEXT,
  ADD COLUMN transit_info TEXT,
  ADD COLUMN map_lat NUMERIC,
  ADD COLUMN map_lng NUMERIC;
