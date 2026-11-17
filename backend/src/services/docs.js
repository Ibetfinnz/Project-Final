export const INITIAL_STATUS = {
  QT: 'pending_approval',
  OP: 'wait_invoice',
  INV: 'unpaid',
  BN: 'unpaid',
  RC: 'paid',
  TX: 'paid',
};

// สถานะเริ่มต้นของเอกสาร แยกตามฝั่ง AR (รายรับ) / AP (รายจ่าย)
export function initialStatus(type, side = 'AR') {
  if (side === 'AP') {
    if (type === 'OP') return 'po_wait_invoice'; // รอรับใบแจ้งหนี้จากผู้ขาย
    if (type === 'INV') return 'payment_pending'; // รออนุมัติจ่าย
  }
  return INITIAL_STATUS[type];
}

// ใบแจ้งหนี้ที่วางบิลได้ = ยังค้างชำระ
export const OUTSTANDING = ['unpaid', 'due_soon', 'overdue'];

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const bad = (message) => Object.assign(new Error(message), { status: 400 });

// ป้ายชื่อสถานะสำหรับข้อความในประวัติการแก้ไข
export const STATUS_LABEL = {
  pending_approval: 'รออนุมัติ',
  po_wait_invoice: 'รอรับใบแจ้งหนี้',
  po_invoiced: 'ได้รับใบแจ้งหนี้แล้ว',
  payment_pending: 'รออนุมัติจ่าย',
  cancelled: 'ยกเลิก',
  incomplete: 'ยังไม่ครบถ้วน',
  approved: 'ได้รับอนุมัติแล้ว',
  rejected: 'ไม่ได้รับการอนุมัติ',
  wait_invoice: 'รอทำใบแจ้งหนี้',
  invoiced: 'ทำใบแจ้งหนี้แล้ว',
  invalid: 'ข้อมูลไม่ถูกต้อง',
  unpaid: 'รอชำระ',
  due_soon: 'ใกล้ครบกำหนดชำระ',
  slip_review: 'รอตรวจสอบสลิป',
  mismatch: 'ข้อมูลไม่ตรง',
  overdue: 'เกินกำหนด',
  paid: 'ชำระแล้ว',
};
export const statusText = (s) => STATUS_LABEL[s] || s || '-';

// ตรวจเอกสารกับเอกสารอ้างอิงอีกครั้งจากข้อมูลจริงในฐานข้อมูล
// ใช้หลังแก้ไขเอกสาร เพื่อไม่ให้ผลตรวจเดิม (check_result/check_notes) ค้างอยู่
export async function recheckDocument(c, id) {
  const doc = (await c.query('SELECT * FROM documents WHERE id = $1', [id])).rows[0];
  if (!doc) return null;
  const near = (a, b) => Math.abs(Number(a || 0) - Number(b || 0)) <= 0.01;
  const notes = [];
  let result = 'no_reference';

  if (doc.doc_type === 'BN') {
    // ใบวางบิล: เทียบผลรวมกับใบแจ้งหนี้ที่วางบิลทั้งหมด
    const { rows: invs } = await c.query(
      `SELECT x.id, x.doc_no, x.total, x.customer_id
       FROM document_refs r JOIN documents x ON x.id = r.ref_document_id
       WHERE r.document_id = $1 AND x.doc_type = 'INV' ORDER BY x.id`, [id]);
    if (!invs.length) {
      notes.push('ไม่พบใบแจ้งหนี้ที่วางบิล');
    } else {
      if (doc.customer_id && invs.some((x) => String(x.customer_id) !== String(doc.customer_id))) {
        notes.push('มีใบแจ้งหนี้ของลูกค้าคนละราย');
      }
      const sum = round2(invs.reduce((s, x) => s + Number(x.total || 0), 0));
      if (!near(sum, doc.total)) notes.push(`ผลรวมใบแจ้งหนี้ ${sum} ต่างจากใบวางบิล ${doc.total}`);
      result = notes.length ? 'mismatch' : 'matched';
    }
  } else if (['INV', 'RC', 'TX'].includes(doc.doc_type)) {
    // ใบแจ้งหนี้/ใบเสร็จ: เทียบกับเอกสารต้นทาง (INV -> OP, RC/TX -> INV/BN)
    const types = doc.doc_type === 'INV' ? ['OP'] : ['INV', 'BN'];
    let ref = null;
    if (doc.ref_doc_id) {
      ref = (await c.query(
        'SELECT * FROM documents WHERE id = $1 AND doc_type = ANY($2)', [doc.ref_doc_id, types])).rows[0] || null;
    }
    if (!ref && doc.ref_text) {
      ref = (await c.query(
        'SELECT * FROM documents WHERE doc_no = $1 AND doc_type = ANY($2)', [doc.ref_text, types])).rows[0] || null;
    }
    if (!ref) {
      notes.push('ไม่พบเอกสารอ้างอิง');
    } else {
      if (!near(ref.total, doc.total)) notes.push(`ยอด ${doc.total} ต่างจาก ${ref.doc_no} (${ref.total})`);
      if (doc.customer_id && ref.customer_id && String(ref.customer_id) !== String(doc.customer_id)) {
        notes.push(`ลูกค้าไม่ตรงกับ ${ref.doc_no}`);
      }
      result = notes.length ? 'mismatch' : 'matched';
    }
  } else {
    return null; // QT/OP ไม่มีเอกสารก่อนหน้าให้ตรวจ
  }

  await c.query('UPDATE documents SET check_result = $2, check_notes = $3 WHERE id = $1',
    [id, result, JSON.stringify(notes)]);
  return { result, notes };
}

