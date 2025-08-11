import { Router, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../db';

type UserRole = 'admin' | 'candidate' | 'employer';
type AccountStatus = 'pending' | 'active';
type AuthPayload = { sub: number; email: string; role: UserRole; account_status: AccountStatus };

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
const ALLOWED_EMAILS = new Set(
  (process.env.ALLOWED_EMAILS || 'vasu.kochhar@gmail.com,shanas.nakade@strot.net')
    .split(',')
    .map(s => s.trim().toLowerCase())
);

// Local guard to avoid import/handler glitches
const verifyAdmin: RequestHandler = (req, res, next) => {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) { res.status(401).json({ error: 'Authorization header missing or malformed' }); return; }
  const token = h.slice(7).trim();

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as Partial<AuthPayload>;
    if (!decoded?.sub || !decoded.email || !decoded.role) {
      res.status(401).json({ error: 'Invalid token payload' }); return;
    }
    if (
      decoded.role !== 'admin' ||
      !ALLOWED_EMAILS.has(decoded.email.toLowerCase()) ||
      decoded.account_status !== 'active'
    ) {
      res.status(403).json({ error: 'Forbidden: admin access only' }); return;
    }
    (req as any).user = decoded as AuthPayload; // attach if needed downstream
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

const router = Router();

console.log('Loaded adminRoutes.ts (waitlist routes) at', new Date().toISOString());

// Health ping (kept)
router.get('/ping', (_req, res) => res.json({ pong: true }));

// GET /api/admin/waitlist → list all pending users
router.get('/waitlist', verifyAdmin, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, email, role, account_status, created_at
         FROM users
        WHERE account_status = 'pending'
        ORDER BY created_at DESC`
    );
    res.json({ count: rows.length, users: rows });
  } catch (error) {
    console.error('Error fetching waitlist:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/admin/users/:id/activate → approve + ensure profile
router.post('/users/:id/activate', verifyAdmin, async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const activate = await client.query(
      `UPDATE users
          SET account_status = 'active',
              approved_at    = NOW()
        WHERE id = $1
        RETURNING id, email, role, account_status, approved_at`,
      [id]
    );

    if (activate.rowCount === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'User not found' });
      return;
    }

    await client.query(
      `INSERT INTO profiles (user_id, created_at, updated_at)
       VALUES ($1, NOW(), NOW())
       ON CONFLICT (user_id) DO NOTHING`,
      [id]
    );

    await client.query('COMMIT');
    res.json({
      message: `User ${activate.rows[0].email} activated and profile ensured.`,
      user: activate.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error activating user:', error);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

export default router;
