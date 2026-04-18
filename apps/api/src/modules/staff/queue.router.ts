import { Router, Request, Response, NextFunction } from 'express';
import { requireStaffAuth } from '../../middleware/auth';
import { z } from 'zod';
import {
  getQueue,
  updatePatientStatus,
  setWaitEstimate,
  broadcastMessage,
  resetArrivalToNow,
  QueuePhase,
} from './queue.service';
import { resendInviteForAppointment } from './resend-invite.service';

const router = Router();

const PHASE_VALUES: QueuePhase[] = ['link_sent', 'checklist', 'navigation', 'waiting', 'done', 'expired'];
const PhaseEnum = z.enum(PHASE_VALUES as [QueuePhase, ...QueuePhase[]]);

/** GET /api/staff/queue */
router.get('/queue', requireStaffAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const staffDeptId = req.staffAuth!.departmentId;
    const requestedDeptId = typeof req.query.department_id === 'string'
      ? req.query.department_id
      : null;
    const requestedPhase = typeof req.query.phase === 'string' ? req.query.phase : null;

    let departmentId: string | null;
    if (staffDeptId) {
      departmentId = staffDeptId;
    } else {
      departmentId = requestedDeptId;
    }

    let phase: QueuePhase | null = null;
    if (requestedPhase) {
      const parsed = PhaseEnum.safeParse(requestedPhase);
      if (!parsed.success) { res.status(400).json({ error: 'invalid_phase' }); return; }
      phase = parsed.data;
    }

    const result = await getQueue({ departmentId, phase });
    res.json(result);
  } catch (err) { next(err); }
});

const StatusSchema = z.object({ status: z.enum(['waiting', 'in_treatment', 'done']) });

/** PATCH /api/staff/queue/:appointment_id/status */
router.patch('/queue/:appointment_id/status', requireStaffAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = StatusSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'invalid_request' }); return; }
    const result = await updatePatientStatus(
      req.params.appointment_id as string,
      parsed.data.status,
      req.staffAuth!.departmentId ?? null
    );
    res.json(result);
  } catch (err: unknown) {
    const e = err as { status?: number };
    if (e.status === 404) { res.status(404).json({ error: 'not_found' }); return; }
    next(err);
  }
});

/** POST /api/staff/queue/:appointment_id/reset-arrival */
router.post('/queue/:appointment_id/reset-arrival', requireStaffAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await resetArrivalToNow(
      req.params.appointment_id as string,
      req.staffAuth!.departmentId ?? null
    );
    res.json(result);
  } catch (err: unknown) {
    const e = err as { status?: number };
    if (e.status === 404) { res.status(404).json({ error: 'not_found' }); return; }
    next(err);
  }
});

const EstimateSchema = z.object({ estimated_wait_minutes: z.number().int().positive() });

/** PATCH /api/staff/queue/wait-estimate */
router.patch('/queue/wait-estimate', requireStaffAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = EstimateSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'invalid_request' }); return; }
    const targetDept = req.staffAuth!.departmentId
      ?? (typeof req.body.department_id === 'string' ? req.body.department_id : null);
    if (!targetDept) { res.status(400).json({ error: 'department_required' }); return; }
    await setWaitEstimate(targetDept, parsed.data.estimated_wait_minutes);
    res.json({ updated: true });
  } catch (err) { next(err); }
});

const BroadcastSchema = z.object({ message: z.string().min(1).max(280) });

/** POST /api/staff/queue/broadcast */
router.post('/queue/broadcast', requireStaffAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = BroadcastSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'invalid_request' }); return; }
    const targetDept = req.staffAuth!.departmentId
      ?? (typeof req.body.department_id === 'string' ? req.body.department_id : null);
    if (!targetDept) { res.status(400).json({ error: 'department_required' }); return; }
    const result = await broadcastMessage(targetDept, parsed.data.message);
    res.json(result);
  } catch (err) { next(err); }
});

/** POST /api/staff/queue/:appointment_id/resend-invite */
router.post('/queue/:appointment_id/resend-invite', requireStaffAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await resendInviteForAppointment(
      req.params.appointment_id as string,
      req.staffAuth!.departmentId ?? null
    );
    res.status(200).json(result);
  } catch (err: unknown) {
    const e = err as { status?: number };
    if (e.status === 404) { res.status(404).json({ error: 'not_found' }); return; }
    if (e.status === 403) { res.status(403).json({ error: 'forbidden' }); return; }
    if (e.status === 409) { res.status(409).json({ error: 'invalid_phase', message: (e as any).message }); return; }
    next(err);
  }
});

export default router;
