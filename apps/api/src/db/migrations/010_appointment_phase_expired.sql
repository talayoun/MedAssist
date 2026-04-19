-- Add 'expired' terminal phase for appointments whose magic link TTL passed
-- before the patient ever opened it. Staff can resend the invite to restore
-- them back to 'link_sent'.
ALTER TYPE appointment_phase ADD VALUE IF NOT EXISTS 'expired';
