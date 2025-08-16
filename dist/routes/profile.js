"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const multer_1 = __importDefault(require("multer"));
const db_1 = require("../db");
const authMiddleware_1 = require("../middleware/authMiddleware");
const ensureProfile = (userId) => db_1.pool.query(`INSERT INTO profiles (user_id, created_at, updated_at)
     SELECT $1, NOW(), NOW()
     WHERE NOT EXISTS (SELECT 1 FROM profiles WHERE user_id = $1)`, [userId]);
const AVATAR_DIR = path_1.default.join(process.cwd(), 'uploads', 'avatars');
fs_1.default.mkdirSync(AVATAR_DIR, { recursive: true });
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => cb(null, AVATAR_DIR),
    filename: (req, file, cb) => {
        const userId = req.user?.sub ?? 'anon';
        const original = (file.originalname || '').toLowerCase();
        const ext = ['.png', '.jpg', '.jpeg', '.webp'].find((e) => original.endsWith(e)) ?? '.png';
        cb(null, `u${userId}-${Date.now()}${ext}`);
    },
});
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const callback = cb;
        const ok = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.mimetype);
        if (ok)
            callback(null, true);
        else
            callback(new Error('Only PNG/JPEG/WEBP images allowed'), false);
    },
});
const router = (0, express_1.Router)();
router.get('/ping', (_req, res) => res.json({ ok: true }));
// GET /api/profile/me
router.get('/me', authMiddleware_1.authMiddleware, async (req, res) => {
    const userId = req.user.sub;
    try {
        await ensureProfile(userId);
        const { rows } = await db_1.pool.query(`SELECT user_id, full_name, headline, location, bio, company, website, avatar_url, created_at, updated_at
         FROM profiles
        WHERE user_id = $1`, [userId]);
        res.json({ ok: true, profile: rows[0] });
    }
    catch (err) {
        console.error('GET /api/profile/me error:', err);
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});
// PUT /api/profile/me
const updateMe = async (req, res) => {
    const userId = req.user.sub;
    const { full_name, headline, location, bio, company, website } = req.body ?? {};
    try {
        await ensureProfile(userId);
        const { rows } = await db_1.pool.query(`UPDATE profiles
          SET full_name = COALESCE($2, full_name),
              headline  = COALESCE($3, headline),
              location  = COALESCE($4, location),
              bio       = COALESCE($5, bio),
              company   = COALESCE($6, company),
              website   = COALESCE($7, website),
              updated_at = NOW()
        WHERE user_id = $1
        RETURNING user_id, full_name, headline, location, bio, company, website, avatar_url, created_at, updated_at`, [userId, full_name, headline, location, bio, company, website]);
        res.json({ ok: true, profile: rows[0] });
    }
    catch (err) {
        console.error('PUT /api/profile/me error:', err);
        res.status(500).json({ error: 'Failed to update profile' });
    }
};
router.put('/me', authMiddleware_1.authMiddleware, updateMe);
// **Legacy alias** so old frontend calls stop 404’ing:
// PUT /api/profile/update  → behaves like PUT /api/profile/me
router.put('/update', authMiddleware_1.authMiddleware, updateMe);
// POST /api/profile/avatar  (form-data key: avatar)
router.post('/avatar', authMiddleware_1.authMiddleware, upload.single('avatar'), async (req, res) => {
    const userId = req.user.sub;
    if (!req.file)
        return res.status(400).json({ error: 'No file uploaded' });
    const newPublicPath = `/uploads/avatars/${req.file.filename}`;
    try {
        const prev = await db_1.pool.query(`SELECT avatar_url FROM profiles WHERE user_id = $1`, [userId]);
        const { rows } = await db_1.pool.query(`UPDATE profiles SET avatar_url = $2, updated_at = NOW()
         WHERE user_id = $1
         RETURNING user_id, avatar_url`, [userId, newPublicPath]);
        const oldPath = prev.rows?.[0]?.avatar_url ? path_1.default.join(process.cwd(), prev.rows[0].avatar_url) : null;
        if (oldPath && oldPath.startsWith(path_1.default.join(process.cwd(), 'uploads'))) {
            fs_1.default.promises.unlink(oldPath).catch(() => { });
        }
        res.json({ ok: true, avatar_url: rows[0].avatar_url });
    }
    catch (err) {
        console.error('POST /api/profile/avatar error:', err);
        res.status(500).json({ error: 'Failed to upload avatar' });
    }
});
// DELETE /api/profile/avatar
router.delete('/avatar', authMiddleware_1.authMiddleware, async (req, res) => {
    const userId = req.user.sub;
    try {
        const prev = await db_1.pool.query(`SELECT avatar_url FROM profiles WHERE user_id = $1`, [userId]);
        const old = prev.rows?.[0]?.avatar_url;
        await db_1.pool.query(`UPDATE profiles SET avatar_url = NULL, updated_at = NOW() WHERE user_id = $1`, [userId]);
        if (old) {
            const fp = path_1.default.join(process.cwd(), old);
            if (fp.startsWith(path_1.default.join(process.cwd(), 'uploads'))) {
                fs_1.default.promises.unlink(fp).catch(() => { });
            }
        }
        res.json({ ok: true });
    }
    catch (err) {
        console.error('DELETE /api/profile/avatar error:', err);
        res.status(500).json({ error: 'Failed to remove avatar' });
    }
});
exports.default = router;
