import { Response, NextFunction } from 'express';
import { AuthRequest } from './authMiddleware';

const ALLOWED_EMAILS = new Set(
  (process.env.ALLOWED_EMAILS || 'vasu.kochhar@gmail.com,shanas.nakade@strot.net')
    .split(',')
    .map(e => e.trim().toLowerCase())
);

export const adminOnly = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (
    req.user?.role !== 'admin' ||
    req.user?.account_status !== 'active' ||
    !ALLOWED_EMAILS.has(req.user?.email.toLowerCase())
  ) {
    return res.status(403).json({ error: 'Forbidden: admin access only' });
  }
  next();
};
