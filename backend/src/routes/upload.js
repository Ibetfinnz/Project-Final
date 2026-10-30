import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { q } from '../db.js';
import { cfg } from '../config.js';
import { triggerSlipOcr } from '../services/n8n.js';
import { tx } from '../db.js'; 
import { DOC_TYPES, saveDocument, saveSlip } from '../services/ingest.js';

fs.mkdirSync(cfg.uploadDir, { recursive: true });

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const upload = multer({
  storage: multer.diskStorage({
    destination: cfg.uploadDir,
    filename: (_req, file, cb) => cb(null, crypto.randomUUID() + path.extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    ALLOWED.includes(file.mimetype) ? cb(null, true) : cb(new Error('รองรับเฉพาะรูปภาพและไฟล์ PDF')),
});

const r = Router();

r.post('/', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err?.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'ไฟล์ต้องมีขนาดไม่เกิน 8 MB' });
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'กรุณาเลือกไฟล์' });
  const { rows } = await q(
    `INSERT INTO uploads(file_path, original_name, mime, note, uploaded_by) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [req.file.filename, req.file.originalname, req.file.mimetype, req.body.note || null, req.user.id]);
  const up = rows[0];
  try {
    await triggerSlipOcr({ upload_id: up.id, file_name: req.file.filename, mime: req.file.mimetype, note: up.note });
  } catch (e) {
    await q(`UPDATE uploads SET status='error', error=$2 WHERE id=$1`, [up.id, 'เรียก n8n ไม่สำเร็จ: ' + e.message]);
  }
  res.status(201).json({ id: up.id });
});

// หน้าเว็บ poll สถานะ OCR
r.get('/:id', async (req, res) => {
  const { rows } = await q(
    `SELECT u.id, u.status, u.error, u.slip_id, u.document_id, u.doc_type, u.ocr_data, u.check_preview,
            s.amount, s.match_result, s.sender_name, s.transfer_at, d.doc_no
     FROM uploads u LEFT JOIN payment_slips s ON s.id = u.slip_id
     LEFT JOIN documents d ON d.id = s.matched_document_id WHERE u.id = $1`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'ไม่พบรายการ' });
  res.json(rows[0]);
});

// ผู้ใช้ตรวจ/แก้ข้อมูลแล้วกดบันทึก
r.post('/:id/confirm', async (req, res) => {
  const { doc_type, data = {} } = req.body || {};
  if (!['SLIP', ...DOC_TYPES].includes(doc_type)) return res.status(400).json({ error: 'กรุณาเลือกประเภทเอกสาร' });

  const out = await tx(async (c) => {
    const up = (await c.query('SELECT * FROM uploads WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
    if (!up) throw Object.assign(new Error('ไม่พบรายการ'), { status: 404 });
    if (up.status !== 'review') throw Object.assign(new Error('รายการนี้บันทึกไปแล้วหรือยังอ่านไม่เสร็จ'), { status: 409 });

    if (doc_type === 'SLIP') {
      const s = await saveSlip(c, { up, ocr: data });
      await c.query(`UPDATE uploads SET status='done', doc_type='SLIP', slip_id=$2 WHERE id=$1`, [up.id, s.slip_id]);
      return s;
    }
    const d = await saveDocument(c, {
      type: doc_type, d: data, source: 'upload', source_ref: `upload:${up.id}`,
      file_path: up.file_path, created_by: req.user.id, confidence: null,
    });
    if (d.duplicate) throw Object.assign(new Error(`มีเอกสารเลขที่ ${d.doc_no} ในระบบแล้ว`), { status: 409 });
    await c.query(`UPDATE uploads SET status='done', doc_type=$2, document_id=$3 WHERE id=$1`, [up.id, doc_type, d.id]);
    return d;
  });
  res.status(201).json(out);
});

export default r;
