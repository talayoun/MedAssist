import { Router, Request, Response, NextFunction } from 'express';
import { requireMagicLinkToken, denyCompanionWrite } from '../../middleware/auth';
import { getWaitingStatus, recordContactMessage } from './waiting.service';
import { z } from 'zod';

const router = Router({ mergeParams: true });

/**
 * GET /api/visit/:token/waiting
 * Polled every 60 seconds by patient app. Also serves companion tokens (read-only).
 */
router.get('/', requireMagicLinkToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = await getWaitingStatus(req.magicLink!.appointmentId);
    res.json(status);
  } catch (err) {
    next(err);
  }
});

const ContactSchema = z.object({
  message_type: z.enum(['need_help', 'confirm_here', 'question']),
});

/**
 * POST /api/visit/:token/waiting/contact
 * Blocked for companion tokens (denyCompanionWrite).
 */
router.post(
  '/contact',
  requireMagicLinkToken,
  denyCompanionWrite,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = ContactSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'invalid_request', errors: parsed.error.errors });
        return;
      }
      await recordContactMessage(req.magicLink!.appointmentId, parsed.data.message_type);
      res.json({ sent: true });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
