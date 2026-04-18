import { query } from '../../db/db';

export type AppointmentPhase =
  | 'link_sent'
  | 'checklist'
  | 'navigation'
  | 'waiting'
  | 'done'
  | 'expired';

// 'expired' is a terminal side-state, not part of the forward progression.
// It is set only by the expiry sweeper (from 'link_sent') and cleared only by
// the resend-invite action. advanceAppointmentPhase never transitions into or
// out of it.
const PHASE_RANK: Record<AppointmentPhase, number> = {
  link_sent: 0,
  checklist: 1,
  navigation: 2,
  waiting: 3,
  done: 4,
  expired: 99,
};

export function phaseRank(phase: AppointmentPhase): number {
  return PHASE_RANK[phase];
}

export type ForwardPhase = Exclude<AppointmentPhase, 'expired'>;

export async function advanceAppointmentPhase(
  appointmentId: string,
  target: ForwardPhase
): Promise<void> {
  await query(
    `UPDATE appointments
     SET current_phase = $1::appointment_phase, updated_at = NOW()
     WHERE id = $2
       AND $3::int > (
         CASE current_phase
           WHEN 'link_sent'  THEN 0
           WHEN 'checklist'  THEN 1
           WHEN 'navigation' THEN 2
           WHEN 'waiting'    THEN 3
           WHEN 'done'       THEN 4
         END
       )`,
    [target, appointmentId, PHASE_RANK[target]]
  );
}
