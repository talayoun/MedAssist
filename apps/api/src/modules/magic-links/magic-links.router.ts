import { Router, Request, Response, NextFunction } from 'express';
import { resolveToken } from './magic-links.service';

const router = Router();

/**
 * GET /api/visit/:token
 * Resolve a Magic Link token and return the patient's visit context.
 */
router.get('/:token', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const context = await resolveToken(req.params.token as string);
    res.json(context);
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; name?: string };
    if (e.status === 404) {
      res.status(404).json({ error: 'link_not_found' });
      return;
    }
    if (e.status === 409) {
      res.status(409).json({ error: 'link_used', message: e.message });
      return;
    }
    if (e.status === 410) {
      res.status(410).json({ error: 'link_expired', message: e.message });
      return;
    }
    next(err);
  }
});

export default router;
