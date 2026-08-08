-- 99-alters.sql
-- Running reference log of every schema-changing command applied to the MedAssist
-- Postgres database (this project uses PostgreSQL, not MySQL -- see apps/api/src/db/db.ts
-- and every file below: gen_random_uuid(), CREATE TYPE ... AS ENUM, JSONB are Postgres-only).
--
-- This file is NOT an executable migration and is intentionally kept OUTSIDE
-- apps/api/src/db/migrations/ -- migrate.ts applies every .sql file in that folder in
-- filename order and records it in the _migrations table, so a file here would be
-- picked up and (mis)treated as a real migration if it lived alongside the real ones.
-- It exists purely as a single-file, chronological reference of the real schema history.
--
-- Source of truth is always apps/api/src/db/migrations/*.sql -- update this file
-- alongside every new migration added there. To rebuild a dev DB from scratch, run:
--   doppler run -- pnpm --filter api db:migrate
--   doppler run -- pnpm --filter api db:seed

-- ============================================================
-- migrations/001_core.sql
-- ============================================================
-- 001_core.sql: patients and departments

CREATE TABLE patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (name <> ''),
  phone_number TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL,
  name TEXT NOT NULL,
  navigation_route_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- migrations/002_appointments.sql
-- ============================================================
-- 002_appointments.sql: appointments, magic_links, magic_link_timing_rules

CREATE TYPE appointment_track AS ENUM ('elective', 'er');
CREATE TYPE appointment_status AS ENUM ('scheduled', 'active', 'completed', 'cancelled');

CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id),
  department_id UUID NOT NULL REFERENCES departments(id),
  procedure_type TEXT,
  track appointment_track NOT NULL,
  visit_datetime TIMESTAMPTZ,
  status appointment_status NOT NULL DEFAULT 'scheduled',
  magic_link_send_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TYPE magic_link_type AS ENUM ('patient', 'companion');

CREATE TABLE magic_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL REFERENCES appointments(id),
  token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  track appointment_track NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  link_type magic_link_type NOT NULL DEFAULT 'patient',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX magic_links_token_idx ON magic_links(token);

CREATE TABLE magic_link_timing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES departments(id),
  procedure_type TEXT,
  send_offset_hours INTEGER NOT NULL CHECK (send_offset_hours < 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (department_id, procedure_type)
);

-- ============================================================
-- migrations/003_staff.sql
-- ============================================================
-- 003_staff.sql: staff_users

CREATE TYPE staff_role AS ENUM ('staff', 'admin');

CREATE TABLE staff_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role staff_role NOT NULL DEFAULT 'staff',
  department_id UUID REFERENCES departments(id),
  locked_until TIMESTAMPTZ,
  last_active_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- migrations/004_checklists.sql
-- ============================================================
-- 004_checklists.sql: checklist_templates and checklist_progress

CREATE TABLE checklist_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  procedure_type TEXT NOT NULL,
  hospital_id UUID NOT NULL,
  items_json JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (procedure_type, hospital_id)
);

CREATE TABLE checklist_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id),
  appointment_id UUID NOT NULL REFERENCES appointments(id) UNIQUE,
  template_id UUID NOT NULL REFERENCES checklist_templates(id),
  completed_items_json JSONB NOT NULL DEFAULT '[]',
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- migrations/005_navigation.sql
-- ============================================================
-- 005_navigation.sql: navigation_routes and route_steps

CREATE TABLE navigation_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES departments(id),
  name TEXT NOT NULL,
  steps_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE departments
  ADD CONSTRAINT departments_navigation_route_fk
  FOREIGN KEY (navigation_route_id) REFERENCES navigation_routes(id);

CREATE TABLE route_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID NOT NULL REFERENCES navigation_routes(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  image_url TEXT NOT NULL,
  instruction_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (route_id, step_order)
);

-- ============================================================
-- migrations/006_waiting.sql
-- ============================================================
-- 006_waiting.sql: waiting_queue and patient_stations

CREATE TYPE waiting_status AS ENUM ('waiting', 'in_treatment', 'done');

CREATE TABLE waiting_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL REFERENCES appointments(id) UNIQUE,
  department_id UUID NOT NULL REFERENCES departments(id),
  arrival_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  estimated_wait_minutes INTEGER,
  status waiting_status NOT NULL DEFAULT 'waiting',
  broadcast_message TEXT,
  broadcast_sent_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TYPE station_status AS ENUM ('pending', 'complete');

CREATE TABLE patient_stations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL REFERENCES appointments(id),
  department_id UUID NOT NULL REFERENCES departments(id),
  order_index INTEGER NOT NULL,
  status station_status NOT NULL DEFAULT 'pending',
  completed_at TIMESTAMPTZ,
  completed_by_staff_id UUID REFERENCES staff_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- migrations/007_forms.sql
-- ============================================================
-- 007_forms.sql: digital_forms, companions, notifications

CREATE TABLE digital_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id),
  appointment_id UUID NOT NULL REFERENCES appointments(id),
  form_type TEXT NOT NULL,
  field_data_json JSONB NOT NULL DEFAULT '{}',
  captured_images_json JSONB NOT NULL DEFAULT '[]',
  signature_data TEXT,
  pdf_url TEXT,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE companions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL REFERENCES appointments(id),
  phone_number TEXT NOT NULL,
  magic_link_id UUID NOT NULL REFERENCES magic_links(id),
  consent_recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TYPE notification_type AS ENUM ('magic_link', 'checklist_reminder', 'station_update', 'broadcast');
CREATE TYPE notification_status AS ENUM ('sent', 'failed', 'retrying');

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id),
  appointment_id UUID NOT NULL REFERENCES appointments(id),
  type notification_type NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status notification_status NOT NULL DEFAULT 'retrying',
  retry_count INTEGER NOT NULL DEFAULT 0,
  triggering_event TEXT NOT NULL,
  provider_message_id TEXT
);

CREATE INDEX notifications_appointment_type_idx ON notifications(appointment_id, type);

-- ============================================================
-- migrations/008_nav_progress.sql
-- ============================================================
-- 008_nav_progress.sql: tracks per-appointment navigation step progress

CREATE TABLE nav_progress (
  appointment_id UUID PRIMARY KEY REFERENCES appointments(id),
  current_step INTEGER NOT NULL DEFAULT 1
);

-- ============================================================
-- migrations/009_appointment_phase.sql
-- ============================================================
-- 009_appointment_phase.sql: track patient's farthest-reached phase per appointment

CREATE TYPE appointment_phase AS ENUM (
  'link_sent',
  'checklist',
  'navigation',
  'waiting',
  'done'
);

ALTER TABLE appointments
  ADD COLUMN current_phase appointment_phase NOT NULL DEFAULT 'link_sent';

CREATE INDEX idx_appointments_current_phase ON appointments(current_phase);

-- ============================================================
-- migrations/010_appointment_phase_expired.sql
-- ============================================================
-- Add 'expired' terminal phase for appointments whose magic link TTL passed
-- before the patient ever opened it. Staff can resend the invite to restore
-- them back to 'link_sent'.
ALTER TYPE appointment_phase ADD VALUE IF NOT EXISTS 'expired';

-- ============================================================
-- migrations/011_checklist_per_appointment_overrides.sql
-- ============================================================
-- 011_checklist_per_appointment_overrides.sql
-- Per-appointment checklist customization: staff can add free-text items
-- and hide template items for a single patient without touching the template.

ALTER TABLE checklist_progress
  ADD COLUMN custom_items_json JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN suppressed_template_item_ids_json JSONB NOT NULL DEFAULT '[]';

-- ============================================================
-- migrations/012_checklist_template_archived.sql
-- ============================================================
-- 012_checklist_template_archived.sql: soft-delete support for checklist templates

ALTER TABLE checklist_templates
  ADD COLUMN archived BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX idx_checklist_templates_not_archived
  ON checklist_templates (id)
  WHERE archived = FALSE;

-- ============================================================
-- migrations/013_navigation_routes_multi.sql
-- ============================================================
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

-- ============================================================
-- migrations/014_soft_delete_appointments.sql
-- ============================================================
ALTER TABLE appointments
  ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;

-- ============================================================
-- migrations/015_digital_forms.sql
-- ============================================================
-- 015_digital_forms.sql
-- Parallel form system: template definitions, per-appointment snapshots,
-- patient-submitted documents, and PDF export records.

-- Admin-configured form template items (global or procedure-specific)
CREATE TABLE form_template_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  procedure_type TEXT,                          -- NULL = global default (all procedure types)
  label          TEXT NOT NULL,
  item_type      TEXT NOT NULL CHECK (item_type IN ('patient_upload', 'staff_upload_sign')),
  blank_form_url TEXT,                          -- S3 KEY of blank consent PDF (sign type only)
  required       BOOLEAN NOT NULL DEFAULT false,
  order_index    INTEGER NOT NULL DEFAULT 0,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Per-appointment snapshot (created at appointment creation time, immutable snapshot)
CREATE TABLE patient_form_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id        UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  form_template_item_id UUID REFERENCES form_template_items(id) ON DELETE SET NULL,
  label                 TEXT NOT NULL,
  item_type             TEXT NOT NULL CHECK (item_type IN ('patient_upload', 'staff_upload_sign')),
  staff_file_url        TEXT,                   -- S3 KEY of staff-uploaded consent PDF
  required              BOOLEAN NOT NULL DEFAULT false,
  order_index           INTEGER NOT NULL DEFAULT 0,
  status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'staff_uploaded', 'patient_submitted')),
  staff_id              UUID REFERENCES staff_users(id) ON DELETE SET NULL,
  department_id         UUID REFERENCES departments(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Patient-submitted documents and signatures
CREATE TABLE patient_documents (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id       UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  patient_form_item_id UUID NOT NULL REFERENCES patient_form_items(id) ON DELETE CASCADE,
  file_url             TEXT NOT NULL,           -- S3 KEY; presigned on read
  doc_type             TEXT NOT NULL CHECK (doc_type IN ('image_upload', 'signature')),
  uploaded_by_patient  BOOLEAN NOT NULL DEFAULT true,
  is_current           BOOLEAN NOT NULL DEFAULT true,
  submitted_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- PDF export snapshots generated by staff
CREATE TABLE patient_pdf_exports (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id        UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  pdf_key               TEXT NOT NULL,          -- S3 KEY; presigned on read (15min TTL)
  item_count            INTEGER NOT NULL,
  generated_by_staff_id UUID REFERENCES staff_users(id) ON DELETE SET NULL,
  generated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX ON patient_form_items (appointment_id);
CREATE INDEX ON patient_form_items (appointment_id, status);
CREATE INDEX ON patient_documents (patient_form_item_id);
CREATE INDEX ON patient_documents (appointment_id);
CREATE INDEX ON form_template_items (is_active, procedure_type);
CREATE INDEX ON patient_pdf_exports (appointment_id);

-- Only one current document per form item at a time
CREATE UNIQUE INDEX uniq_current_doc_per_item
  ON patient_documents (patient_form_item_id)
  WHERE is_current = true;

-- Prevent duplicate snapshots per template item per appointment
CREATE UNIQUE INDEX uniq_appt_template_item
  ON patient_form_items (appointment_id, form_template_item_id)
  WHERE form_template_item_id IS NOT NULL;

-- Auto-update updated_at on status changes
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER patient_form_items_updated_at
  BEFORE UPDATE ON patient_form_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- migrations/016_drop_legacy_digital_forms.sql
-- ============================================================
-- 016_drop_legacy_digital_forms.sql
-- Guarded drop of legacy digital_forms tables from migration 007.
-- Safe to run even if tables do not exist.
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'form_submissions') THEN
    DROP TABLE form_submissions CASCADE;
  END IF;
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'form_fields') THEN
    DROP TABLE form_fields CASCADE;
  END IF;
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'forms') THEN
    DROP TABLE forms CASCADE;
  END IF;
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'digital_forms') THEN
    DROP TABLE digital_forms CASCADE;
  END IF;
END;
$$;

-- ============================================================
-- migrations/017_departments_unique_name.sql
-- ============================================================
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

-- ============================================================
-- migrations/018_pdf_upload_doc_type.sql
-- ============================================================
-- Allow patient-uploaded PDFs alongside images and staff-signature PNGs
ALTER TABLE patient_documents DROP CONSTRAINT patient_documents_doc_type_check;
ALTER TABLE patient_documents ADD CONSTRAINT patient_documents_doc_type_check
  CHECK (doc_type IN ('image_upload', 'signature', 'pdf_upload'));

-- ============================================================
-- migrations/019_form_intake_fields.sql
-- ============================================================
-- 019_form_intake_fields.sql
-- Extend the digital-forms system (015_digital_forms.sql) to support the full
-- Figma intake form: sectioned layout, text-field / yes-no-list / consent item
-- types, and a values table for their patient-entered answers.
-- Constitution amended (v1.1) to permit this patient-supplied intake data.

ALTER TABLE form_template_items
  ADD COLUMN section TEXT NOT NULL DEFAULT 'documents'
    CHECK (section IN ('personal', 'medical', 'financial', 'documents', 'consent')),
  ADD COLUMN sub_label TEXT,
  ADD COLUMN placeholder TEXT,
  ADD COLUMN list_item_placeholder TEXT;

ALTER TABLE patient_form_items
  ADD COLUMN section TEXT NOT NULL DEFAULT 'documents'
    CHECK (section IN ('personal', 'medical', 'financial', 'documents', 'consent')),
  ADD COLUMN sub_label TEXT,
  ADD COLUMN placeholder TEXT,
  ADD COLUMN list_item_placeholder TEXT;

ALTER TABLE form_template_items DROP CONSTRAINT form_template_items_item_type_check;
ALTER TABLE form_template_items ADD CONSTRAINT form_template_items_item_type_check
  CHECK (item_type IN ('patient_upload', 'staff_upload_sign', 'text_field', 'yes_no_list', 'consent'));

ALTER TABLE patient_form_items DROP CONSTRAINT patient_form_items_item_type_check;
ALTER TABLE patient_form_items ADD CONSTRAINT patient_form_items_item_type_check
  CHECK (item_type IN ('patient_upload', 'staff_upload_sign', 'text_field', 'yes_no_list', 'consent'));

-- Patient-entered values for text_field / yes_no_list / consent items.
-- Value shapes: text_field -> {"text": "..."}; yes_no_list -> {"answer": bool, "items": ["..."]};
-- consent -> {"accepted": bool}.
CREATE TABLE patient_form_values (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id        UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  patient_form_item_id  UUID NOT NULL UNIQUE REFERENCES patient_form_items(id) ON DELETE CASCADE,
  value                 JSONB NOT NULL,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON patient_form_values (appointment_id);

CREATE TRIGGER patient_form_values_updated_at
  BEFORE UPDATE ON patient_form_values
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- migrations/020_department_arrival_info.sql
-- ============================================================
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

