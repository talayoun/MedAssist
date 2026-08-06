import { Router, Request, Response, NextFunction } from 'express';
import { requireStaffAuth, requireAdmin } from '../../middleware/auth';
import {
  listTrash,
  softDeleteAppointment,
  restoreAppointment,
  hardDeleteAppointment,
  bulkSoftDeleteByDepartment,
} from './trash.service';

const router = Router();

router.use(requireStaffAuth, requireAdmin);

/** GET /api/admin/trash */
router.get('/trash', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const entries = await listTrash();
    res.json({ trash: entries });
  } catch (err) { next(err); }
});

/** DELETE /api/admin/appointments/:id  — soft delete */
router.delete('/appointments/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await softDeleteAppointment(String(req.params.id));
    res.json(result);
  } catch (err: unknown) {
    const e = err as { status?: number };
    if (e.status === 404) { res.status(404).json({ error: 'not_found' }); return; }
    next(err);
  }
});

/** POST /api/admin/trash/:id/restore */
router.post('/trash/:id/restore', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await restoreAppointment(String(req.params.id));
    res.json(result);
  } catch (err: unknown) {
    const e = err as { status?: number };
    if (e.status === 404) { res.status(404).json({ error: 'not_found' }); return; }
    next(err);
  }
});

/** DELETE /api/admin/trash/:id  — hard delete */
router.delete('/trash/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await hardDeleteAppointment(String(req.params.id));
    res.json(result);
  } catch (err: unknown) {
    const e = err as { status?: number };
    if (e.status === 404) { res.status(404).json({ error: 'not_found' }); return; }
    next(err);
  }
});

/** POST /api/admin/trash/bulk-clear */
router.post('/trash/bulk-clear', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { department_id } = req.body as { department_id?: unknown };
    if (!department_id || typeof department_id !== 'string') {
      res.status(400).json({ error: 'missing_department_id' }); return;
    }
    const result = await bulkSoftDeleteByDepartment(department_id);
    res.json(result);
  } catch (err) { next(err); }
});

export default router;
