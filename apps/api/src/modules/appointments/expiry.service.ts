import { query } from '../../db/db';

/**
 * Mark appointments as 'expired' when their newest magic link has passed its
 * expires_at without ever being opened. Called opportunistically from the
 * staff queue load path so the board self-cleans without a separate cron.
 *
 * Returns the number of rows transitioned.
 */
export async function expireStaleLinkSentAppointments(): Promise<number> {
  const { rowCount } = await query(`
    UPDATE appointments a
    SET current_phase = 'expired', updated_at = NOW()
    WHERE a.current_phase = 'link_sent'
      AND NOT EXISTS (
        SELECT 1 FROM magic_links ml
        WHERE ml.appointment_id = a.id
          AND (ml.used_at IS NOT NULL OR ml.expires_at > NOW())
      )
      AND EXISTS (
        SELECT 1 FROM magic_links ml
        WHERE ml.appointment_id = a.id
      )
  `);
  return rowCount ?? 0;
}
