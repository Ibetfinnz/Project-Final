import { Router } from 'express';
import { q, tx } from '../db.js';
import { calcTotals, createDocument, getDocument, initialStatus, prepareBilling, recheckDocument, recordHistory, statusText, OUTSTANDING } from '../services/docs.js';
import { generatePdf } from '../services/pdf.js';
import { sendDocumentEmail } from '../services/mailer.js';

const r = Router();

// กติกาการอ้างอิง: เอกสารที่กำลังสร้าง -> ประเภทต้นทางที่เลือกได้
const SOURCES = { INV: ['OP'], BN: ['INV'], RC: ['INV', 'BN'] };
// ต้นทางที่ "ถูกอ้างอิงโดยประเภทเหล่านี้แล้ว" จะไม่แสดงให้เลือกอีก
const EXCLUDED_BY = { INV: ['INV'], BN: ['BN', 'RC'], RC: ['RC', 'BN'] };

// ฝั่งเอกสารที่ผู้ใช้เห็น: AP เห็นเฉพาะรายจ่าย, AR เห็นเฉพาะรายรับ, EXEC ดูได้ทั้งสอง
export const sideOf = (user) =>
  user?.role === 'AP' ? 'AP' : user?.role === 'EXEC' ? null : 'AR';

r.get('/', async (req, res) => {
  const { type, status, customer, q: search, exclude_paid } = req.query;
  const w = [], p = [];
  const side = sideOf(req.user) || (req.query.side === 'AP' ? 'AP' : req.query.side === 'AR' ? 'AR' : null);
  if (side) { p.push(side); w.push(`d.side = $${p.length}`); }
  if (type) { p.push(type); w.push(`d.doc_type = $${p.length}`); }
  if (status) { p.push(status); w.push(`d.status = $${p.length}`); }
  if (customer) { p.push(customer); w.push(`d.customer_id = $${p.length}`); }
  if (search) { p.push(`%${search}%`); w.push(`(d.doc_no ILIKE $${p.length} OR c.name ILIKE $${p.length})`); }
  // ซ่อนเอกสารที่ชำระแล้วออกจากรายการหลัก (ดูได้ที่หน้า "เอกสารที่ชำระแล้ว")
  if (exclude_paid === '1' && !status) w.push(`d.status <> 'paid'`);
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
  const { type, customer, doc } = req.query;
  const src = SOURCES[type];
  if (!src) return res.json([]);

  const p = [src, EXCLUDED_BY[type]];
  let extra = ` AND d.side = $3`;
  p.push(sideOf(req.user) || 'AR');
  if (customer) { p.push(customer); extra += ` AND d.customer_id = $${p.length}`; }
  if (type === 'BN') { p.push(OUTSTANDING); extra += ` AND d.status::text = ANY($${p.length})`; }
  // ตอนแก้ไขเอกสาร: ต้องเห็นเอกสารที่ตัวเองอ้างอิงอยู่ด้วยจึงจะเลือกคงไว้ได้
  p.push(doc ? Number(doc) : null);
  const keep = ` AND ($${p.length}::int IS NULL OR x.id <> $${p.length})`;

  const { rows } = await q(
    `SELECT d.id, d.doc_no, d.doc_type, d.customer_id, d.issue_date, d.due_date,
            d.subtotal, d.vat, d.total, d.status, c.name AS customer_name
     FROM documents d LEFT JOIN customers c ON c.id = d.customer_id
     WHERE d.doc_type::text = ANY($1) ${extra}
       AND NOT EXISTS (SELECT 1 FROM documents x
                       WHERE x.doc_type::text = ANY($2) AND x.ref_doc_id = d.id${keep})
       AND NOT EXISTS (SELECT 1 FROM document_refs r JOIN documents x ON x.id = r.document_id
                       WHERE r.ref_document_id = d.id AND x.doc_type::text = ANY($2)${keep})
     ORDER BY d.issue_date, d.id`, p);
  res.json(rows);
});

