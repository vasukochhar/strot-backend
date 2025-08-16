"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const authMiddleware_1 = require("../middleware/authMiddleware");
// Only admins can manage employers
const adminOnly = [
    authMiddleware_1.authMiddleware,
    (req, res, next) => {
        if (req.user?.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access only' });
        }
        next();
    }
];
const router = (0, express_1.Router)();
// List all employers
router.get('/', adminOnly, async (_req, res) => {
    try {
        const { rows } = await db_1.pool.query(`SELECT id, email, role, account_status, created_at
       FROM users
       WHERE role = 'employer'
       ORDER BY created_at DESC`);
        res.json({ count: rows.length, employers: rows });
    }
    catch (err) {
        console.error('Error fetching employers:', err);
        res.status(500).json({ error: 'Server error' });
    }
});
// Get single employer by ID
router.get('/:id', adminOnly, async (req, res) => {
    try {
        const { rows } = await db_1.pool.query(`SELECT id, email, role, account_status, created_at
       FROM users
       WHERE id = $1 AND role = 'employer'`, [req.params.id]);
        if (rows.length === 0)
            return res.status(404).json({ error: 'Employer not found' });
        res.json(rows[0]);
    }
    catch (err) {
        console.error('Error fetching employer:', err);
        res.status(500).json({ error: 'Server error' });
    }
});
// Update employer by ID
router.put('/:id', adminOnly, async (req, res) => {
    const { account_status } = req.body;
    try {
        const { rows } = await db_1.pool.query(`UPDATE users
       SET account_status = COALESCE($2, account_status),
           updated_at = NOW()
       WHERE id = $1 AND role = 'employer'
       RETURNING id, email, role, account_status, updated_at`, [req.params.id, account_status]);
        if (rows.length === 0)
            return res.status(404).json({ error: 'Employer not found' });
        res.json(rows[0]);
    }
    catch (err) {
        console.error('Error updating employer:', err);
        res.status(500).json({ error: 'Server error' });
    }
});
// Delete employer by ID
router.delete('/:id', adminOnly, async (req, res) => {
    try {
        const result = await db_1.pool.query(`DELETE FROM users WHERE id = $1 AND role = 'employer' RETURNING id, email`, [req.params.id]);
        if (result.rowCount === 0)
            return res.status(404).json({ error: 'Employer not found' });
        res.json({ message: `Employer ${result.rows[0].email} deleted` });
    }
    catch (err) {
        console.error('Error deleting employer:', err);
        res.status(500).json({ error: 'Server error' });
    }
});
exports.default = router;
