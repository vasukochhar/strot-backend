import { Request, Response, NextFunction } from 'express';

type JwtUser = {
  id: string;
  role: 'admin' | 'candidate' | 'employer';
};

declare module 'express-serve-static-core' {
  interface Request {
    user?: JwtUser;
  }
}

/**
 * Requires an authenticated admin.
 * Assumes authMiddleware has already populated req.user.
 */
export default function adminOnly(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: admin access only' });
  }
  return next();
}
