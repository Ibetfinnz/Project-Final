import { Router } from 'express';
import { q } from '../db.js';

const r = Router();
r.get('/', async (_req, res) => {
  res.json((await q('SELECT * FROM customers ORDER BY name')).rows);
});
r.post('/', async (req, res) => {
  const { name, address, tax_id, email } = req.body || {};
  if (!name) return res.status(400).json({ error: 'กรุณากรอกชื่อลูกค้า' });
  if (tax_id && !/^\d{13}$/.test(tax_id)) return res.status(400).json({ error: 'เลขผู้เสียภาษีต้องมี 13 หลัก' });
  try {
    const { rows } = await q(
      'INSERT INTO customers(name,address,tax_id,email) VALUES ($1,$2,$3,$4) RETURNING *',
      [name, address || null, tax_id || null, email || null]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'เลขผู้เสียภาษีนี้มีในระบบแล้ว' });
    throw e;
  }
});
export default r;
