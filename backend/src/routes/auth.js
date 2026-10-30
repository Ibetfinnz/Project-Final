import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { q } from '../db.js';
import { cfg } from '../config.js';

const r = Router();
r.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  const { rows } = await q('SELECT * FROM users WHERE email = $1', [email]);
  const u = rows[0];
  if (!u || !(await bcrypt.compare(password || '', u.password_hash))) {
    return res.status(400).json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
  }
  const user = { id: u.id, name: u.name, role: u.role };
  res.json({ token: jwt.sign(user, cfg.jwtSecret, { expiresIn: '12h' }), user });
});
export default r;
