import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthPayload {
  sub: number;
  email: string;
  role: string;
  account_status: string;
}

export interface AuthRequest extends Request {
  user?: AuthPayload;
}

export const authMiddleware = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader) {
    return res.status(401).json({ error: 'Authorization header missing' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Token not provided' });
  }

  try {
    const secret = process.env.JWT_SECRET || 'dev_secret';
    const decoded = jwt.verify(token, secret) as Partial<AuthPayload>;

    if (!decoded.sub || !decoded.email || !decoded.role) {
      return res.status(401).json({ error: 'Invalid token payload' });
    }

    // ✅ Allow only you and Shanas as active admins
    const allowedAdmins = [
      'vasu.kochhar@gmail.com',
      'shanas.nakade@strot.net'
    ];

    if (
      decoded.role !== 'admin' ||
      !allowedAdmins.includes(decoded.email) ||
      decoded.account_status !== 'active'
    ) {
      return res.status(403).json({
        error:
          'Access restricted: You are on the waitlist until the platform is ready.'
      });
    }

    req.user = decoded as AuthPayload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};