// บันทึกประวัติ (ใช้ทั้งตอนสร้างและตอนแก้ไข)
export async function recordHistory(c, documentId, byUser, text, action = 'edited') {
  await c.query(
    'INSERT INTO document_history(document_id, action, text, by_user) VALUES ($1,$2,$3,$4)',
    [documentId, action, text, byUser || null]
  );
}

// คำนวณยอดฝั่งเซิร์ฟเวอร์เสมอ ไม่เชื่อค่าจาก Frontend/OCR
export function calcTotals(items = [], vatEnabled = true) {
  const lines = items.map((i) => ({
    description: String(i.description || '').trim(),
    qty: Number(i.qty) || 0,
    unit_price: Number(i.unit_price) || 0,
  }));
  lines.forEach((l) => (l.amount = round2(l.qty * l.unit_price)));
  const subtotal = round2(lines.reduce((s, l) => s + l.amount, 0));
  const vat = vatEnabled ? round2(subtotal * 0.07) : 0;
  return { lines, subtotal, vat, total: round2(subtotal + vat) };
}

// เลขเอกสาร เช่น QT-2569-0088 (ใช้ upsert + RETURNING กันเลขซ้ำเมื่อมีหลาย request พร้อมกัน)
export async function nextDocNo(c, type) {
  const year = new Date().getFullYear() + 543;
  const { rows } = await c.query(
    `INSERT INTO doc_counters(doc_type, year, last_no) VALUES ($1,$2,1)
     ON CONFLICT (doc_type, year) DO UPDATE SET last_no = doc_counters.last_no + 1
     RETURNING last_no`,
    [type, year]
  );
  return `${type}-${year}-${String(rows[0].last_no).padStart(4, '0')}`;
}

/**
 * เตรียมข้อมูลใบวางบิลจากใบแจ้งหนี้ที่เลือก (ตรวจสอบฝั่งเซิร์ฟเวอร์ทั้งหมด)
 * - ต้องเป็น INV ของลูกค้าคนเดียวกัน, ยังค้างชำระ, และยังไม่ถูก BN/RC อื่นอ้างอิง
 * - ยอดรวม = ผลรวมของแต่ละใบ (ไม่คิด VAT ซ้ำ)
 */
export async function prepareBilling(c, b, excludeDocId = null) {
  const ids = [...new Set((b.invoice_ids || []).map(Number).filter(Boolean))];
  if (!ids.length) throw bad('กรุณาเลือกใบแจ้งหนี้อย่างน้อย 1 ใบ');

  // ล็อกแถวไว้ กันสร้างใบวางบิลซ้อนกันสองคนพร้อมกัน
  const { rows: invs } = await c.query(
    'SELECT * FROM documents WHERE id = ANY($1::int[]) ORDER BY issue_date, id FOR UPDATE', [ids]);
  if (invs.length !== ids.length) throw bad('ไม่พบใบแจ้งหนี้บางรายการ');

  for (const i of invs) {
    if (i.doc_type !== 'INV') throw bad(`${i.doc_no} ไม่ใช่ใบแจ้งหนี้`);
    if (String(i.customer_id) !== String(b.customer_id)) throw bad(`${i.doc_no} ไม่ใช่ของลูกค้ารายนี้`);
    if (!OUTSTANDING.includes(i.status)) throw bad(`${i.doc_no} ไม่อยู่ในสถานะค้างชำระ`);
  }

  const used = await c.query(
    `SELECT d.doc_no FROM documents d
     WHERE d.id = ANY($1::int[])
       AND (EXISTS (SELECT 1 FROM documents x WHERE x.doc_type::text IN ('BN','RC') AND x.ref_doc_id = d.id
                    AND ($2::int IS NULL OR x.id <> $2))
         OR EXISTS (SELECT 1 FROM document_refs r JOIN documents x ON x.id = r.document_id
                    WHERE r.ref_document_id = d.id AND x.doc_type::text IN ('BN','RC')
                    AND ($2::int IS NULL OR x.id <> $2)))`,
    [ids, excludeDocId]
  );
  if (used.rows.length) {
    throw bad(`${used.rows.map((r) => r.doc_no).join(', ')} ถูกอ้างอิงโดยใบวางบิลหรือใบเสร็จอื่นแล้ว`);
  }

  const sum = (k) => round2(invs.reduce((s, i) => s + Number(i[k] || 0), 0));
  const subtotal = sum('subtotal');
  const vat = sum('vat');
  return {
    link_ids: invs.map((i) => i.id),
    ref_text: invs.map((i) => i.doc_no).join(', '),
    precomputed: {
      // 1 บรรทัดต่อใบแจ้งหนี้ (จำนวนเงิน = ยอดก่อน VAT ของใบนั้น)
      lines: invs.map((i) => ({ description: i.doc_no, qty: 1, unit_price: i.subtotal, amount: i.subtotal })),
      subtotal, vat, total: round2(subtotal + vat),
    },
  };
}

