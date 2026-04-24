import { Router, Request, Response, NextFunction } from 'express';
import { requireMagicLinkToken } from '../../middleware/auth';
import { getChecklist, saveProgress } from './checklist.service';
import { query } from '../../db/db';
import { z } from 'zod';

const router = Router({ mergeParams: true });

/**
 * GET /api/visit/:token/checklist
 */
router.get('/', requireMagicLinkToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { appointmentId } = req.magicLink!;
    const checklist = await getChecklist(appointmentId);
    res.json(checklist);
  } catch (err: unknown) {
    const e = err as { status?: number };
    if (e.status === 404) {
      res.status(404).json({ error: 'checklist_not_found' });
      return;
    }
    next(err);
  }
});

const ProgressSchema = z.object({
  completed_item_ids: z.array(z.string().uuid()),
});

/**
 * POST /api/visit/:token/checklist/progress
 */
router.post('/progress', requireMagicLinkToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = ProgressSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_request', errors: parsed.error.errors });
      return;
    }

    const { appointmentId, patientId } = req.magicLink!;

    // Get template id for this appointment
    const { rows: [appt] } = await query<{ procedure_type: string }>(
      'SELECT procedure_type FROM appointments WHERE id = $1',
      [appointmentId]
    );
    const { rows: [template] } = await query<{ id: string }>(
      'SELECT id FROM checklist_templates WHERE procedure_type = $1 LIMIT 1',
      [appt.procedure_type]
    );

    const result = await saveProgress(
      appointmentId,
      patientId,
      template.id,
      parsed.data.completed_item_ids
    );

    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