// เอกสารที่ชำระแล้ว: รวมเอกสารที่เชื่อมโยงกันเป็นชุดเดียว (ใช้กับหน้า "เอกสารที่ชำระแล้ว")
// ต้องอยู่ก่อน '/:id'
r.get('/paid-groups', async (req, res) => {
  // EXEC เห็นทั้งสองฝั่ง (ไม่ระบุ side) ส่วน AR/AP ถูกจำกัดด้วย sideOf()
  const side = sideOf(req.user) || (req.query.side === 'AP' ? 'AP' : req.query.side === 'AR' ? 'AR' : null);
  const docsSql = `
    SELECT d.id, d.doc_no, d.doc_type, d.side, d.status, d.issue_date, d.due_date,
           d.subtotal, d.total, d.customer_id, c.name AS customer_name
    FROM documents d LEFT JOIN customers c ON c.id = d.customer_id
    ${side ? 'WHERE d.side = $1' : ''}
    ORDER BY d.issue_date DESC, d.id DESC`;
  const { rows: docs } = await q(docsSql, side ? [side] : []);
  const { rows: edges } = await q(
    `SELECT document_id AS a, ref_document_id AS b FROM document_refs
     UNION
     SELECT id, ref_doc_id FROM documents WHERE ref_doc_id IS NOT NULL`);

  const ids = new Set(docs.map((d) => d.id));
  const adj = new Map(docs.map((d) => [d.id, new Set()]));
  for (const e of edges) {
    if (!ids.has(e.a) || !ids.has(e.b)) continue;
    adj.get(e.a).add(e.b);
    adj.get(e.b).add(e.a);
  }
  const byId = new Map(docs.map((d) => [d.id, d]));

  const ORDER = { QT: 1, OP: 2, INV: 3, BN: 4, PAY: 5, RC: 6, TX: 6 };
  const visited = new Set();
  const groups = [];

  for (const start of docs) {
    if (start.status !== 'paid' || visited.has(start.id)) continue;

    // ไล่เอกสารทั้งชุดที่เชื่อมโยงกัน (สองทิศทาง)
    const comp = [];
    const queue = [start.id];
    visited.add(start.id);
    while (queue.length) {
      const cur = queue.pop();
      comp.push(cur);
      for (const next of adj.get(cur) || []) {
        if (!visited.has(next)) { visited.add(next); queue.push(next); }
      }
    }

    const members = comp.map((id) => byId.get(id)).filter(Boolean);
    const paid = members.filter((m) => m.status === 'paid');
    if (!paid.length) continue;

    // เอกสารหลักของชุด: ใบเสร็จ > ใบวางบิล > ใบแจ้งหนี้ > ใบสั่งซื้อ > ใบเสนอราคา
    paid.sort((a, b) =>
      (ORDER[b.doc_type] || 0) - (ORDER[a.doc_type] || 0) ||
      String(b.issue_date).localeCompare(String(a.issue_date)) || b.id - a.id);
    const anchor = paid[0];

    const ordered = [...members].sort((a, b) =>
      (ORDER[a.doc_type] || 99) - (ORDER[b.doc_type] || 99) ||
      String(a.issue_date).localeCompare(String(b.issue_date)) || a.id - b.id);

    groups.push({
      id: 'g' + anchor.id,
      anchor: {
        id: anchor.id, doc_no: anchor.doc_no, doc_type: anchor.doc_type, side: anchor.side,
        status: anchor.status, issue_date: anchor.issue_date, due_date: anchor.due_date,
        total: Number(anchor.total), customer_id: anchor.customer_id, customer_name: anchor.customer_name,
      },
      total: Number(anchor.total),
      count: members.length,
      docs: ordered.map((m) => ({
        id: m.id, doc_no: m.doc_no, doc_type: m.doc_type, status: m.status,
        issue_date: m.issue_date, due_date: m.due_date, total: Number(m.total),
      })),
    });
  }

  groups.sort((a, b) =>
    String(b.anchor.issue_date).localeCompare(String(a.anchor.issue_date)) || b.anchor.id - a.anchor.id);
  res.json(groups);
});

r.get('/:id', async (req, res) => {
  const doc = await getDocument({ query: q }, req.params.id);
  if (!doc) return res.status(404).json({ error: 'ไม่พบเอกสาร' });
  res.json(doc);
});

