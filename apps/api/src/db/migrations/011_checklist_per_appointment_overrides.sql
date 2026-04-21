-- 011_checklist_per_appointment_overrides.sql
-- Per-appointment checklist customization: staff can add free-text items
-- and hide template items for a single patient without touching the template.

ALTER TABLE checklist_progress
  ADD COLUMN custom_items_json JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN suppressed_template_item_ids_json JSONB NOT NULL DEFAULT '[]';
