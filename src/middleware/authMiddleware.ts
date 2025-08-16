import { Request, Response, NextFunction, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';

export type UserRole = 'admin' | 'candidate' | 'employer';
export type AccountStatus = 'pending' | 'active' | 'suspended';

export interface AuthPayload {
  sub: number;
  email: string;
  role: UserRole;
  account_status: AccountStatus;
}

export interface AuthRequest extends Request {
  user?: AuthPayload;
}

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
const IS_PROD = process.env.NODE_ENV === 'production';

// Build a case-insensitive allowlist once (private beta guard)
const ALLOWED_EMAILS = new Set(
  (process.env.ALLOWED_EMAILS || 'vasu.kochhar@gmail.com,shanas.nakade@strot.net')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
);

export const authMiddleware: RequestHandler = (req: AuthRequest, res: Response, next: NextFunction) => {
  const headerAuth = req.headers.authorization;
  if (!headerAuth?.startsWith('Bearer ')) {
    return res.status(401).json({ code: 'missing_token', message: 'Missing Authorization header' });
  }

  const token = headerAuth.slice(7).trim();
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;

    const payload: AuthPayload = {
      sub: decoded.sub ? Number(decoded.sub) : 0,
      email: String(decoded.email || '').toLowerCase(),
      role: decoded.role as UserRole,
      account_status: (decoded.account_status as AccountStatus) || 'pending',
    };

    req.user = payload;
    return next();
  } catch {
    return res.status(401).json({ code: 'invalid_token', message: 'Invalid or expired token' });
  }
};

/**
 * adminOnly — defense-in-depth gate for /api/admin/*
 * Requires:
 *   - role = 'admin'
 *   - account_status = 'active'
 *   - email present in ALLOWED_EMAILS
 */
export function adminOnly(req: AuthRequest, res: Response, next: NextFunction) {
  const u = req.user;
  if (!u) {
    return res.status(401).json({ code: 'missing_token', message: 'Missing Authorization header' });
  }

  const allowed = ALLOWED_EMAILS.has((u.email || '').toLowerCase());
  const ok =
    u.role === 'admin' &&
    u.account_status === 'active' &&
    allowed;

  if (!ok) {
    if (!IS_PROD) {
      console.warn('adminOnly denied:', {
        email: u.email,
        role: u.role,
        status: u.account_status,
        allowlisted: allowed,
      });
    }
    return res.status(403).json({ code: 'forbidden', message: 'Admin access only' });
  }
  return next();
}
