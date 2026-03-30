import { Router, Request, Response, NextFunction } from 'express';
import { requireMagicLinkToken } from '../../middleware/auth';
import { getNavigation, confirmStep } from './navigation.service';

const router = Router({ mergeParams: true });

/**
 * GET /api/visit/:token/navigation
 */
router.get('/', requireMagicLinkToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await getNavigation(req.magicLink!.appointmentId);
    res.json(result);
  } catch (err: unknown) {
    const e = err as { status?: number };
    if (e.status === 404) {
      res.status(404).json({ error: 'route_not_found' });
      return;
    }
    if (e.status === 409) {
      res.status(409).json({ error: 'already_arrived' });
      return;
    }
    next(err);
  }
});

/**
 * POST /api/visit/:token/navigation/steps/:step_id/confirm
 */
router.post(
  '/steps/:step_id/confirm',
  requireMagicLinkToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await confirmStep(req.magicLink!.appointmentId, req.params.step_id);
      res.json(result);
    } catch (err: unknown) {
      const e = err as { status?: number };
      if (e.status === 404) {
        res.status(404).json({ error: 'step_not_found' });
        return;
      }
      next(err);
    }
  }
);

export default router;
