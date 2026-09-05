import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { StaffAuthContext } from '@medassist/shared-types';
import { query } from '../db/db';
import { isTokenRevoked } from '../db/redis';

export interface StaffJwtPayload {
  sub: string;      // staff_user id
  jti: string;       // unique per login — see auth.service.ts login()
  name: string;
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

if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET env var is required');
const JWT_SECRET = process.env.JWT_SECRET;

// ─── Staff JWT auth ───────────────────────────────────────────────────────────

export function requireStaffAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.med_session as string | undefined;
  if (!token) {
    res.status(401).json({ error: 'not_authenticated' });
    return;
  }

  let payload: StaffJwtPayload;
  try {
    payload = jwt.verify(token, JWT_SECRET) as StaffJwtPayload;
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function requireMagicLinkToken(req: Request, res: Response, next: NextFunction): void {
  const token = req.params.token as string;
  if (!token) {
    res.status(400).json({ error: 'missing_token' });
    return;
  }
  if (!UUID_RE.test(token)) {
    res.status(401).json({ error: 'link_not_found' });
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
    current_phase: string;
    deleted_at: Date | null;
  }>(
    `SELECT ml.id AS ml_id, ml.appointment_id, a.patient_id, a.department_id,
            ml.link_type, ml.track, ml.expires_at, ml.used_at,
            a.current_phase, a.deleted_at
     FROM magic_links ml
     JOIN appointments a ON a.id = ml.appointment_id
     WHERE ml.token = $1`,
    [token]
  )
    .then(({ rows }) => {
      if (rows.length === 0) {
        res.status(401).json({ error: 'link_not_found' });
        return;
      }
      const row = rows[0];

      // Patient removed via the back-office (trash) — treat as if the link never existed
      if (row.deleted_at !== null) {
        res.status(401).json({ error: 'link_not_found' });
        return;
      }

      // Visit reached its terminal phase — link is no longer valid.
      // A page already open when the visit completes (e.g. mid-poll on Waiting)
      // must also stop working, not just the initial resolve — hence this check
      // lives here too, not only in magic-links.service.ts's resolveToken.
      if (row.current_phase === 'done') {
        res.status(409).json({
          error: 'link_used',
          message: 'הביקור הסתיים. אם אתה זקוק לגישה מחדש, פנה לצוות המחלקה.',
        });
        return;
      }

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

// ─── Caller scope ─────────────────────────────────────────────────────────────

/**
 * Narrows the JWT payload to the authorization context services take: staff are
 * confined to their own department, admins are unrestricted.
 *
 * Keyed on `role`, not on whether a department is present. Four copies of this
 * had grown across the routers and they disagreed on exactly that point — an
 * admin who was also assigned a department would have been silently demoted to
 * department-scoped by three of them. Role is the authority on privilege; a
 * department assignment is not a demotion. Unreachable today (no admin has a
 * department and there is no UI to give them one), settled here so it stays
 * that way.
 *
 * A 'staff' row with no department is a data error and gets the most
 * restrictive outcome available rather than silently becoming an admin.
 */
export function callerCtx(req: Request): StaffAuthContext {
  const { role, departmentId } = req.staffAuth!;
  if (role === 'admin') return { role: 'admin' };
  if (!departmentId) throw Object.assign(new Error('forbidden'), { status: 403 });
  return { role: 'staff', departmentId };
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
