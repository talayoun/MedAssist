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
