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
