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
