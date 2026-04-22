import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireStaffAuth, requireAdmin } from '../../middleware/auth';
import {
  listRoutes,
  getRoute,
  getRouteSteps,
  createRoute,
  updateRoute,
  deleteRoute,
  addStep,
  updateStep,
  deleteStep,
  reorderSteps,
  type NavigationRouteRow,
  type NavigationStepRow,
} from './navigation-routes.service';

const router = Router();
router.use(requireStaffAuth, requireAdmin);

const StepInputSchema = z.object({
  image_url: z.string().url(),
  instruction_text: z.string().min(1).max(200),
});

const CreateRouteSchema = z.object({
  name: z.string().min(1).max(80),
  from_department_id: z.string().uuid().nullable(),
  to_department_id: z.string().uuid(),
  is_default: z.boolean().default(false),
  steps: z.array(StepInputSchema).max(20).default([]),
});

const UpdateRouteSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  from_department_id: z.string().uuid().nullable().optional(),
  to_department_id: z.string().uuid().optional(),
  is_default: z.boolean().optional(),
  archived: z.boolean().optional(),
});

const UpdateStepSchema = z.object({
  image_url: z.string().url().optional(),
  instruction_text: z.string().min(1).max(200).optional(),
});

const ReorderStepsSchema = z.object({
  ordered_ids: z.array(z.string().uuid()).min(1).max(20),
});

function serializeRoute(row: NavigationRouteRow, steps?: NavigationStepRow[]) {
  return {
    route_id: row.id,
    name: row.name,
    from_department_id: row.from_department_id,
    to_department_id: row.to_department_id,
    is_default: row.is_default,
    archived: row.archived,
    steps_count: row.steps_count,
    ...(steps
      ? {
          steps: steps.map((s) => ({
            step_id: s.id,
            order: s.step_order,
            image_url: s.image_url,
            instruction: s.instruction_text,
          })),
        }
      : {}),
  };
}

function serializeStep(s: NavigationStepRow) {
  return {
    step_id: s.id,
    order: s.step_order,
    image_url: s.image_url,
    instruction: s.instruction_text,
  };
}

function isPgUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}

/** GET /api/admin/navigation-routes */
router.get('/navigation-routes', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const includeArchived = req.query.include_archived === 'true';
    const rows = await listRoutes(includeArchived);
    res.json({ routes: rows.map((r) => serializeRoute(r)) });
  } catch (err) { next(err); }
});

/** GET /api/admin/navigation-routes/:id */
router.get('/navigation-routes/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const row = await getRoute(String(req.params.id));
    if (!row) { res.status(404).json({ error: 'not_found' }); return; }
    const steps = await getRouteSteps(row.id);
    res.json(serializeRoute(row, steps));
  } catch (err) { next(err); }
});

/** POST /api/admin/navigation-routes */
router.post('/navigation-routes', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = CreateRouteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_request', issues: parsed.error.issues });
      return;
    }
    const row = await createRoute(parsed.data);
    const steps = await getRouteSteps(row.id);
    res.status(201).json(serializeRoute(row, steps));
  } catch (err) {
    if (isPgUniqueViolation(err)) {
      res.status(409).json({ error: 'duplicate_default_route' });
      return;
    }
    next(err);
  }
});

/** PUT /api/admin/navigation-routes/:id */
router.put('/navigation-routes/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = UpdateRouteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_request', issues: parsed.error.issues });
      return;
    }
    const row = await updateRoute(String(req.params.id), parsed.data);
    if (!row) { res.status(404).json({ error: 'not_found' }); return; }
    const steps = await getRouteSteps(row.id);
    res.json(serializeRoute(row, steps));
  } catch (err) {
    if (isPgUniqueViolation(err)) {
      res.status(409).json({ error: 'duplicate_default_route' });
      return;
    }
    next(err);
  }
});

/** DELETE /api/admin/navigation-routes/:id */
router.delete('/navigation-routes/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await deleteRoute(String(req.params.id));
    if (result.error === 'not_found') {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    if (result.error === 'route_in_active_use') {
      res.status(409).json({
        error: 'route_in_active_use',
        active_count: result.active_count,
        message: 'יש מטופלים פעילים המשתמשים במסלול זה. לא ניתן למחוק.',
      });
      return;
    }
    res.json({ deleted: result.deleted, archived: result.archived ?? false });
  } catch (err) { next(err); }
});

/** POST /api/admin/navigation-routes/:id/steps */
router.post('/navigation-routes/:id/steps', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = StepInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_request', issues: parsed.error.issues });
      return;
    }
    const step = await addStep(String(req.params.id), parsed.data);
    if (!step) { res.status(404).json({ error: 'route_not_found' }); return; }
    res.status(201).json(serializeStep(step));
  } catch (err) {
    const e = err as { status?: number; message?: string };
    if (e.status === 400 && e.message === 'too_many_steps') {
      res.status(400).json({ error: 'too_many_steps', message: 'Max 20 steps per route.' });
      return;
    }
    next(err);
  }
});

/** PUT /api/admin/navigation-routes/:id/steps/order */
router.put('/navigation-routes/:id/steps/order', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = ReorderStepsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_request', issues: parsed.error.issues });
      return;
    }
    const ok = await reorderSteps(String(req.params.id), parsed.data.ordered_ids);
    if (!ok) { res.status(404).json({ error: 'route_not_found' }); return; }
    res.json({ ok: true });
  } catch (err) {
    const e = err as { status?: number; message?: string };
    if (e.status === 400 && e.message === 'step_id_set_mismatch') {
      res.status(400).json({ error: 'step_id_set_mismatch' });
      return;
    }
    next(err);
  }
});

/** PUT /api/admin/navigation-routes/:id/steps/:step_id */
router.put('/navigation-routes/:id/steps/:step_id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = UpdateStepSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_request', issues: parsed.error.issues });
      return;
    }
    const step = await updateStep(String(req.params.id), String(req.params.step_id), parsed.data);
    if (!step) { res.status(404).json({ error: 'not_found' }); return; }
    res.json(serializeStep(step));
  } catch (err) { next(err); }
});

/** DELETE /api/admin/navigation-routes/:id/steps/:step_id */
router.delete('/navigation-routes/:id/steps/:step_id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const ok = await deleteStep(String(req.params.id), String(req.params.step_id));
    if (!ok) { res.status(404).json({ error: 'not_found' }); return; }
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

export default router;
