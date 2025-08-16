"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = void 0;
exports.adminOnly = adminOnly;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
const IS_PROD = process.env.NODE_ENV === 'production';
// Build a case-insensitive allowlist once (private beta guard)
const ALLOWED_EMAILS = new Set((process.env.ALLOWED_EMAILS || 'vasu.kochhar@gmail.com,shanas.nakade@strot.net')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean));
const authMiddleware = (req, res, next) => {
    const headerAuth = req.headers.authorization;
    if (!headerAuth?.startsWith('Bearer ')) {
        return res.status(401).json({ code: 'missing_token', message: 'Missing Authorization header' });
    }
    const token = headerAuth.slice(7).trim();
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        const payload = {
            sub: decoded.sub ? Number(decoded.sub) : 0,
            email: String(decoded.email || '').toLowerCase(),
            role: decoded.role,
            account_status: decoded.account_status || 'pending',
        };
        req.user = payload;
        return next();
    }
    catch {
        return res.status(401).json({ code: 'invalid_token', message: 'Invalid or expired token' });
    }
};
exports.authMiddleware = authMiddleware;
/**
 * adminOnly — defense-in-depth gate for /api/admin/*
 * Requires:
 *   - role = 'admin'
 *   - account_status = 'active'
 *   - email present in ALLOWED_EMAILS
 */
function adminOnly(req, res, next) {
    const u = req.user;
    if (!u) {
        return res.status(401).json({ code: 'missing_token', message: 'Missing Authorization header' });
    }
    const allowed = ALLOWED_EMAILS.has((u.email || '').toLowerCase());
    const ok = u.role === 'admin' &&
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
