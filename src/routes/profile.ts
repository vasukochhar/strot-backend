import { Router, RequestHandler, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../db';
import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import fs from 'fs';

console.log('Loaded profile routes'); // 👈 add this line

// ====== simple JWT verify (no role gate) ======
type UserRole = 'admin' | 'candidate' | 'employer';
type AccountStatus = 'pending' | 'active';
type AuthPayload = { sub: number; email: string; role: UserRole; account_status: AccountStatus };

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';

const requireUser: RequestHandler = (req, res, next) => {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authorization header missing or malformed' });
    return;
  }
  try {
    const token = h.slice(7).trim();
    const decoded = jwt.verify(token, JWT_SECRET) as Partial<AuthPayload>;
    if (!decoded?.sub || !decoded.email || !decoded.role) {
      res.status(401).json({ error: 'Invalid token payload' });
      return;
    }
    (req as Request & { user?: AuthPayload }).user = decoded as AuthPayload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// ====== storage config for avatars (local disk) ======
const uploadDir = path.join(process.cwd(), 'uploads', 'avatars');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (req: Request & { user?: AuthPayload }, file, cb) => {
    const userId = req.user?.sub ?? 'anon';
    const ext = path.extname(file.originalname || '').toLowerCase();
    cb(null, `u${userId}-${Date.now()}${ext || '.png'}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb: FileFilterCallback) => {
    const ok = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.mimetype);
    if (!ok) return cb(new Error('Only PNG/JPEG/WEBP images allowed'));
    cb(null, true);
  }
});

const router = Router();

/** 🔎 health check for this router (no auth) */
router.get('/ping', (_req, res) => res.json({ ok: true })); // 👈 add this route

/**
 * GET /api/profile
 */
router.get('/', requireUser, async (req: Request & { user?: AuthPayload }, res: Response) => {
  const userId = req.user!.sub;
  try {
    await pool.query(
      `INSERT INTO profiles (user_id, created_at, updated_at)
       SELECT $1, NOW(), NOW()
       WHERE NOT EXISTS (SELECT 1 FROM profiles WHERE user_id = $1)`,
      [userId]
    );

    const { rows } = await pool.query(
      `SELECT user_id, full_name, headline, location, bio, company, website, avatar_url, created_at, updated_at
         FROM profiles
        WHERE user_id = $1`,
      [userId]
    );

    res.json({ profile: rows[0] });
  } catch (err) {
    console.error('GET /api/profile error:', err);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

/**
 * PUT /api/profile
 */
router.put('/', requireUser, async (req: Request & { user?: AuthPayload }, res: Response) => {
  const userId = req.user!.sub;
  const { full_name, headline, location, bio, company, website } = req.body || {};

  try {
    const { rows } = await pool.query(
      `UPDATE profiles
          SET full_name = COALESCE($2, full_name),
              headline  = COALESCE($3, headline),
              location  = COALESCE($4, location),
              bio       = COALESCE($5, bio),
              company   = COALESCE($6, company),
              website   = COALESCE($7, website),
              updated_at = NOW()
        WHERE user_id = $1
        RETURNING user_id, full_name, headline, location, bio, company, website, avatar_url, created_at, updated_at`,
      [userId, full_name, headline, location, bio, company, website]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }
    res.json({ profile: rows[0] });
  } catch (err) {
    console.error('PUT /api/profile error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

/**
 * POST /api/profile/avatar
 */
router.post('/avatar', requireUser, upload.single('avatar'), async (req: Request & { user?: AuthPayload; file?: Express.Multer.File }, res: Response) => {
  const userId = req.user!.sub;
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }

  const publicPath = `/uploads/avatars/${req.file.filename}`;

  try {
    const { rows } = await pool.query(
      `UPDATE profiles
          SET avatar_url = $2,
              updated_at = NOW()
        WHERE user_id = $1
        RETURNING user_id, avatar_url`,
      [userId, publicPath]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }
    res.json({ avatar_url: rows[0].avatar_url });
  } catch (err) {
    console.error('POST /api/profile/avatar error:', err);
    res.status(500).json({ error: 'Failed to upload avatar' });
  }
});

export default router;
