import { Router, Request, Response, NextFunction } from 'express';
import { requireStaffAuth } from '../../middleware/auth';
import { z } from 'zod';
import { addStation, reorderStations, markStationComplete } from './stations.service';

const router = Router();

const AddStationSchema = z.object({
  department_id: z.string().uuid(),
  order_index: z.number().int().positive(),
});

/** POST /api/staff/patients/:appointment_id/stations */
router.post('/patients/:appointment_id/stations', requireStaffAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = AddStationSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'invalid_request' }); return; }
    const result = await addStation(req.params.appointment_id, parsed.data.department_id, parsed.data.order_index);
    res.status(201).json(result);
  } catch (err) { next(err); }
});

const ReorderSchema = z.object({ station_ids: z.array(z.string().uuid()).min(1) });

/** PUT /api/staff/patients/:appointment_id/stations/order */
router.put('/patients/:appointment_id/stations/order', requireStaffAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = ReorderSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'invalid_request' }); return; }
    await reorderStations(req.params.appointment_id, parsed.data.station_ids);
    res.json({ updated: true });
  } catch (err) { next(err); }
});

const CompleteSchema = z.object({ status: z.literal('complete') });

/** PATCH /api/staff/patients/:appointment_id/stations/:station_id */
router.patch('/patients/:appointment_id/stations/:station_id', requireStaffAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = CompleteSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: 'invalid_request' }); return; }
    const result = await markStationComplete(
      req.params.appointment_id,
      req.params.station_id,
      req.staffAuth!.sub
    );
    res.json(result);
  } catch (err: unknown) {
    const e = err as { status?: number };
    if (e.status === 404) { res.status(404).json({ error: 'not_found' }); return; }
    next(err);
  }
});

export default router;
