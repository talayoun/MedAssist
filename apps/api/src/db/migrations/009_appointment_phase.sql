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