export async function createDocument(c, d) {
  const t = d.precomputed || calcTotals(d.items, d.vat_enabled !== false);
  const docNo = d.doc_no || (await nextDocNo(c, d.doc_type));

  // อ้างอิงเอกสารเดียว (ใช้กับ INV/RC ฯลฯ) — ใบวางบิลใช้ link_ids แทน
  let refDocId = null;
  if (d.ref_text && !d.link_ids) {
    const r = await c.query('SELECT id FROM documents WHERE doc_no = $1', [d.ref_text.trim()]);
    refDocId = r.rows[0]?.id ?? null;
  }

  const { rows } = await c.query(
    `INSERT INTO documents
      (doc_type, doc_no, ref_doc_id, ref_text, customer_po, customer_id, issue_date, due_date,
       subtotal, vat, total, status, status_reason, source, source_ref, file_path, paid_at, created_by,
       side, payment_terms)
     VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7,CURRENT_DATE),$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
     RETURNING *`,
    [
      d.doc_type, docNo, refDocId, d.ref_text || null, d.customer_po || null, d.customer_id || null,
      d.issue_date || null, d.due_date || null, t.subtotal, t.vat, t.total,
      d.status || initialStatus(d.doc_type, d.side), d.status_reason || null,
      d.source || 'manual', d.source_ref || null, d.file_path || null,
      d.doc_type === 'RC' ? new Date() : null, d.created_by || null,
      d.side || 'AR', d.payment_terms || null,
    ]
  );
  const doc = rows[0];
  for (const l of t.lines) {
    await c.query(
      'INSERT INTO document_line_items(document_id, description, qty, unit_price, amount) VALUES ($1,$2,$3,$4,$5)',
      [doc.id, l.description, l.qty, l.unit_price, l.amount]
    );
  }

  // บันทึกการเชื่อมเอกสารในตาราง document_refs (ใบวางบิลได้หลายใบ)
  const linkIds = d.link_ids || (refDocId ? [refDocId] : []);
  for (const id of linkIds) {
    await c.query(
      'INSERT INTO document_refs(document_id, ref_document_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [doc.id, id]
    );
  }

  // อัปเดตสถานะเอกสารต้นทางตามสายเอกสาร QT -> OP -> INV
  if (refDocId) {
    const link = d.doc_type === 'INV' && d.side === 'AP'
      ? ['OP', 'po_invoiced'] // ฝั่ง AP: ได้รับใบแจ้งหนี้จากผู้ขายแล้ว
      : { OP: ['QT', 'approved'], INV: ['OP', 'invoiced'] }[d.doc_type];
    if (link) {
      await c.query(
        `UPDATE documents SET status = $1, updated_at = now() WHERE id = $2 AND doc_type = $3`,
        [link[1], refDocId, link[0]]
      );
    }
  }

  // ออกใบเสร็จ = ชำระแล้ว: ปิดทั้งสายเอกสาร (ใบสั่งซื้อ/ใบแจ้งหนี้/ใบวางบิล ในชุดเดียวกัน)
  if (['RC', 'TX'].includes(d.doc_type) && linkIds.length) {
    await c.query(
      `WITH RECURSIVE edges AS (
         SELECT document_id AS a, ref_document_id AS b FROM document_refs
         UNION
         SELECT id, ref_doc_id FROM documents WHERE ref_doc_id IS NOT NULL
       ),
       rel(id) AS (
         SELECT unnest($1::int[])
         UNION
         SELECT CASE WHEN e.a = r.id THEN e.b ELSE e.a END
         FROM edges e JOIN rel r ON e.a = r.id OR e.b = r.id
       )
       UPDATE documents SET status = 'paid', paid_at = COALESCE(paid_at, now()), updated_at = now()
       WHERE id IN (SELECT id FROM rel)
         AND doc_type IN ('OP', 'INV', 'BN') AND status <> 'paid'`,
      [linkIds]
    );
  }

  // ประวัติ: บันทึกการสร้างเอกสาร
  await recordHistory(c, doc.id, d.created_by, `สร้างเอกสาร ${docNo}`, 'created');
  return doc;
}

