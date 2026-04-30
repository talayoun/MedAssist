import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireStaffAuth } from '../../middleware/auth';
import { createElectiveAppointment } from './appointments.service';
import { generateToken } from '../magic-links/magic-links.service';
import { query } from '../../db/db';

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

/** GET /api/staff/appointments */
router.get('/appointments', requireStaffAuth, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await query(
      `SELECT a.id, a.status, a.procedure_type, a.visit_datetime,
              p.name AS patient_name, d.name AS department_name,
              a.created_at
       FROM appointments a
       JOIN patients p ON p.id = a.patient_id
       JOIN departments d ON d.id = a.department_id
       ORDER BY a.visit_datetime DESC NULLS LAST
       LIMIT 100`,
    );
    res.json({ appointments: rows });
  } catch (err) { next(err); }
});

/** GET /api/staff/appointments/:id */
router.get('/appointments/:id', requireStaffAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await query(
      `SELECT a.id, a.status, a.procedure_type, a.visit_datetime,
              p.name AS patient_name, d.name AS department_name,
              ml.token AS magic_link_token
       FROM appointments a
       JOIN patients p ON p.id = a.patient_id
       JOIN departments d ON d.id = a.department_id
       LEFT JOIN magic_links ml
         ON ml.appointment_id = a.id
         AND ml.expires_at > NOW()
         AND ml.link_type = 'patient'
       WHERE a.id = $1
       ORDER BY ml.expires_at DESC NULLS LAST
       LIMIT 1`,
      [req.params.id],
    );
    if (!rows[0]) { res.status(404).json({ error: 'not_found' }); return; }
    res.json(rows[0]);
  } catch (err) { next(err); }
});

/** POST /api/staff/appointments/:id/magic-link — generate a fresh token */
router.post('/appointments/:id/magic-link', requireStaffAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await query(
      `SELECT a.id, a.status FROM appointments a WHERE a.id = $1`,
      [req.params.id],
    );
    if (!rows[0]) { res.status(404).json({ error: 'not_found' }); return; }
    const token = await generateToken(req.params.id as string, 'elective', 72);
    res.status(201).json({ token });
  } catch (err) { next(err); }
});

export default router;
