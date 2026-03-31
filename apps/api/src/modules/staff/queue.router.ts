import { Router, Request, Response, NextFunction } from 'express';
import { requireStaffAuth } from '../../middleware/auth';
import { z } from 'zod';
import {
  getQueue,
  updatePatientStatus,
  setWaitEstimate,
  broadcastMessage,
} from './queue.service';

const router = Router();

/** GET /api/staff/queue */
router.get('/queue', requireStaffAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const departmentId = req.staffAuth!.departmentId;
    if (!departmentId) {
      res.status(400).json({ error: 'no_department', message: 'Admin must specify department_id' });
      return;
    }
    const result = await getQueue(departmentId);
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
      req.staffAuth!.departmentId!,
      parsed.data.status
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
    await setWaitEstimate(req.staffAuth!.departmentId!, parsed.data.estimated_wait_minutes);
    res.json({ updated: true });
  } catch (err) { next(err); }
});

const BroadcastSchema = z.object({ message: z.string().min(1).max(280) });

/** POST /api/staff/queue/broadcast */
router.post('/queue/broadcast', requireStaffAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = BroadcastSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'invalid_request' }); return; }
    const result = await broadcastMessage(req.staffAuth!.departmentId!, parsed.data.message);
    res.json(result);
  } catch (err) { next(err); }
});

export default router;