r.post('/', async (req, res) => {
  const b = req.body || {};
  const side = sideOf(req.user) || (b.side === 'AP' ? 'AP' : 'AR');
  if (!['QT', 'OP', 'INV', 'BN', 'RC'].includes(b.doc_type)) return res.status(400).json({ error: 'ประเภทเอกสารไม่ถูกต้อง' });
  if (side === 'AP' && b.doc_type !== 'OP') {
    return res.status(403).json({ error: 'พนักงานบัญชีรายจ่ายสร้างได้เฉพาะใบสั่งซื้อ (PO)' });
  }
  if (!b.customer_id) return res.status(400).json({ error: 'กรุณาเลือกลูกค้า' });
  // ใบวางบิลใช้ invoice_ids แทนรายการสินค้า
  if (b.doc_type !== 'BN' && (!Array.isArray(b.items) || !b.items.some((i) => i.description && Number(i.qty) > 0))) {
    return res.status(400).json({ error: 'กรุณาเพิ่มรายการสินค้าอย่างน้อย 1 รายการ' });
  }

  let doc;
  try {
    doc = await tx(async (c) => {
      const extra = b.doc_type === 'BN' ? await prepareBilling(c, b) : {};
      return createDocument(c, { ...b, ...extra, side, created_by: req.user.id });
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

// แก้ไขข้อมูลในเอกสารได้ทั้งหมด (ยกเว้นเลขที่/ประเภท/ฝั่ง)
// รองรับ: ลูกค้า/คู่ค้า, วันที่ออก, วันครบกำหนด, สถานะ, หมายเหตุ,
//         ภาษีมูลค่าเพิ่ม, รายการสินค้า/บริการ และเอกสารอ้างอิง (BN = ใบแจ้งหนี้ที่วางบิล)
r.put('/:id', async (req, res) => {
  const b = req.body || {};
  const side = sideOf(req.user);

  let full;
  try {
    const saved = await tx(async (c) => {
      const cur = (await c.query('SELECT * FROM documents WHERE id = $1 FOR UPDATE', [req.params.id])).rows[0];
      if (!cur) throw Object.assign(new Error('ไม่พบเอกสาร'), { httpStatus: 404 });
      if (side && cur.side !== side) throw Object.assign(new Error('ไม่มีสิทธิ์แก้ไขเอกสารฝั่งนี้'), { httpStatus: 403 });

      // เก็บค่าเดิมไว้เทียบความเปลี่ยนแปลงเพื่อบันทึกประวัติ
      const oldItems = (await c.query(
        'SELECT description, qty, unit_price, amount FROM document_line_items WHERE document_id = $1 ORDER BY id', [cur.id]
      )).rows;
      const oldCustomer = (await c.query('SELECT name FROM customers WHERE id = $1', [cur.customer_id])).rows[0]?.name || null;
      const oldInvNos = cur.doc_type === 'BN'
        ? (await c.query(
          `SELECT x.doc_no FROM document_refs r JOIN documents x ON x.id = r.ref_document_id
           WHERE r.document_id = $1 ORDER BY x.issue_date, x.id`, [cur.id]
        )).rows.map((r) => r.doc_no).join(', ')
        : null;

      const customerId = b.customer_id ?? cur.customer_id;
      const issueDate = b.issue_date ?? cur.issue_date;
      const dueDate = b.due_date !== undefined ? (b.due_date || null) : cur.due_date;
      const status = b.status || cur.status;
      const statusReason = b.status_reason !== undefined ? (b.status_reason || null) : cur.status_reason;

      let subtotal = Number(cur.subtotal);
      let vat = Number(cur.vat);
      let total = Number(cur.total);
      let refText = cur.ref_text;
      let refDocId = cur.ref_doc_id;

      if (cur.doc_type === 'BN') {
        // ใบวางบิล: เปลี่ยนชุดใบแจ้งหนี้ที่วางบิลได้ (เว้นว่าง = คงของเดิม)
        if (Array.isArray(b.invoice_ids) && b.invoice_ids.length) {
          const extra = await prepareBilling(c, { invoice_ids: b.invoice_ids, customer_id: customerId }, cur.id);
          subtotal = extra.precomputed.subtotal;
          vat = extra.precomputed.vat;
          total = extra.precomputed.total;
          refText = extra.ref_text;
          await c.query('DELETE FROM document_line_items WHERE document_id = $1', [cur.id]);
          for (const l of extra.precomputed.lines) {
            await c.query(
              'INSERT INTO document_line_items(document_id, description, qty, unit_price, amount) VALUES ($1,$2,$3,$4,$5)',
              [cur.id, l.description, l.qty, l.unit_price, l.amount]
            );
          }
          await c.query('DELETE FROM document_refs WHERE document_id = $1', [cur.id]);
          for (const rid of extra.link_ids) {
            await c.query(
              'INSERT INTO document_refs(document_id, ref_document_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
              [cur.id, rid]
            );
          }
        } else if (String(customerId) !== String(cur.customer_id)) {
          throw Object.assign(new Error('กรุณาเลือกใบแจ้งหนี้ใหม่เมื่อเปลี่ยนลูกค้า'), { status: 400 });
        }
      } else {
        // เอกสารทั่วไป: แก้รายการ/ภาษีได้
        let lines = null;
        if (Array.isArray(b.items)) {
          lines = b.items;
        } else if (b.vat_enabled !== undefined) {
          lines = (await c.query(
            'SELECT description, qty, unit_price FROM document_line_items WHERE document_id = $1 ORDER BY id',
            [cur.id]
          )).rows;
        }
        if (lines) {
          const vatEnabled = b.vat_enabled !== undefined ? !!b.vat_enabled : Number(cur.vat) > 0;
          const t = calcTotals(lines.filter((l) => String(l.description || '').trim()), vatEnabled);
          if (!t.lines.length) throw Object.assign(new Error('กรุณาเพิ่มรายการสินค้าอย่างน้อย 1 รายการ'), { status: 400 });
          subtotal = t.subtotal;
          vat = t.vat;
          total = t.total;
          await c.query('DELETE FROM document_line_items WHERE document_id = $1', [cur.id]);
          for (const l of t.lines) {
            await c.query(
              'INSERT INTO document_line_items(document_id, description, qty, unit_price, amount) VALUES ($1,$2,$3,$4,$5)',
              [cur.id, l.description, l.qty, l.unit_price, l.amount]
            );
          }
        }

        // เอกสารอ้างอิงเดี่ยว (INV/RC)
        if (b.ref_text !== undefined) {
          refText = b.ref_text ? String(b.ref_text).trim() : null;
          refDocId = null;
          if (refText) {
            const rr = await c.query('SELECT id FROM documents WHERE doc_no = $1', [refText]);
            if (!rr.rows[0]) throw Object.assign(new Error('ไม่พบเอกสารอ้างอิง ' + refText), { status: 400 });
            refDocId = rr.rows[0].id;
          }
          await c.query('DELETE FROM document_refs WHERE document_id = $1', [cur.id]);
          if (refDocId) {
            await c.query(
              'INSERT INTO document_refs(document_id, ref_document_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
              [cur.id, refDocId]
            );
          }
        }
      }

      const { rows } = await c.query(
        `UPDATE documents SET
           customer_id = $1, issue_date = $2, due_date = $3, status = $4, status_reason = $5,
           subtotal = $6, vat = $7, total = $8, ref_text = $9, ref_doc_id = $10,
           paid_at = CASE WHEN $4 = 'paid' AND paid_at IS NULL THEN now() ELSE paid_at END,
           updated_at = now()
         WHERE id = $11 RETURNING *`,
        [customerId, issueDate, dueDate, status, statusReason, subtotal, vat, total, refText, refDocId, cur.id]
      );

      // ตรวจกับเอกสารอ้างอิงใหม่จากข้อมูลจริง (กันผลตรวจเดิมค้างหลังแก้ไข)
      const check = await recheckDocument(c, cur.id);
      let healedTo = null;
      if (check?.result === 'matched' && status === 'invalid') {
        healedTo = initialStatus(cur.doc_type, cur.side);
        // ล้างหมายเหตุเฉพาะข้อความที่ระบบสร้างไว้ ไม่ลบหมายเหตุที่ผู้ใช้พิมพ์เอง
        const autoNotes = Array.isArray(cur.check_notes) ? cur.check_notes : [];
        const nextReason = statusReason && !autoNotes.includes(statusReason) ? statusReason : null;
        await c.query(
          'UPDATE documents SET status = $1, status_reason = $2, updated_at = now() WHERE id = $3',
          [healedTo, nextReason, cur.id]
        );
      }

      // ---------- บันทึกประวัติการแก้ไข (เฉพาะช่องที่เปลี่ยนจริง) ----------
      const newItems = (await c.query(
        'SELECT description, qty, unit_price, amount FROM document_line_items WHERE document_id = $1 ORDER BY id', [cur.id]
      )).rows;
      const dt = (v) => (v ? String(v).slice(0, 10) : '-');
      const money = (v) => Number(v || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const norm = (list) => JSON.stringify(list.map((i) => [
        String(i.description || '').trim(), Number(i.qty) || 0, Number(i.unit_price) || 0,
      ]));
      const changes = [];

      if (healedTo) {
        changes.push(`ตรวจสอบกับเอกสารอ้างอิงใหม่แล้ว: ข้อมูลตรงกัน (เปลี่ยนสถานะ: ${statusText(status)} → ${statusText(healedTo)})`);
      }

      if (status !== cur.status) changes.push(`เปลี่ยนสถานะ: ${statusText(cur.status)} → ${statusText(status)}`);
      if (String(customerId) !== String(cur.customer_id)) {
        const newCustomer = (await c.query('SELECT name FROM customers WHERE id = $1', [customerId])).rows[0]?.name || '-';
        changes.push(`เปลี่ยน${cur.side === 'AP' ? 'คู่ค้า' : 'ลูกค้า'}: ${oldCustomer || '-'} → ${newCustomer}`);
      }
      if (dt(issueDate) !== dt(cur.issue_date)) changes.push(`เปลี่ยนวันที่ออกเอกสาร: ${dt(cur.issue_date)} → ${dt(issueDate)}`);
      if (dt(dueDate) !== dt(cur.due_date)) changes.push(`เปลี่ยนวันครบกำหนด: ${dt(cur.due_date)} → ${dt(dueDate)}`);
      if (cur.doc_type === 'BN') {
        if ((oldInvNos || '') !== (refText || '')) changes.push(`เปลี่ยนใบแจ้งหนี้ที่วางบิล: ${oldInvNos || '-'} → ${refText || '-'}`);
      } else if ((cur.ref_text || '') !== (refText || '')) {
        changes.push(`เปลี่ยนเอกสารอ้างอิง: ${cur.ref_text || '-'} → ${refText || '-'}`);
      }
      if (norm(oldItems) !== norm(newItems)) {
        changes.push(oldItems.length === newItems.length
          ? `แก้ไขรายการสินค้าและบริการ (${newItems.length} รายการ)`
          : `แก้ไขรายการสินค้าและบริการ (${oldItems.length} → ${newItems.length} รายการ)`);
      }
      if (Number(cur.total) !== Number(total)) changes.push(`ปรับยอดรวม: ${money(cur.total)} → ${money(total)} บาท`);
      if ((Number(cur.vat) > 0) !== (Number(vat) > 0)) changes.push(Number(vat) > 0 ? 'เปิดภาษีมูลค่าเพิ่ม 7%' : 'ปิดภาษีมูลค่าเพิ่ม 7%');
      if ((cur.status_reason || '') !== (statusReason || '')) changes.push('แก้ไขหมายเหตุ');

      if (changes.length) await recordHistory(c, cur.id, req.user.id, changes.join(' · '));

      return rows[0];
    });
    full = await getDocument({ query: q }, saved.id);
  } catch (e) {
    if (e.httpStatus) return res.status(e.httpStatus).json({ error: e.message });
    if (e.status) return res.status(e.status).json({ error: e.message });
    if (e.code === '23505') return res.status(409).json({ error: 'เลขที่เอกสารนี้ถูกใช้แล้ว' });
    throw e;
  }
  res.json(full);
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