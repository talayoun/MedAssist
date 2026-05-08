import { Router, Request, Response, NextFunction } from 'express';
import { requireStaffAuth } from '../../middleware/auth';
import { query } from '../../db/db';

const router = Router();

/** GET /api/staff/departments */
router.get('/departments', requireStaffAuth, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await query<{ id: string; name: string }>(
      'SELECT id, name FROM departments ORDER BY name ASC'
    );
    res.json({ departments: rows });
  } catch (err) { next(err); }
});

export default router;
