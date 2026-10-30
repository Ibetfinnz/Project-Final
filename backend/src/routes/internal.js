import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { q, tx } from '../db.js';
import { cfg } from '../config.js';
import { notify } from '../services/docs.js';
import { TYPE_LABEL, DOC_TYPES, classify, findCustomer, checkChain, saveDocument, saveSlip } from '../services/ingest.js';

const r = Router(); // ทุก endpoint ที่นี่ต้องผ่าน requireInternal (ตั้งใน index.js)

r.get('/files/:name', (req, res) => {
  res.sendFile(path.resolve(cfg.uploadDir, path.basename(req.params.name)));
});

// ---------- Workflow A: เอกสารทุกประเภทจาก Gmail ----------
r.post('/documents/ingest', async (req, res) => {
  const { source = 'gmail', source_ref, ocr = {}, ocr_text = '', validation = {}, confidence = null,
          file_base64, file_name = 'file.pdf', email_from } = req.body || {};
  if (!source_ref) return res.status(400).json({ error: 'source_ref จำเป็น' });

  const dup = await q(
    `SELECT 1 FROM documents WHERE source_ref = $1 UNION ALL SELECT 1 FROM payment_slips WHERE source_ref = $1
     UNION ALL SELECT 1 FROM uploads WHERE source_ref = $1`, [source_ref]);
  if (dup.rows[0]) return res.json({ duplicate: true, status: 'duplicate', needs_review: 'no' });

  let filePath = null;
  if (file_base64) {
    filePath = crypto.randomUUID() + (path.extname(file_name) || '.pdf');
    fs.mkdirSync(cfg.uploadDir, { recursive: true });
    fs.writeFileSync(path.join(cfg.uploadDir, filePath), Buffer.from(file_base64, 'base64'));
  }

  const type = classify(ocr_text, ocr.doc_type);
  const ocrErrors = validation.errors || [];

  try {
    const result = await tx(async (c) => {
      // จำแนกไม่ได้ / OCR พัง / สลิปไม่มียอด -> ส่งเข้าคิว review ให้คนเลือกประเภทในหน้า Upload
      if (type === 'UNKNOWN' || ocrErrors.length || (type === 'SLIP' && !Number(ocr.amount))) {
        const up = (await c.query(
          `INSERT INTO uploads(file_path, original_name, note, status, doc_type, ocr_data, error, source_ref)
           VALUES ($1,$2,$3,'review',$4,$5,$6,$7) RETURNING id`,
          [filePath || '', file_name, `จาก Gmail: ${email_from || ''}`, type === 'UNKNOWN' ? null : type,
           { ...ocr, doc_type: type }, ocrErrors.join('; ') || null, source_ref])).rows[0];
        await notify(c, `เอกสารจาก Gmail จำแนกอัตโนมัติไม่ได้ รอเลือกประเภท (${file_name})`, `/upload?job=${up.id}`);
        return { kind: 'review', status: 'unknown', needs_review: 'yes', label: TYPE_LABEL[type], errors: ['จำแนกประเภทหรืออ่านข้อมูลไม่ได้ ต้องให้เจ้าหน้าที่เลือกประเภทในหน้าอัปโหลด', ...ocrErrors] };
      }

      if (type === 'SLIP') {
        const s = await saveSlip(c, { ocr, source_ref, file_path: filePath });
        const matched = s.match_result === 'matched';
        return { ...s, label: TYPE_LABEL.SLIP, status: matched ? 'ok' : 'invalid', needs_review: matched ? 'no' : 'yes',
                 errors: matched ? [] : [s.match_result === 'mismatch' ? 'ยอดสลิปไม่ตรงกับใบแจ้งหนี้' : 'ไม่พบใบแจ้งหนี้ที่ตรงกับสลิป'] };
      }

      const d = await saveDocument(c, { type, d: ocr, source, source_ref, file_path: filePath, email_from, confidence });
      if (d.duplicate) return { ...d, status: 'duplicate', needs_review: 'no' };
      return { ...d, needs_review: d.status === 'invalid' ? 'yes' : 'no' };
    });
    res.status(201).json(result);
  } catch (e) {
    if (e.code === '23505') return res.json({ duplicate: true, status: 'duplicate', needs_review: 'no' });
    throw e;
  }
});

// ---------- Workflow B: ผล OCR จากหน้าอัปโหลด (ยังไม่บันทึก รอผู้ใช้ยืนยัน) ----------
r.post('/uploads/ocr-result', async (req, res) => {
  const { upload_id, ocr = {}, ocr_text = '', error } = req.body || {};
  const up = (await q('SELECT * FROM uploads WHERE id = $1', [upload_id])).rows[0];
  if (!up) return res.status(404).json({ error: 'ไม่พบ upload' });
  if (error) {
    await q(`UPDATE uploads SET status='error', error=$2 WHERE id=$1`, [up.id, error]);
    return res.json({ ok: false });
  }

  const type = classify(ocr_text, ocr.doc_type);
  ocr.doc_type = type;
  let preview = null;
  if (DOC_TYPES.includes(type)) {
    const cust = await findCustomer({ query: q }, ocr);
    preview = await checkChain({ query: q }, type, ocr, cust?.id);
  }
  await q(`UPDATE uploads SET status='review', doc_type=$2, ocr_data=$3, check_preview=$4 WHERE id=$1`,
    [up.id, type === 'UNKNOWN' ? null : type, ocr, preview]);
  res.json({ ok: true, doc_type: type });
});
export default r;