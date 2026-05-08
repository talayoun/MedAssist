/**
 * Staff authentication router
 * POST /auth/login - Login with email + password
 * POST /auth/logout - Logout (revoke JWT)
 * GET /auth/me - Get current user info
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { login, logout, verifyToken } from './auth.service';
import { requireStaffAuth } from '../../middleware/auth';

const router = Router();

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * POST /auth/login
 */
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_request', errors: parsed.error.errors });
      return;
    }

    const { user, token } = await login(parsed.data.email, parsed.data.password);

    // Set httpOnly cookie
    res.cookie('med_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 3600 * 1000, // 1 hour
    });

    res.json({ user });
  } catch (err: unknown) {
    const e = err as any;
    if (e.status === 401) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    if (e.status === 423) {
      res.status(423).json({
        error: 'account_locked',
        lockedUntil: e.lockedUntil,
      });
      return;
    }
    next(err);
  }
});

/**
 * POST /auth/logout
 */
router.post('/logout', requireStaffAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.cookies.med_session;
    if (token) {
      await logout(token);
    }
    res.clearCookie('med_session');
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /auth/me
 */
router.get('/me', requireStaffAuth, (req: Request, res: Response) => {
  res.json({
    user: {
      id: req.staffAuth!.sub,
      name: req.staffAuth!.name,
      email: req.staffAuth!.email,
      role: req.staffAuth!.role,
      department_id: req.staffAuth!.departmentId,
    },
  });
});

export default router;
