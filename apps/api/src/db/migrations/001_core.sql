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
