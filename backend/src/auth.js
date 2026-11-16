import jwt from 'jsonwebtoken';
import { cfg } from './config.js';

export function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : req.query.token;
  try {
    req.user = jwt.verify(token, cfg.jwtSecret);
    next();
  } catch {
    res.status(401).json({ error: 'unauthorized' });
  }
}

// จำกัดสิทธิ์ตาม role เช่น requireRole('AP','EXEC')
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'ไม่มีสิทธิ์ใช้งานส่วนนี้' });
    }
    next();
  };
}

// ใช้กับ endpoint ที่ n8n เรียก
export function requireInternal(req, res, next) {
  if (req.headers['x-api-key'] !== cfg.internalKey) {
    return res.status(401).json({ error: 'invalid api key' });
  }
  next();
}
