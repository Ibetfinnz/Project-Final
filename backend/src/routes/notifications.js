import { Router } from 'express';
import { q } from '../db.js';

const r = Router();
const sideOf = (role) => (role === 'AR' || role === 'AP' ? role : null);

r.get('/', async (req, res) => {
  const side = sideOf(req.user?.role);
  const { rows } = await q(
    `SELECT * FROM notifications
     WHERE $1::text IS NULL OR side = $1
     ORDER BY id DESC LIMIT 30`,
    [side]
  );
  res.json({ items: rows, unread: rows.filter((n) => !n.is_read).length });
});
r.post('/read', async (req, res) => {
  const side = sideOf(req.user?.role);
  await q(
    `UPDATE notifications SET is_read = true
     WHERE is_read = false AND ($1::text IS NULL OR side = $1)`,
    [side]
  );
  res.json({ ok: true });
});
export default r;
