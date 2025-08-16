"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminOnly = void 0;
const ALLOWED_EMAILS = new Set((process.env.ALLOWED_EMAILS || 'vasu.kochhar@gmail.com,shanas.nakade@strot.net')
    .split(',')
    .map(e => e.trim().toLowerCase()));
const adminOnly = (req, res, next) => {
    if (req.user?.role !== 'admin' ||
        req.user?.account_status !== 'active' ||
        !ALLOWED_EMAILS.has(req.user?.email.toLowerCase())) {
        return res.status(403).json({ error: 'Forbidden: admin access only' });
    }
    next();
};
exports.adminOnly = adminOnly;
