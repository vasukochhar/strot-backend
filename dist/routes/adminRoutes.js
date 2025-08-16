"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/adminRoutes.ts
const express_1 = require("express");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const db_1 = require("../db");
const router = (0, express_1.Router)();
// ---- Version tag so we can prove this file is loaded ----
const ADMIN_ROUTES_VERSION = 'v3-int-id-2025-08-14';
console.log(`Loaded adminRoutes.ts (${ADMIN_ROUTES_VERSION}) at`, new Date().toISOString());
// ---- Config ----
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
const ALLOWED_EMAILS = new Set((process.env.ALLOWED_EMAILS || 'vasu.kochhar@gmail.com,shanas.nakade@strot.net')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean));
const isDev = process.env.NODE_ENV !== 'production';
const log = (...args) => { if (isDev)
    console.log(...args); };
// ---- Helpers ----
const badRequest = (res, message) => res.status(400).json({ error: 'bad_request', message });
const forbidden = (res, message = 'Admin access required') => res.status(403).json({ error: 'forbidden', message });
const unauthorized = (res, message = 'Invalid or expired token') => res.status(401).json({ error: 'unauthorized', message });
// ---- Admin guard ----
async function verifyAdmin(req, res, next) {
    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer '))
        return unauthorized(res, 'Authorization header missing or malformed');
    try {
        const token = h.slice(7).trim();
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        if (!decoded?.sub || !decoded.email || !decoded.role) {
            return unauthorized(res, 'Invalid token payload');
        }
        const email = String(decoded.email).toLowerCase();
        if (!ALLOWED_EMAILS.has(email)) {
            return forbidden(res, 'Admin login restricted to whitelisted emails');
        }
        // Double‑check against DB (authoritative)
        const { rows } = await db_1.pool.query(`SELECT id, role, account_status, email
         FROM users
        WHERE id = $1
        LIMIT 1`, [Number(decoded.sub)]);
        if (rows.length === 0) {
            return unauthorized(res, 'User not found for this token');
        }
        const admin = rows[0];
        if (admin.role !== 'admin')
            return forbidden(res, 'Admin role required');
        if (admin.account_status !== 'active')
            return forbidden(res, 'Admin account is not active');
        req.user = { id: admin.id, email: admin.email };
        next();
    }
    catch (err) {
        return unauthorized(res);
    }
}
// ---- Routes ----
// Protected version ping (since your app mounts admin under authMiddleware)
router.get('/ping', verifyAdmin, (_req, res) => {
    res.json({ pong: true, version: ADMIN_ROUTES_VERSION });
});
// GET /api/admin/waitlist → pending users
router.get('/waitlist', verifyAdmin, async (req, res) => {
    const q = req.query.q?.trim();
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || '50'), 10) || 50, 1), 200);
    const offset = Math.max(parseInt(String(req.query.offset || '0'), 10) || 0, 0);
    try {
        let where = `WHERE account_status = 'pending'`;
        const params = [];
        if (q) {
            params.push(`%${q}%`);
            where += ` AND email ILIKE $${params.length}`;
        }
        params.push(limit);
        params.push(offset);
        const sql = `
      SELECT id, email, role, account_status, created_at
        FROM users
        ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1}
      OFFSET $${params.length}
    `;
        const [list, total] = await Promise.all([
            db_1.pool.query(sql, params),
            db_1.pool.query(`SELECT COUNT(*)::text AS count FROM users ${q ? `WHERE account_status = 'pending' AND email ILIKE $1` : `WHERE account_status = 'pending'`}`, q ? [`%${q}%`] : []),
        ]);
        res.json({
            count: Number(total.rows[0]?.count || 0),
            users: list.rows,
        });
    }
    catch (error) {
        console.error('Error fetching waitlist:', error);
        res.status(500).json({ error: 'Server error' });
    }
});
/**
 * POST /api/admin/users/:id/activate
 * Activates a user by **INTEGER** id and ensures a profile row.
 */
router.post('/users/:id/activate', verifyAdmin, async (req, res) => {
    const { id } = req.params;
    // ✅ your schema uses SERIAL INTEGER ids
    if (!/^\d+$/.test(id)) {
        return badRequest(res, 'Invalid user id (must be an integer)');
    }
    const userId = Number(id);
    const client = await db_1.pool.connect();
    try {
        await client.query('BEGIN');
        const activate = await client.query(`UPDATE users
          SET account_status = 'active',
              approved_at    = NOW(),
              updated_at     = NOW()
        WHERE id = $1
        RETURNING id, email, role, account_status, approved_at`, [userId]);
        if (activate.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'not_found', message: 'User not found' });
        }
        await client.query(`INSERT INTO profiles (user_id, created_at, updated_at)
       VALUES ($1, NOW(), NOW())
       ON CONFLICT (user_id) DO NOTHING`, [userId]);
        await client.query('COMMIT');
        return res.json({
            message: `User ${activate.rows[0].email} activated and profile ensured.`,
            user: activate.rows[0],
        });
    }
    catch (error) {
        await client.query('ROLLBACK');
        console.error('Error activating user:', error);
        return res.status(500).json({ error: 'server_error', message: 'Failed to activate user' });
    }
    finally {
        client.release();
    }
});
exports.default = router;
