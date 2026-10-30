import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { q, tx } from '../db.js';
import { cfg } from '../config.js';

const r = Router();

r.get('/', async (req, res) => {
  const { result, customer } = req.query;
  const w = [], p = [];
  if (result) { p.push(result); w.push(`s.match_result = $${p.length}`); }
  if (customer) { p.push(customer); w.push(`d.customer_id = $${p.length}`); }
  const { rows } = await q(
    `SELECT s.*, d.doc_no, d.total AS expected, d.customer_id,
            COALESCE(c.name, s.sender_name) AS customer_name
     FROM payment_slips s
     LEFT JOIN documents d ON d.id = s.matched_document_id
     LEFT JOIN customers c ON c.id = d.customer_id
     ${w.length ? 'WHERE ' + w.join(' AND ') : ''}
     ORDER BY s.verified, s.created_at DESC LIMIT 300`, p);
  res.json(rows);
});

// รูปสลิป (เปิดด้วย Authorization header หรือ ?token=)
r.get('/:id/file', async (req, res) => {
  const { rows } = await q('SELECT file_path FROM payment_slips WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).end();
  res.sendFile(path.resolve(cfg.uploadDir, path.basename(rows[0].file_path)));
});

// ยืนยัน / ปฏิเสธ โดยเจ้าหน้าที่
r.post('/:id/verify', async (req, res) => {
  const { action, document_id } = req.body || {};
  await tx(async (c) => {
    const s = (await c.query('SELECT * FROM payment_slips WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
    if (!s) throw Object.assign(new Error('ไม่พบสลิป'), { status: 404 });
    const docId = document_id || s.matched_document_id;
    const doc = docId ? (await c.query('SELECT * FROM documents WHERE id = $1', [docId])).rows[0] : null;

    if (action === 'confirm') {
      if (!doc) throw Object.assign(new Error('กรุณาเลือกเอกสารที่ต้องการจับคู่'), { status: 400 });
      if (Math.abs(doc.total - s.amount) > 0.01) {
        throw Object.assign(new Error(`ยอดสลิป ${s.amount} ไม่ตรงกับยอดเอกสาร ${doc.total}`), { status: 400 });
      }
      await c.query(`UPDATE payment_slips SET verified = true, match_result = 'matched', matched_document_id = $1 WHERE id = $2`, [doc.id, s.id]);
      await c.query(`UPDATE documents SET status = 'paid', paid_at = COALESCE($2::timestamptz, now()), status_reason = NULL, updated_at = now() WHERE id = $1`, [doc.id, s.transfer_at]);
    } else if (action === 'reject') {
      await c.query(`UPDATE payment_slips SET verified = true, match_result = 'mismatch', matched_document_id = $1 WHERE id = $2`, [doc?.id ?? null, s.id]);
      if (doc) {
        await c.query(`UPDATE documents SET status = 'mismatch', status_reason = $2, updated_at = now() WHERE id = $1`, [doc.id, 'เจ้าหน้าที่ปฏิเสธสลิป: ยอด/ข้อมูลไม่ตรง']);
      }
    } else {
      throw Object.assign(new Error('action ต้องเป็น confirm หรือ reject'), { status: 400 });
    }
  });
  res.json({ ok: true });
});

r.delete('/:id', async (req, res) => {
  const s = await tx(async (c) => {
    const s = (await c.query('SELECT * FROM payment_slips WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
    if (!s) throw Object.assign(new Error('ไม่พบสลิป'), { status: 404 });
    await c.query('DELETE FROM payment_slips WHERE id = $1', [s.id]);

    // คืนสถานะใบแจ้งหนี้ ถ้าไม่มีสลิปใบอื่นอ้างถึงอยู่
    if (s.matched_document_id) {
      const other = await c.query('SELECT 1 FROM payment_slips WHERE matched_document_id = $1 LIMIT 1', [s.matched_document_id]);
      if (!other.rowCount) {
        const paidBySlip = s.verified && s.match_result === 'matched';
        await c.query(
          `UPDATE documents SET status='unpaid', paid_at=NULL, status_reason=NULL, updated_at=now()
           WHERE id = $1 AND (status IN ('slip_review','mismatch') OR ($2 AND status = 'paid'))`,
          [s.matched_document_id, paidBySlip]);
      }
    }
    if (s.upload_id) await c.query('DELETE FROM uploads WHERE id = $1', [s.upload_id]);
    return s;
  });

  // ลบไฟล์บนดิสก์ถ้าไม่มีแถวไหนใช้แล้ว
  if (s.file_path) {
    const used = await q(
      `SELECT 1 FROM documents WHERE file_path = $1 UNION ALL SELECT 1 FROM uploads WHERE file_path = $1
       UNION ALL SELECT 1 FROM payment_slips WHERE file_path = $1 LIMIT 1`, [s.file_path]);
    if (!used.rowCount) fs.rm(path.resolve(cfg.uploadDir, path.basename(s.file_path)), { force: true }, () => {});
  }
  res.status(204).end();
});
export default r;
