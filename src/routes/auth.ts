import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { authMiddleware, AuthPayload, AuthRequest } from '../middleware/authMiddleware';
import { pool } from '../db';

const router = Router();

const ALLOWED_EMAILS = new Set(
  (process.env.ALLOWED_EMAILS || 'vasu.kochhar@gmail.com,shanas.nakade@strot.net')
    .split(',')
    .map(e => e.trim().toLowerCase())
);

function generateToken(payload: AuthPayload) {
  const secret = process.env.JWT_SECRET || 'dev_secret';
  return jwt.sign(payload, secret, { expiresIn: '1h' });
}

// ===================== REGISTER =====================
router.post('/register', async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rowCount! > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      `INSERT INTO users (email, password_hash, role, account_status, is_verified, created_at)
       VALUES ($1, $2, 'candidate', 'pending', false, NOW())`,
      [email, hash]
    );

    return res.status(201).json({
      message: 'You’ve been added to the waitlist. You’ll be notified when access is available.'
    });
  } catch (err) {
    console.error('Registration failed:', err);
    return res.status(500).json({ error: 'Registration failed' });
  }
});

// ===================== LOGIN =====================
router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const result = await pool.query(
      `SELECT id, email, password_hash, role, account_status 
       FROM users 
       WHERE email = $1`,
      [email]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // ✅ Only active admins with allowed email can log in
    const isAllowedAdmin =
      user.role === 'admin' &&
      user.account_status === 'active' &&
      ALLOWED_EMAILS.has(String(user.email).toLowerCase());

    if (!isAllowedAdmin) {
      return res.status(403).json({
        error: 'You are on the waitlist. You’ll be notified once the platform is launched.'
      });
    }

    const token = generateToken({
      sub: user.id,
      email: user.email,
      role: 'admin',
      account_status: 'active'
    });

    await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    return res.json({ message: 'Login successful', token });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Login failed' });
  }
});

// ===================== GET CURRENT USER =====================
router.get('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  const userId = req.user?.sub;
  try {
    const result = await pool.query(
      `SELECT id, email, role, account_status, is_verified 
       FROM users 
       WHERE id = $1`,
      [userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const u = result.rows[0];
    return res.json({
      id: u.id,
      email: u.email,
      role: u.role,
      accountStatus: u.account_status,
      isVerified: u.is_verified
    });
  } catch (err) {
    console.error('Fetch /me failed:', err);
    return res.status(500).json({ error: 'Failed to fetch user info' });
  }
});

export default router;
