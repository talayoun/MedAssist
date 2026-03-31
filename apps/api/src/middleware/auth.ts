import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../db/db';
import { isTokenRevoked } from '../db/redis';

export interface StaffJwtPayload {
  sub: string;      // staff_user id
  role: 'staff' | 'admin';
  departmentId: string | null;
  email: string;
  iat: number;
  exp: number;
}

export interface MagicLinkContext {
  token: string;
  appointmentId: string;
  patientId: string;
  departmentId: string;
  linkType: 'patient' | 'companion';
  track: 'elective' | 'er';
}

// Extend Express Request with auth context
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      staffAuth?: StaffJwtPayload;
      magicLink?: MagicLinkContext;
    }
  }
}

// ─── Staff JWT auth ───────────────────────────────────────────────────────────

export function requireStaffAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.med_session as string | undefined;
  if (!token) {
    res.status(401).json({ error: 'not_authenticated' });
    return;
  }

  let payload: StaffJwtPayload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET!) as StaffJwtPayload;
  } catch {
    res.status(401).json({ error: 'invalid_session' });
    return;
  }

  isTokenRevoked(token)
    .then((revoked) => {
      if (revoked) {
        res.status(401).json({ error: 'session_expired' });
        return;
      }

      // Touch last_active_at (fire-and-forget — don't block the request)
      query(
        'UPDATE staff_users SET last_active_at = NOW() WHERE id = $1',
        [payload.sub]
      ).catch((err) => console.error('Failed to update last_active_at:', err));

      req.staffAuth = payload;
      next();
    })
    .catch(next);
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.staffAuth) {
    res.status(401).json({ error: 'not_authenticated' });
    return;
  }
  if (req.staffAuth.role !== 'admin') {
    res.status(403).json({ error: 'insufficient_role' });
    return;
  }
  next();
}

// ─── Magic Link token auth ────────────────────────────────────────────────────

export function requireMagicLinkToken(req: Request, res: Response, next: NextFunction): void {
  const token = req.params.token as string;
  if (!token) {
    res.status(400).json({ error: 'missing_token' });
    return;
  }

  query<{
    ml_id: string;
    appointment_id: string;
    patient_id: string;
    department_id: string;
    link_type: 'patient' | 'companion';
    track: 'elective' | 'er';
    expires_at: Date;
    used_at: Date | null;
  }>(
    `SELECT ml.id AS ml_id, ml.appointment_id, a.patient_id, a.department_id,
            ml.link_type, ml.track, ml.expires_at, ml.used_at
     FROM magic_links ml
     JOIN appointments a ON a.id = ml.appointment_id
     WHERE ml.token = $1`,
    [token]
  )
    .then(({ rows }) => {
      if (rows.length === 0) {
        res.status(404).json({ error: 'link_not_found' });
        return;
      }
      const row = rows[0];

      if (new Date(row.expires_at) <= new Date()) {
        res.status(410).json({
          error: 'link_expired',
          message: 'הקישור פג תוקף. פנה לצוות לקבלת קישור חדש.',
        });
        return;
      }

      req.magicLink = {
        token,
        appointmentId: row.appointment_id,
        patientId: row.patient_id,
        departmentId: row.department_id,
        linkType: row.link_type,
        track: row.track,
      };
      next();
    })
    .catch(next);
}

// ─── Companion read-only guard ────────────────────────────────────────────────

export function denyCompanionWrite(req: Request, res: Response, next: NextFunction): void {
  if (req.magicLink?.linkType === 'companion') {
    res.status(403).json({
      error: 'forbidden',
      message: 'פעולה זו אינה זמינה עבור מלווה.',
    });
    return;
  }
  next();
}
