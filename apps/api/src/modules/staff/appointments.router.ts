import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireStaffAuth } from '../../middleware/auth';
import { createElectiveAppointment } from './appointments.service';

const router = Router();

const CategoryEnum = z.enum(['bring', 'fast', 'medication', 'other']);

const CustomItemSchema = z.object({
  text: z.string().min(1).max(200),
  category: CategoryEnum,
  time_sensitive: z.boolean(),
});

const CreateAppointmentSchema = z.object({
  patient_name: z.string().min(1).max(120),
  phone_number: z.string().regex(/^\+[1-9]\d{6,14}$/, 'must be E.164'),
  department_id: z.string().uuid(),
  procedure_type: z.string().min(1).max(80),
  visit_datetime: z.string().datetime(),
  custom_items: z.array(CustomItemSchema).max(50).default([]),
  suppressed_template_item_ids: z.array(z.string().uuid()).max(50).default([]),
  send_now: z.boolean().default(false),
});

/** POST /api/staff/appointments */
router.post('/appointments', requireStaffAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = CreateAppointmentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_request', issues: parsed.error.issues });
      return;
    }

    const result = await createElectiveAppointment(
      parsed.data,
      req.staffAuth!.departmentId ?? null
    );
    res.status(201).json(result);
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    if (e.status === 403) { res.status(403).json({ error: 'forbidden' }); return; }
    if (e.status === 404) { res.status(404).json({ error: 'not_found', message: e.message }); return; }
    if (e.status === 400) { res.status(400).json({ error: 'invalid_request', message: e.message }); return; }
    next(err);
  }
});

export default router;
