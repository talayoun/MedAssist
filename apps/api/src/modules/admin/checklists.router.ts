import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireStaffAuth, requireAdmin } from '../../middleware/auth';
import {
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} from './checklists.service';

const router = Router();

// All admin routes require staff auth + admin role
router.use(requireStaffAuth, requireAdmin);

const ItemSchema = z.object({
  id: z.string().uuid().optional(),
  text: z.string().min(1).max(200),
  category: z.enum(['bring', 'fast', 'medication', 'other']),
  time_sensitive: z.boolean(),
});

const CreateSchema = z.object({
  procedure_type: z.string().min(1).max(80),
  items: z.array(ItemSchema).max(100).default([]),
});

const UpdateSchema = z.object({
  procedure_type: z.string().min(1).max(80).optional(),
  items: z.array(ItemSchema).max(100).optional(),
});

/** GET /api/admin/checklists */
router.get('/checklists', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const includeArchived = req.query.include_archived === 'true';
    const rows = await listTemplates(includeArchived);
    const templates = rows.map((r) => ({
      template_id: r.id,
      procedure_type: r.procedure_type,
      item_count: Array.isArray(r.items_json) ? r.items_json.length : 0,
      archived: r.archived,
    }));
    res.json({ templates });
  } catch (err) { next(err); }
});

/** GET /api/admin/checklists/:id */
router.get('/checklists/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const row = await getTemplate(String(req.params.id));
    if (!row) { res.status(404).json({ error: 'not_found' }); return; }
    res.json({
      template_id: row.id,
      procedure_type: row.procedure_type,
      item_count: Array.isArray(row.items_json) ? row.items_json.length : 0,
      archived: row.archived,
      items: row.items_json,
    });
  } catch (err) { next(err); }
});

/** POST /api/admin/checklists */
router.post('/checklists', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = CreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_request', issues: parsed.error.issues });
      return;
    }
    const row = await createTemplate(parsed.data);
    res.status(201).json({
      template_id: row.id,
      procedure_type: row.procedure_type,
      item_count: Array.isArray(row.items_json) ? row.items_json.length : 0,
      archived: row.archived,
      items: row.items_json,
    });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === '23505') {
      res.status(409).json({ error: 'duplicate_procedure_type' });
      return;
    }
    next(err);
  }
});

/** PUT /api/admin/checklists/:id */
router.put('/checklists/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = UpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_request', issues: parsed.error.issues });
      return;
    }
    const row = await updateTemplate(String(req.params.id), parsed.data);
    if (!row) { res.status(404).json({ error: 'not_found' }); return; }
    res.json({
      template_id: row.id,
      procedure_type: row.procedure_type,
      item_count: Array.isArray(row.items_json) ? row.items_json.length : 0,
      archived: row.archived,
      items: row.items_json,
    });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === '23505') {
      res.status(409).json({ error: 'duplicate_procedure_type' });
      return;
    }
    next(err);
  }
});

/** DELETE /api/admin/checklists/:id */
router.delete('/checklists/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await deleteTemplate(String(req.params.id));
    if (result.error === 'not_found') {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    if (result.error === 'template_in_active_use') {
      res.status(409).json({
        error: 'template_in_active_use',
        active_count: result.active_count,
        message: 'יש מטופלים פעילים המשתמשים בתבנית זו. לא ניתן למחוק.',
      });
      return;
    }
    // archived or hard-deleted
    res.json({ deleted: result.deleted, archived: result.archived ?? false });
  } catch (err) { next(err); }
});

export default router;
