import { Router } from 'express';
import { q, tx } from '../db.js';
import { notify } from '../services/docs.js';
import { TODAY, syncOverdue } from '../services/overdue.js';

// API สำหรับพนักงานบัญชีรายจ่าย (AP)
const r = Router();

// อัปเดตสถานะใกล้ครบกำหนด/เกินกำหนดก่อนตอบทุกครั้ง (ใช้ร่วมกับฝั่ง AR)
r.use(async (_req, _res, next) => {
  try { await syncOverdue(); next(); } catch (e) { next(e); }
});

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const near = (a, b) => Math.abs(Number(a || 0) - Number(b || 0)) <= 0.01;
const norm = (s = '') => String(s).replace(/[\s.]/g, '').toLowerCase();

/* ---------- เทียบรายการใบสั่งซื้อ (PO) กับใบแจ้งหนี้ (Invoice) ---------- */
export function compareLines(poItems = [], invItems = []) {
  const used = new Set();
  const lines = [];

  const push = (po, inv) => {
    const qtyPo = po ? Number(po.qty) : null;
    const qtyInv = inv ? Number(inv.qty) : null;
    const pricePo = po ? Number(po.unit_price) : null;
    const priceInv = inv ? Number(inv.unit_price) : null;
    const amountPo = po ? round2(qtyPo * pricePo) : null;
    const amountInv = inv ? round2(qtyInv * priceInv) : null;
    const okQty = po && inv ? near(qtyPo, qtyInv) : false;
    const okPrice = po && inv ? near(pricePo, priceInv) : false;
    const okName = po && inv ? norm(po.description) === norm(inv.description) : false;
    lines.push({
      description: (po || inv)?.description || '',
      qty_po: qtyPo, qty_inv: qtyInv,
      price_po: pricePo, price_inv: priceInv,
      amount_po: amountPo, amount_inv: amountInv,
      ok: !!po && !!inv && okQty && okPrice,
      ok_name: okName,
    });
  };

  // 1) จับคู่ด้วยชื่อรายการก่อน
  poItems.forEach((po) => {
    let j = invItems.findIndex((inv, k) => !used.has(k) && norm(inv.description) === norm(po.description));
    if (j >= 0) { used.add(j); push(po, invItems[j]); return; }
    // 2) ถ้าชื่อไม่ตรง ให้เทียบตามลำดับแถว
    j = invItems.findIndex((_inv, k) => !used.has(k));
    if (j >= 0) { used.add(j); push(po, invItems[j]); return; }
    push(po, null); // PO มีแต่ใบแจ้งหนี้ไม่มี
  });
  invItems.forEach((inv, k) => {
    if (!used.has(k)) push(null, inv); // ใบแจ้งหนี้มีเกินมา
  });

  return lines;
}

function resultOf(lines, po, inv) {
  if (!po) return 'no_reference';
  const allOk = lines.length > 0 && lines.every((l) => l.ok);
  return allOk && near(po.total, inv.total) ? 'matched' : 'mismatch';
}

const notesOf = (lines) => {
  const notes = [];
  lines.forEach((l) => {
    if (l.qty_po == null) notes.push(`มีรายการ "${l.description}" ในใบแจ้งหนี้แต่ไม่มีในใบสั่งซื้อ`);
    else if (l.qty_inv == null) notes.push(`มีรายการ "${l.description}" ในใบสั่งซื้อแต่ไม่มีในใบแจ้งหนี้`);
    else {
      if (!near(l.qty_po, l.qty_inv)) notes.push(`${l.description}: จำนวน PO ${l.qty_po} ≠ ใบแจ้งหนี้ ${l.qty_inv}`);
      if (!near(l.price_po, l.price_inv)) notes.push(`${l.description}: ราคา/หน่วย PO ${l.price_po} ≠ ใบแจ้งหนี้ ${l.price_inv}`);
    }
  });
  if (!notes.length) notes.push('รายการและยอดตรงกับใบสั่งซื้อ');
  return notes;
};

const itemsOf = async (query, ids) =>
  ids.length
    ? (await query('SELECT * FROM document_items WHERE document_id = ANY($1::int[]) ORDER BY id', [ids])).rows
    : [];

const groupItems = (rows) => {
  const m = new Map();
  rows.forEach((x) => {
    if (!m.has(x.document_id)) m.set(x.document_id, []);
    m.get(x.document_id).push(x);
  });
  return m;
};

