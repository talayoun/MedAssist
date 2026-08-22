-- Protected system entities: rows an admin must never be able to delete.
-- Enforced server-side in the DELETE handlers; the UI checkbox-disable is cosmetic.
ALTER TABLE checklist_templates ADD COLUMN IF NOT EXISTS is_protected BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE navigation_routes   ADD COLUMN IF NOT EXISTS is_protected BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE form_template_items ADD COLUMN IF NOT EXISTS is_protected BOOLEAN NOT NULL DEFAULT FALSE;
