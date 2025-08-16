"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const db_1 = require("../db");
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
const JWT_TTL_SECS = 24 * 60 * 60; // 24h
// Private beta: only whitelisted emails can be admins
const ALLOWED_EMAILS = new Set((process.env.ALLOWED_EMAILS || 'vasu.kochhar@gmail.com,shanas.nakade@strot.net')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean));
/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */
const router = (0, express_1.Router)();
const normEmail = (v) => String(v || '').trim().toLowerCase();
function signToken(p) {
    return jsonwebtoken_1.default.sign(p, JWT_SECRET, { expiresIn: JWT_TTL_SECS });
}
function isAdmin(email, role) {
    return role === 'admin' && ALLOWED_EMAILS.has(email.toLowerCase());
}
/* ------------------------------------------------------------------ */
/* Routes                                                             */
/* ------------------------------------------------------------------ */
router.get('/ping', (_req, res) => {
    res.json({ ok: true, version: 'auth-v2-2025-08-14' });
});
/**
 * POST /api/auth/register
 * - upsert candidate -> pending
 */
router.post('/register', async (req, res) => {
    const email = normEmail(req.body?.email);
    const password = String(req.body?.password || '');
    console.log('=== [AUTH] /register', email);
    if (!email || !password) {
        return res.status(400).json({ error: 'bad_request', message: 'Email and password are required.' });
    }
    try {
        const client = await db_1.pool.connect();
        try {
            await client.query('BEGIN');
            const existing = await client.query(`SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1`, [email]);
            const hash = await bcrypt_1.default.hash(password, 10);
            if (existing.rowCount) {
                await client.query(`UPDATE users
              SET password_hash = $2,
                  role          = COALESCE(role, 'candidate'),
                  account_status= 'pending',
                  approved_at   = NULL,
                  updated_at    = NOW()
            WHERE lower(email) = lower($1)`, [email, hash]);
            }
            else {
                await client.query(`INSERT INTO users (email, password_hash, role, account_status, created_at, updated_at)
           VALUES ($1, $2, 'candidate', 'pending', NOW(), NOW())`, [email, hash]);
            }
            await client.query('COMMIT');
            return res.json({
                message: 'Signup successful. Your account is pending approval. Please wait for an admin to activate it before logging in.',
                status: 'pending',
            });
        }
        catch (err) {
            await client.query('ROLLBACK');
            console.error('💥 /register DB error:', err);
            return res.status(500).json({ error: 'server_error', message: 'Internal Server Error' });
        }
        finally {
            client.release();
        }
    }
    catch (err) {
        console.error('💥 /register error:', err);
        return res.status(500).json({ error: 'server_error', message: 'Internal Server Error' });
    }
});
/**
 * POST /api/auth/login
 */
router.post('/login', async (req, res) => {
    const email = normEmail(req.body?.email);
    const password = String(req.body?.password || '');
    console.log('=== [AUTH] /login', email);
    if (!email || !password) {
        return res.status(400).json({ error: 'bad_request', message: 'Email and password are required.' });
    }
    try {
        const q = await db_1.pool.query(`SELECT id, email, role, account_status, password_hash, name
         FROM users
        WHERE lower(email) = lower($1)
        LIMIT 1`, [email]);
        if (q.rowCount === 0) {
            return res.status(401).json({ error: 'invalid_credentials', message: 'Invalid email or password' });
        }
        const u = q.rows[0];
        if (u.role === 'admin' && !isAdmin(u.email, u.role)) {
            return res.status(403).json({ error: 'forbidden', message: 'Admin access restricted to whitelisted emails.' });
        }
        if (u.account_status === 'pending') {
            return res.status(403).json({
                error: 'account_pending',
                message: 'Your account is pending approval. Please wait for an admin to activate it.',
            });
        }
        if (u.account_status !== 'active') {
            return res.status(403).json({ error: 'forbidden', message: 'Account is not active.' });
        }
        if (!u.password_hash) {
            return res.status(401).json({ error: 'invalid_credentials', message: 'Invalid email or password' });
        }
        const ok = await bcrypt_1.default.compare(password, u.password_hash);
        if (!ok) {
            return res.status(401).json({ error: 'invalid_credentials', message: 'Invalid email or password' });
        }
        const token = signToken({
            sub: u.id,
            email: u.email,
            role: u.role,
            account_status: u.account_status,
            name: u.name,
        });
        return res.json({
            token,
            user: {
                id: u.id,
                email: u.email,
                role: u.role,
                account_status: u.account_status,
                name: u.name,
            },
        });
    }
    catch (err) {
        console.error('💥 /login error:', err);
        return res.status(500).json({ error: 'server_error', message: 'Internal Server Error' });
    }
});
/**
 * GET /api/auth/me
 */
router.get('/me', async (req, res) => {
    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'unauthorized', message: 'Missing token' });
    }
    try {
        const token = h.slice(7).trim();
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        const userId = Number(decoded?.sub);
        if (!userId || Number.isNaN(userId)) {
            return res.status(401).json({ error: 'unauthorized', message: 'Invalid token' });
        }
        const q = await db_1.pool.query(`SELECT id, email, role, account_status, name
         FROM users
        WHERE id = $1
        LIMIT 1`, [userId]);
        if (q.rowCount === 0) {
            return res.status(404).json({ error: 'not_found', message: 'User not found' });
        }
        return res.json({ user: q.rows[0] });
    }
    catch {
        return res.status(401).json({ error: 'unauthorized', message: 'Invalid or expired token' });
    }
});
exports.default = router;