/* ---------- ค้นหา PO ที่อ้างถึงโดยใบแจ้งหนี้ ---------- */
const PO_OF = `
  SELECT p.id, p.doc_no, p.total, p.subtotal, p.vat, p.issue_date, p.status
  FROM documents p
  WHERE p.doc_type = 'OP'
    AND (p.id = d.ref_doc_id
      OR EXISTS (SELECT 1 FROM document_refs r WHERE r.document_id = d.id AND r.ref_document_id = p.id))
  ORDER BY p.id DESC LIMIT 1`;

/* ---------- สรุปยอดแดชบอร์ดรายจ่าย ---------- */
r.get('/summary', async (_req, res) => {
  const { rows } = await q(`
    SELECT
      COALESCE(SUM(total) FILTER (WHERE status IN ('payment_pending','unpaid','due_soon','slip_review','mismatch','overdue')),0) AS pending_amount,
      COUNT(*) FILTER (WHERE status IN ('payment_pending','unpaid','due_soon','slip_review','mismatch','overdue')) AS pending_count,
      COALESCE(SUM(total) FILTER (WHERE status = 'payment_pending'),0) AS approval_amount,
      COUNT(*) FILTER (WHERE status = 'payment_pending') AS approval_count,
      COALESCE(SUM(total) FILTER (WHERE status = 'paid'
        AND date_trunc('month', paid_at) = date_trunc('month', now())),0) AS paid_amount
    FROM documents WHERE side = 'AP' AND doc_type = 'INV'`);

  const ocr = (await q(
    `SELECT COUNT(*)::int AS n FROM uploads u JOIN users us ON us.id = u.uploaded_by
     WHERE u.status = 'review' AND us.role = 'AP'`)).rows[0];
  const invalid = (await q(
    `SELECT COUNT(*)::int AS n FROM documents WHERE side = 'AP' AND status = 'invalid'`)).rows[0];

  res.json({ ...rows[0], ocr_pending: ocr.n, review_docs: invalid.n });
});

/* ---------- กราฟรายจ่าย 30 วัน ---------- */
r.get('/chart', async (_req, res) => {
  const { rows } = await q(`
    SELECT to_char(d, 'YYYY-MM-DD') AS date,
           COALESCE(i.amt, 0) AS spent,
           COALESCE(p.amt, 0) AS planned
    FROM generate_series(current_date - 29, current_date, interval '1 day') d
    LEFT JOIN (SELECT issue_date, SUM(total) amt FROM documents
               WHERE side = 'AP' AND doc_type = 'INV' GROUP BY 1) i ON i.issue_date = d::date
    LEFT JOIN (SELECT issue_date, SUM(total) amt FROM documents
               WHERE side = 'AP' AND doc_type = 'OP' GROUP BY 1) p ON p.issue_date = d::date
    ORDER BY d`);
  res.json(rows.filter((x) => x.spent > 0 || x.planned > 0));
});

/* ---------- เอกสารใกล้ถึงกำหนดชำระ ---------- */
r.get('/due-soon', async (_req, res) => {
  const { rows } = await q(`
    SELECT d.id, d.doc_no, d.total, d.due_date, d.status, c.name AS customer_name,
           (d.due_date - ${TODAY}) AS days_left
    FROM documents d LEFT JOIN customers c ON c.id = d.customer_id
    WHERE d.side = 'AP' AND d.doc_type = 'INV'
      AND d.status NOT IN ('paid','cancelled')
      AND d.due_date IS NOT NULL
    ORDER BY d.due_date, d.id LIMIT 10`);
  res.json(rows);
});

/* ---------- รายการใบแจ้งหนี้ที่ต้องทำ 2-Way Matching ---------- */
r.get('/matching', async (_req, res) => {
  const { rows } = await q(`
    SELECT d.id, d.doc_no, d.issue_date, d.created_at, d.total AS inv_total,
           d.status, d.check_result, d.customer_id, c.name AS customer_name,
           po.id AS po_id, po.doc_no AS po_no, po.total AS po_total
    FROM documents d
    LEFT JOIN customers c ON c.id = d.customer_id
    LEFT JOIN LATERAL (${PO_OF}) po ON true
    WHERE d.side = 'AP' AND d.doc_type = 'INV'
    ORDER BY d.created_at DESC, d.id DESC LIMIT 300`);

  const ids = [...new Set(rows.flatMap((x) => [x.id, x.po_id]).filter(Boolean))];
  const grouped = groupItems(await itemsOf(q, ids));

  res.json(rows.map((x) => {
    const lines = compareLines(grouped.get(x.po_id) || [], grouped.get(x.id) || []);
    const po = x.po_id ? { total: x.po_total } : null;
    return {
      ...x,
      po_total: x.po_total ?? null,
      result: resultOf(lines, po, { total: x.inv_total }),
      notes: notesOf(lines),
    };
  }));
});

