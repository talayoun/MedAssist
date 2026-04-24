-- 013_navigation_routes_multi.sql
-- 1:many navigation routes per department with future-proof from/to schema.
-- Replaces 1:1 departments.navigation_route_id with route.to_department_id
-- plus a nullable route.from_department_id (NULL = main entrance / reception).
-- Adds per-appointment override and soft-delete flag mirroring checklist templates.

-- 1. Expand navigation_routes with from/to/default/archived columns.
ALTER TABLE navigation_routes
  ADD COLUMN from_department_id UUID REFERENCES departments(id),
  ADD COLUMN to_department_id UUID REFERENCES departments(id),
  ADD COLUMN is_default BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN archived BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Backfill existing rows: each route becomes the default (NULL -> its original dept).
UPDATE navigation_routes
  SET to_department_id = department_id,
      from_department_id = NULL,
      is_default = TRUE
  WHERE to_department_id IS NULL;

-- 3. Lock to_department_id as required.
ALTER TABLE navigation_routes
  ALTER COLUMN to_department_id SET NOT NULL;

-- 4. Drop the old 1:1 FK from departments, then the now-redundant route.department_id.
ALTER TABLE departments
  DROP CONSTRAINT IF EXISTS departments_navigation_route_fk;
ALTER TABLE departments
  DROP COLUMN IF EXISTS navigation_route_id;
ALTER TABLE navigation_routes
  DROP COLUMN department_id;

-- 5. Per-appointment route override (mirrors checklist_template_id override pattern).
ALTER TABLE appointments
  ADD COLUMN navigation_route_id UUID REFERENCES navigation_routes(id);

-- 6. At most one default per (from, to) pair among non-archived routes.
-- COALESCE handles NULL from_department_id (= main entrance) as a distinct value.
CREATE UNIQUE INDEX idx_navigation_routes_unique_default
  ON navigation_routes (
    COALESCE(from_department_id, '00000000-0000-0000-0000-000000000000'::uuid),
    to_department_id
  )
  WHERE is_default = TRUE AND archived = FALSE;

-- 7. Lookup index for the common patient-side query (resolve route by destination).
CREATE INDEX idx_navigation_routes_to_dept
  ON navigation_routes (to_department_id)
  WHERE archived = FALSE;
