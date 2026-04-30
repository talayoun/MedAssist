-- 016_drop_legacy_digital_forms.sql
-- Guarded drop of legacy digital_forms tables from migration 007.
-- Safe to run even if tables do not exist.
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'form_submissions') THEN
    DROP TABLE form_submissions CASCADE;
  END IF;
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'form_fields') THEN
    DROP TABLE form_fields CASCADE;
  END IF;
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'forms') THEN
    DROP TABLE forms CASCADE;
  END IF;
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'digital_forms') THEN
    DROP TABLE digital_forms CASCADE;
  END IF;
END;
$$;
