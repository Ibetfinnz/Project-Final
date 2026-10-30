import { Router } from 'express';
import { q } from '../db.js';

const r = Router();
r.get('/', async (_req, res) => {
  const { rows } = await q('SELECT * FROM notifications ORDER BY id DESC LIMIT 30');
  res.json({ items: rows, unread: rows.filter((n) => !n.is_read).length });
});
r.post('/read', async (_req, res) => {
  await q('UPDATE notifications SET is_read = true WHERE is_read = false');
  res.json({ ok: true });
});
export default r;
