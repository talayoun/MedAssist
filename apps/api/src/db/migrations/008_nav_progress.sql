-- 008_nav_progress.sql: tracks per-appointment navigation step progress

CREATE TABLE nav_progress (
  appointment_id UUID PRIMARY KEY REFERENCES appointments(id),
  current_step INTEGER NOT NULL DEFAULT 1
);
