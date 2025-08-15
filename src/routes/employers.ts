import { Router, Request, Response } from 'express';
import { pool } from '../db';
import { authMiddleware } from '../middleware/authMiddleware';

// Only admins can manage employers
const adminOnly = [
  authMiddleware,
  (req: Request & { user?: any }, res: Response, next: () => void) => {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access only' });
    }
    next();
  }
];

const router = Router();

// List all employers
router.get('/', adminOnly, async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, email, role, account_status, created_at
       FROM users
       WHERE role = 'employer'
       ORDER BY created_at DESC`
    );
    res.json({ count: rows.length, employers: rows });
  } catch (err) {
    console.error('Error fetching employers:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get single employer by ID
router.get('/:id', adminOnly, async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, email, role, account_status, created_at
       FROM users
       WHERE id = $1 AND role = 'employer'`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Employer not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Error fetching employer:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update employer by ID
router.put('/:id', adminOnly, async (req: Request, res: Response) => {
  const { account_status } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE users
       SET account_status = COALESCE($2, account_status),
           updated_at = NOW()
       WHERE id = $1 AND role = 'employer'
       RETURNING id, email, role, account_status, updated_at`,
      [req.params.id, account_status]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Employer not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Error updating employer:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete employer by ID
router.delete('/:id', adminOnly, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `DELETE FROM users WHERE id = $1 AND role = 'employer' RETURNING id, email`,
      [req.params.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Employer not found' });
    res.json({ message: `Employer ${result.rows[0].email} deleted` });
  } catch (err) {
    console.error('Error deleting employer:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
