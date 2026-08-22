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
