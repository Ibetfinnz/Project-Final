import { Router } from 'express';
import { q, tx } from '../db.js';
import { createDocument, getDocument, prepareBilling, OUTSTANDING } from '../services/docs.js';
import { generatePdf } from '../services/pdf.js';
import { sendDocumentEmail } from '../services/mailer.js';

const r = Router();

// กติกาการอ้างอิง: เอกสารที่กำลังสร้าง -> ประเภทต้นทางที่เลือกได้
const SOURCES = { INV: ['OP'], BN: ['INV'], RC: ['INV', 'BN'] };
// ต้นทางที่ "ถูกอ้างอิงโดยประเภทเหล่านี้แล้ว" จะไม่แสดงให้เลือกอีก
const EXCLUDED_BY = { INV: ['INV'], BN: ['BN', 'RC'], RC: ['RC', 'BN'] };

r.get('/', async (req, res) => {
  const { type, status, customer, q: search } = req.query;
  const w = [], p = [];
  if (type) { p.push(type); w.push(`d.doc_type = $${p.length}`); }
  if (status) { p.push(status); w.push(`d.status = $${p.length}`); }
  if (customer) { p.push(customer); w.push(`d.customer_id = $${p.length}`); }
  if (search) { p.push(`%${search}%`); w.push(`(d.doc_no ILIKE $${p.length} OR c.name ILIKE $${p.length})`); }
  const { rows } = await q(
    `SELECT d.*, c.name AS customer_name FROM documents d
     LEFT JOIN customers c ON c.id = d.customer_id
     ${w.length ? 'WHERE ' + w.join(' AND ') : ''}
     ORDER BY d.issue_date DESC, d.id DESC LIMIT 500`, p);
  res.json(rows);
});

// เอกสารที่เลือกอ้างอิงได้ เช่น GET /documents/linkable?type=BN&customer=3
// (ต้องอยู่ก่อน '/:id')
r.get('/linkable', async (req, res) => {
  const { type, customer } = req.query;
  const src = SOURCES[type];
  if (!src) return res.json([]);

  const p = [src, EXCLUDED_BY[type]];
  let extra = '';
  if (customer) { p.push(customer); extra += ` AND d.customer_id = $${p.length}`; }
  if (type === 'BN') { p.push(OUTSTANDING); extra += ` AND d.status::text = ANY($${p.length})`; }

  const { rows } = await q(
    `SELECT d.id, d.doc_no, d.doc_type, d.customer_id, d.issue_date, d.due_date,
            d.subtotal, d.vat, d.total, d.status, c.name AS customer_name
     FROM documents d LEFT JOIN customers c ON c.id = d.customer_id
     WHERE d.doc_type::text = ANY($1) ${extra}
       AND NOT EXISTS (SELECT 1 FROM documents x
                       WHERE x.doc_type::text = ANY($2) AND x.ref_doc_id = d.id)
       AND NOT EXISTS (SELECT 1 FROM document_refs r JOIN documents x ON x.id = r.document_id
                       WHERE r.ref_document_id = d.id AND x.doc_type::text = ANY($2))
     ORDER BY d.issue_date, d.id`, p);
  res.json(rows);
});

r.get('/:id', async (req, res) => {
  const doc = await getDocument({ query: q }, req.params.id);
  if (!doc) return res.status(404).json({ error: 'ไม่พบเอกสาร' });
  res.json(doc);
});

r.post('/', async (req, res) => {
  const b = req.body || {};
  if (!['QT', 'OP', 'INV', 'BN', 'RC'].includes(b.doc_type)) return res.status(400).json({ error: 'ประเภทเอกสารไม่ถูกต้อง' });
  if (!b.customer_id) return res.status(400).json({ error: 'กรุณาเลือกลูกค้า' });
  // ใบวางบิลใช้ invoice_ids แทนรายการสินค้า
  if (b.doc_type !== 'BN' && (!Array.isArray(b.items) || !b.items.some((i) => i.description && Number(i.qty) > 0))) {
    return res.status(400).json({ error: 'กรุณาเพิ่มรายการสินค้าอย่างน้อย 1 รายการ' });
  }

  let doc;
  try {
    doc = await tx(async (c) => {
      const extra = b.doc_type === 'BN' ? await prepareBilling(c, b) : {};
      return createDocument(c, { ...b, ...extra, created_by: req.user.id });
    });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    if (e.code === '23505') return res.status(409).json({ error: 'เลขที่เอกสารนี้ถูกใช้แล้ว' }); // UNIQUE (doc_type, doc_no)
    throw e;
  }

  let emailed = false, emailError = null;
  if (b.send_email && b.email) {
    try {
      const full = await getDocument({ query: q }, doc.id);
      await sendDocumentEmail(b.email, full, await generatePdf(full));
      emailed = true;
    } catch (e) {
      emailError = e.responseCode === 535
        ? 'รหัสผ่านแอป (SMTP_PASS) หรืออีเมล (SMTP_USER) ใน .env ไม่ถูกต้อง'
        : e.message; // เอกสารถูกบันทึกแล้ว แต่ส่งเมลไม่สำเร็จ
    }
  }
  res.status(201).json({ ...doc, emailed, emailError });
});

// แก้ไขเฉพาะสถานะ/วันที่/เหตุผล (การแก้รายการสินค้าให้ลบแล้วสร้างใหม่ หรือขยายต่อภายหลัง)
r.put('/:id', async (req, res) => {
  const { status, due_date, status_reason } = req.body || {};
  const { rows } = await q(
    `UPDATE documents SET
       status = COALESCE($1, status),
       due_date = COALESCE($2, due_date),
       status_reason = $3,
       paid_at = CASE WHEN $1 = 'paid' AND paid_at IS NULL THEN now() ELSE paid_at END,
       updated_at = now()
     WHERE id = $4 RETURNING *`,
    [status || null, due_date || null, status_reason || null, req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'ไม่พบเอกสาร' });
  res.json(rows[0]);
});

r.delete('/:id', async (req, res) => {
  await q('DELETE FROM documents WHERE id = $1', [req.params.id]);
  res.status(204).end();
});

r.get('/:id/pdf', async (req, res) => {
  const doc = await getDocument({ query: q }, req.params.id);
  if (!doc) return res.status(404).json({ error: 'ไม่พบเอกสาร' });
  res.type('application/pdf').send(await generatePdf(doc));
});

r.post('/:id/send-email', async (req, res) => {
  const doc = await getDocument({ query: q }, req.params.id);
  if (!doc) return res.status(404).json({ error: 'ไม่พบเอกสาร' });
  const to = req.body?.email || doc.customer_email;
  if (!to) return res.status(400).json({ error: 'ไม่มีอีเมลลูกค้า' });
  await sendDocumentEmail(to, doc, await generatePdf(doc));
  res.json({ ok: true });
});
export default r;