// ลำดับขั้นของสายเอกสารที่แสดงในแท็บ "การเชื่อมต่อเอกสาร"
const CHAIN_ORDER = { QT: 1, OP: 2, INV: 3, BN: 4, PAY: 5, RC: 6, TX: 6 };

export async function getDocument(c, id) {
  const { rows } = await c.query(
    `SELECT d.*, c.name AS customer_name, c.address AS customer_address,
            c.tax_id AS customer_tax_id, c.email AS customer_email
     FROM documents d LEFT JOIN customers c ON c.id = d.customer_id WHERE d.id = $1`,
    [id]
  );
  if (!rows[0]) return null;
  const items = await c.query('SELECT * FROM document_line_items WHERE document_id = $1 ORDER BY id', [id]);
  // เอกสารที่ถูกอ้างอิงโดยตรง (เช่น ใบแจ้งหนี้ทั้งหมดในใบวางบิล)
  const linked = await c.query(
    `SELECT x.id, x.doc_no, x.doc_type, x.issue_date, x.due_date, x.subtotal, x.vat, x.total
     FROM document_refs r JOIN documents x ON x.id = r.ref_document_id
     WHERE r.document_id = $1 ORDER BY x.issue_date, x.id`,
    [id]
  );

  // สายเอกสารทั้งหมด: เอกสารทุกใบที่เชื่อมโยงกัน (ไล่ได้ทั้งต้นทางและปลายทาง)
  // ใช้ connected component เพื่อให้ใบวางบิล/ใบเสร็จเห็นใบสั่งซื้อในสายเดียวกันด้วย
  const rel = await c.query(
    `WITH RECURSIVE edges AS (
       SELECT document_id AS a, ref_document_id AS b FROM document_refs
       UNION
       SELECT id, ref_doc_id FROM documents WHERE ref_doc_id IS NOT NULL
     ),
     rel(id) AS (
       SELECT $1::int
       UNION
       SELECT CASE WHEN e.a = r.id THEN e.b ELSE e.a END
       FROM edges e JOIN rel r ON e.a = r.id OR e.b = r.id
     )
     SELECT d.id, d.doc_type, d.doc_no, d.issue_date
     FROM documents d
     WHERE d.id IN (SELECT id FROM rel)
     ORDER BY d.issue_date, d.id`,
    [id]
  );
  const chain = rel.rows.map((r) => ({ id: r.id, doc_type: r.doc_type, doc_no: r.doc_no, at: r.issue_date }));

  // ขั้น "การจ่ายเงิน" จะขึ้นเมื่อมีสลิปที่จับคู่กับเอกสารในสายนี้
  const slips = await c.query(
    `SELECT to_char(transfer_at AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD') AS at
     FROM payments
     WHERE matched_document_id = ANY($1::int[]) AND match_result = 'matched'
     ORDER BY transfer_at`,
    [chain.map((x) => x.id)]
  );
  slips.rows.forEach((s) => chain.push({ id: null, doc_type: 'PAY', label: 'การจ่ายเงิน (โอนเงิน)', at: s.at }));
  chain.sort((a, b) => (CHAIN_ORDER[a.doc_type] || 99) - (CHAIN_ORDER[b.doc_type] || 99)); // sort เสถียร ประเภทเดียวกันคงลำดับวันที่เดิม

  // ประวัติการแก้ไข (ใหม่สุดก่อน)
  const history = await c.query(
    `SELECT h.id, h.action, h.text, h.created_at AS at, u.name AS by
     FROM document_history h LEFT JOIN users u ON u.id = h.by_user
     WHERE h.document_id = $1
     ORDER BY h.created_at DESC, h.id DESC`,
    [id]
  );

  return { ...rows[0], items: items.rows, linked: linked.rows, chain, history: history.rows };
}

export async function notify(c, message, link = null) {
  await c.query('INSERT INTO notifications(message, link) VALUES ($1,$2)', [message, link]);
}