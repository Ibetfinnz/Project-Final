export const INITIAL_STATUS = {
  QT: 'pending_approval',
  OP: 'wait_invoice',
  INV: 'unpaid',
  BN: 'unpaid',
  RC: 'paid',
  TX: 'paid',
};

// ใบแจ้งหนี้ที่วางบิลได้ = ยังค้างชำระ
export const OUTSTANDING = ['unpaid', 'due_soon', 'overdue'];

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const bad = (message) => Object.assign(new Error(message), { status: 400 });

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
export async function prepareBilling(c, b) {
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
       AND (EXISTS (SELECT 1 FROM documents x WHERE x.doc_type::text IN ('BN','RC') AND x.ref_doc_id = d.id)
         OR EXISTS (SELECT 1 FROM document_refs r JOIN documents x ON x.id = r.document_id
                    WHERE r.ref_document_id = d.id AND x.doc_type::text IN ('BN','RC')))`,
    [ids]
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
       subtotal, vat, total, status, status_reason, source, source_ref, file_path, paid_at, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7,CURRENT_DATE),$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
     RETURNING *`,
    [
      d.doc_type, docNo, refDocId, d.ref_text || null, d.customer_po || null, d.customer_id || null,
      d.issue_date || null, d.due_date || null, t.subtotal, t.vat, t.total,
      d.status || INITIAL_STATUS[d.doc_type], d.status_reason || null,
      d.source || 'manual', d.source_ref || null, d.file_path || null,
      d.doc_type === 'RC' ? new Date() : null, d.created_by || null,
    ]
  );
  const doc = rows[0];
  for (const l of t.lines) {
    await c.query(
      'INSERT INTO document_items(document_id, description, qty, unit_price, amount) VALUES ($1,$2,$3,$4,$5)',
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
    const link = { OP: ['QT', 'approved'], INV: ['OP', 'invoiced'] }[d.doc_type];
    if (link) {
      await c.query(
        `UPDATE documents SET status = $1, updated_at = now() WHERE id = $2 AND doc_type = $3`,
        [link[1], refDocId, link[0]]
      );
    }
  }

  // ออกใบเสร็จ = ชำระแล้ว: ปิดทั้งสายต้นทาง (BN -> INV ทุกใบที่อยู่ในนั้น)
  if (['RC', 'TX'].includes(d.doc_type) && linkIds.length) {
    await c.query(
      `WITH RECURSIVE ancestors(id) AS (
         SELECT unnest($1::int[])
         UNION
         SELECT r.ref_document_id FROM document_refs r JOIN ancestors a ON r.document_id = a.id
       )
       UPDATE documents SET status = 'paid', paid_at = COALESCE(paid_at, now()), updated_at = now()
       WHERE id IN (SELECT id FROM ancestors)
         AND doc_type IN ('INV', 'BN') AND status <> 'paid'`,
      [linkIds]
    );
  }
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
  const items = await c.query('SELECT * FROM document_items WHERE document_id = $1 ORDER BY id', [id]);
  // เอกสารที่ถูกอ้างอิงโดยตรง (เช่น ใบแจ้งหนี้ทั้งหมดในใบวางบิล)
  const linked = await c.query(
    `SELECT x.id, x.doc_no, x.doc_type, x.issue_date, x.due_date, x.subtotal, x.vat, x.total
     FROM document_refs r JOIN documents x ON x.id = r.ref_document_id
     WHERE r.document_id = $1 ORDER BY x.issue_date, x.id`,
    [id]
  );

  // สายเอกสารทั้งหมด: ต้นทางทุกชั้น + ปลายทางทุกชั้น + ตัวมันเอง
  const rel = await c.query(
    `WITH RECURSIVE edges AS (
       SELECT document_id AS child, ref_document_id AS parent FROM document_refs
       UNION
       SELECT id, ref_doc_id FROM documents WHERE ref_doc_id IS NOT NULL
     ),
     ancestors(id) AS (
       SELECT parent FROM edges WHERE child = $1
       UNION
       SELECT e.parent FROM edges e JOIN ancestors a ON e.child = a.id
     ),
     descendants(id) AS (
       SELECT child FROM edges WHERE parent = $1
       UNION
       SELECT e.child FROM edges e JOIN descendants x ON e.parent = x.id
     )
     SELECT d.id, d.doc_type, d.doc_no, d.issue_date
     FROM documents d
     WHERE d.id = $1 OR d.id IN (SELECT id FROM ancestors) OR d.id IN (SELECT id FROM descendants)
     ORDER BY d.issue_date, d.id`,
    [id]
  );
  const chain = rel.rows.map((r) => ({ id: r.id, doc_type: r.doc_type, doc_no: r.doc_no, at: r.issue_date }));

  // ขั้น "การจ่ายเงิน" จะขึ้นเมื่อมีสลิปที่จับคู่กับเอกสารในสายนี้
  const slips = await c.query(
    `SELECT to_char(transfer_at AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD') AS at
     FROM payment_slips
     WHERE matched_document_id = ANY($1::int[]) AND match_result = 'matched'
     ORDER BY transfer_at`,
    [chain.map((x) => x.id)]
  );
  slips.rows.forEach((s) => chain.push({ id: null, doc_type: 'PAY', label: 'การจ่ายเงิน (โอนเงิน)', at: s.at }));
  chain.sort((a, b) => (CHAIN_ORDER[a.doc_type] || 99) - (CHAIN_ORDER[b.doc_type] || 99)); // sort เสถียร ประเภทเดียวกันคงลำดับวันที่เดิม

  return { ...rows[0], items: items.rows, linked: linked.rows, chain };
}

export async function notify(c, message, link = null) {
  await c.query('INSERT INTO notifications(message, link) VALUES ($1,$2)', [message, link]);
}