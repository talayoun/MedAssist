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
