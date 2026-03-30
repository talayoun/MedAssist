-- 003_staff.sql: staff_users

CREATE TYPE staff_role AS ENUM ('staff', 'admin');

CREATE TABLE staff_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role staff_role NOT NULL DEFAULT 'staff',
  department_id UUID REFERENCES departments(id),
  locked_until TIMESTAMPTZ,
  last_active_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