/* ---------- รายละเอียดการเทียบทีละรายการ ---------- */
r.get('/matching/:id', async (req, res) => {
  const inv = (await q(
    `SELECT d.*, c.name AS customer_name, c.address AS customer_address, c.tax_id AS customer_tax_id
     FROM documents d LEFT JOIN customers c ON c.id = d.customer_id
     WHERE d.id = $1 AND d.side = 'AP' AND d.doc_type = 'INV'`, [req.params.id])).rows[0];
  if (!inv) return res.status(404).json({ error: 'ไม่พบใบแจ้งหนี้ฝั่งรายจ่าย' });

  const po = (await q(
    `SELECT p.* FROM documents p WHERE p.doc_type = 'OP'
       AND (p.id = $1 OR EXISTS (SELECT 1 FROM document_refs r
             WHERE r.document_id = $2 AND r.ref_document_id = p.id))
     ORDER BY p.id DESC LIMIT 1`, [inv.ref_doc_id, inv.id])).rows[0] || null;

  const grouped = groupItems(await itemsOf(q, [inv.id, po?.id].filter(Boolean)));
  const poItems = grouped.get(po?.id) || [];
  const invItems = grouped.get(inv.id) || [];
  const lines = compareLines(poItems, invItems);

  res.json({
    invoice: { ...inv, items: invItems },
    po: po ? { ...po, items: poItems } : null,
    lines,
    result: resultOf(lines, po, inv),
    notes: notesOf(lines),
  });
});

/* ---------- อนุมัติจ่าย ---------- */
r.post('/matching/:id/approve', async (req, res) => {
  const out = await tx(async (c) => {
    const inv = (await c.query(
      `SELECT * FROM documents WHERE id = $1 AND side = 'AP' AND doc_type = 'INV' FOR UPDATE`,
      [req.params.id])).rows[0];
    if (!inv) throw Object.assign(new Error('ไม่พบใบแจ้งหนี้'), { status: 404 });
    if (!['payment_pending', 'mismatch'].includes(inv.status)) {
      throw Object.assign(new Error('ใบแจ้งหนี้นี้ถูกอนุมัติหรือชำระไปแล้ว'), { status: 409 });
    }

    const po = (await c.query(
      `SELECT * FROM documents p WHERE p.doc_type = 'OP'
         AND (p.id = $1 OR EXISTS (SELECT 1 FROM document_refs r
               WHERE r.document_id = $2 AND r.ref_document_id = p.id))
       ORDER BY p.id DESC LIMIT 1`, [inv.ref_doc_id, inv.id])).rows[0] || null;

    const grouped = groupItems(await itemsOf((t, p) => c.query(t, p), [inv.id, po?.id].filter(Boolean)));
    const lines = compareLines(grouped.get(po?.id) || [], grouped.get(inv.id) || []);
    if (resultOf(lines, po, inv) !== 'matched') {
      throw Object.assign(new Error('ยังอนุมัติไม่ได้: ' + notesOf(lines).join('; ')), { status: 400 });
    }

    const { rows } = await c.query(
      `UPDATE documents SET status = 'unpaid', status_reason = NULL,
              approved_at = now(), approved_by = $2, updated_at = now()
       WHERE id = $1 RETURNING *`, [inv.id, req.user.id]);
    await notify(c, `อนุมัติจ่าย ${inv.doc_no} ยอด ${Number(inv.total).toLocaleString('th-TH')} บาท`, `/verify`);
    return rows[0];
  });
  res.json(out);
});

/* ---------- แจ้งแก้ไขการตรวจสอบ ---------- */
r.post('/matching/:id/request-fix', async (req, res) => {
  const reason = String(req.body?.reason || '').trim();
  const out = await tx(async (c) => {
    const inv = (await c.query(
      `SELECT * FROM documents WHERE id = $1 AND side = 'AP' AND doc_type = 'INV' FOR UPDATE`,
      [req.params.id])).rows[0];
    if (!inv) throw Object.assign(new Error('ไม่พบใบแจ้งหนี้'), { status: 404 });
    const { rows } = await c.query(
      `UPDATE documents SET status = 'mismatch', status_reason = $2, updated_at = now()
       WHERE id = $1 RETURNING *`,
      [inv.id, reason || 'แจ้งแก้ไข: ข้อมูลไม่ตรงกับใบสั่งซื้อ']);
    await notify(c, `แจ้งแก้ไข ${inv.doc_no}: ${reason || 'ข้อมูลไม่ตรงกับใบสั่งซื้อ'}`, `/verify`);
    return rows[0];
  });
  res.json(out);
});

export default r;
