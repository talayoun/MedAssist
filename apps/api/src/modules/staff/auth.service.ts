/**
 * Staff authentication service
 * Handles login, logout, and JWT session management
 */

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { query } from '../../db/db';
import { redisClient } from '../../db/redis';

export interface StaffJwtPayload {
  sub: string; // staff user id
  name: string;
  email: string;
  role: 'staff' | 'admin';
  departmentId: string | null;
  iat: number;
  exp: number;
}

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key';
const JWT_EXPIRY = 3600; // 1 hour in seconds

/**
 * Login: validate credentials and issue JWT
 */
export async function login(email: string, password: string) {
  // Find staff user by email
  const { rows } = await query<{
    id: string;
    name: string;
    email: string;
    password_hash: string;
    role: 'staff' | 'admin';
    department_id: string | null;
    locked_until: string | null;
    is_active: boolean;
  }>(
    'SELECT id, name, email, password_hash, role, department_id, locked_until, is_active FROM staff_users WHERE email = $1',
    [email]
  );

  if (rows.length === 0) {
    const err = new Error('Invalid email or password');
    (err as any).status = 401;
    throw err;
  }

  const user = rows[0];

  // Check if account is locked
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const err = new Error('Account is locked');
    (err as any).status = 423;
    (err as any).lockedUntil = user.locked_until;
    throw err;
  }

  // Check if active
  if (!user.is_active) {
    const err = new Error('Account is inactive');
    (err as any).status = 401;
    throw err;
  }

  // Verify password
  const passwordMatch = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatch) {
    const err = new Error('Invalid email or password');
    (err as any).status = 401;
    throw err;
  }

  // Update last_active_at
  await query('UPDATE staff_users SET last_active_at = NOW() WHERE id = $1', [user.id]);

  // Issue JWT
  const token = jwt.sign(
    {
      sub: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      departmentId: user.department_id,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      department_id: user.department_id,
    },
    token,
  };
}

/**
 * Logout: revoke JWT token
 */
export async function logout(token: string) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as StaffJwtPayload;
    const ttl = decoded.exp - Math.floor(Date.now() / 1000);
    if (ttl > 0) {
      await redisClient.setex(`revoked:${token}`, ttl, '1');
    }
  } catch (err) {
    // Token already expired or invalid — no need to revoke
  }
}

/**
 * Verify JWT token and check if revoked
 */
export async function verifyToken(token: string): Promise<StaffJwtPayload> {
  // Check if token is revoked
  const isRevoked = await redisClient.get(`revoked:${token}`);
  if (isRevoked) {
    const err = new Error('Token has been revoked');
    (err as any).status = 401;
    throw err;
  }

  // Verify JWT signature
  const payload = jwt.verify(token, JWT_SECRET) as StaffJwtPayload;
  return payload;
}

/**
 * Update last_active_at for session touch
 */
export async function touchSession(userId: string) {
  await query('UPDATE staff_users SET last_active_at = NOW() WHERE id = $1', [userId]);
}
