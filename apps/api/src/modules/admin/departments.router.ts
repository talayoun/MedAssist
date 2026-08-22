import { Router } from 'express';
import { z } from 'zod';
import { requireStaffAuth, requireAdmin } from '../../middleware/auth';
import { query } from '../../db/db';

const UpdateArrivalSchema = z.object({
  address: z.string().max(300).nullable().optional(),
  parking_info: z.string().max(300).nullable().optional(),
  transit_info: z.string().max(300).nullable().optional(),
  map_lat: z.number().nullable().optional(),
  map_lng: z.number().nullable().optional(),
});

const router = Router();
// Both, explicitly: requireAdmin does reject an unauthenticated request on its
// own today, but leaving the auth step implicit made this router's safety depend
// on where it happens to be mounted in app.ts. Matches the other admin routers.
router.use(requireStaffAuth, requireAdmin);

/** GET /api/admin/departments — full rows including arrival info, for the admin editor */
router.get('/departments', async (_req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, name, address, parking_info, transit_info, map_lat::float8 AS map_lat, map_lng::float8 AS map_lng
       FROM departments ORDER BY name ASC`
    );
    res.json({ departments: rows });
  } catch (err) { next(err); }
});

/** PATCH /api/admin/departments/:id — set clinic-arrival info (address/parking/transit/coordinates) */
router.patch('/departments/:id', async (req, res, next) => {
  try {
    const parsed = UpdateArrivalSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_request', issues: parsed.error.issues });
      return;
    }
    const fields: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    for (const [key, val] of Object.entries(parsed.data)) {
      if (val !== undefined) { fields.push(`${key} = $${i++}`); values.push(val); }
    }
    if (fields.length === 0) {
      res.status(400).json({ error: 'no_fields' });
      return;
    }
    values.push(req.params.id);
    const { rows } = await query(
      `UPDATE departments SET ${fields.join(', ')} WHERE id = $${i}
       RETURNING id, name, address, parking_info, transit_info, map_lat::float8 AS map_lat, map_lng::float8 AS map_lng`,
      values,
    );
    if (!rows[0]) { res.status(404).json({ error: 'not_found' }); return; }
    res.json(rows[0]);
  } catch (err) { next(err); }
});

export default router;
