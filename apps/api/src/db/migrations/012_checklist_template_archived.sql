-- 012_checklist_template_archived.sql: soft-delete support for checklist templates

ALTER TABLE checklist_templates
  ADD COLUMN archived BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX idx_checklist_templates_not_archived
  ON checklist_templates (id)
  WHERE archived = FALSE;
