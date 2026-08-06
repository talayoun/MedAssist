-- Deduplicate departments by name: keep oldest row per name, reassign all FK
-- references across every table, then enforce uniqueness to prevent recurrence.
DO $$
DECLARE
  dup RECORD;
  canonical_id UUID;
  dup_ids UUID[];
BEGIN
  FOR dup IN (
    SELECT name FROM departments GROUP BY name HAVING COUNT(*) > 1
  ) LOOP
    SELECT id INTO canonical_id
      FROM departments WHERE name = dup.name ORDER BY created_at ASC LIMIT 1;

    SELECT array_agg(id) INTO dup_ids
      FROM departments WHERE name = dup.name AND id <> canonical_id;

    -- appointments
    UPDATE appointments SET department_id = canonical_id
      WHERE department_id = ANY(dup_ids);

    -- magic_link_timing_rules
    UPDATE magic_link_timing_rules SET department_id = canonical_id
      WHERE department_id = ANY(dup_ids);

    -- staff_users
    UPDATE staff_users SET department_id = canonical_id
      WHERE department_id = ANY(dup_ids);

    -- waiting_queue
    UPDATE waiting_queue SET department_id = canonical_id
      WHERE department_id = ANY(dup_ids);

    -- patient_stations
    UPDATE patient_stations SET department_id = canonical_id
      WHERE department_id = ANY(dup_ids);

    -- navigation_routes (from_department_id):
    -- delete dup route if canonical already has a conflicting default for same to_dept
    DELETE FROM navigation_routes r
      WHERE r.from_department_id = ANY(dup_ids)
        AND r.is_default = TRUE AND r.archived = FALSE
        AND EXISTS (
          SELECT 1 FROM navigation_routes r2
          WHERE r2.from_department_id = canonical_id
            AND r2.to_department_id = r.to_department_id
            AND r2.is_default = TRUE AND r2.archived = FALSE
        );
    UPDATE navigation_routes SET from_department_id = canonical_id
      WHERE from_department_id = ANY(dup_ids);

    -- navigation_routes (to_department_id):
    -- delete dup route if canonical already has a conflicting default for same from_dept
    DELETE FROM navigation_routes r
      WHERE r.to_department_id = ANY(dup_ids)
        AND r.is_default = TRUE AND r.archived = FALSE
        AND EXISTS (
          SELECT 1 FROM navigation_routes r2
          WHERE r2.to_department_id = canonical_id
            AND COALESCE(r2.from_department_id, '00000000-0000-0000-0000-000000000000'::uuid)
              = COALESCE(r.from_department_id, '00000000-0000-0000-0000-000000000000'::uuid)
            AND r2.is_default = TRUE AND r2.archived = FALSE
        );
    UPDATE navigation_routes SET to_department_id = canonical_id
      WHERE to_department_id = ANY(dup_ids);

    DELETE FROM departments WHERE id = ANY(dup_ids);
  END LOOP;
END;
$$;

ALTER TABLE departments ADD CONSTRAINT departments_name_unique UNIQUE (name);
