import { calcTotals, createDocument, prepareBilling, notify, INITIAL_STATUS } from './docs.js';

export const TYPE_LABEL = {
  SLIP: 'สลิปโอนเงิน', OP: 'ใบสั่งซื้อ', INV: 'ใบแจ้งหนี้', BN: 'ใบวางบิล',
  RC: 'ใบเสร็จรับเงิน', TX: 'ใบกำกับภาษี', UNKNOWN: 'ไม่ทราบประเภท',
};
export const DOC_TYPES = ['OP', 'INV', 'BN', 'RC', 'TX'];

const num = (v) => Number(v) || 0;
const near = (a, b, t = 0.01) => Math.abs(num(a) - num(b)) <= t;
const money = (v) => num(v).toLocaleString('th-TH', { minimumFractionDigits: 2 });

const normName = (s = '') => s.replace(/บริษัท|จำกัด|\(มหาชน\)|หจก\.?|ห้างหุ้นส่วน|\s|\./g, '').toLowerCase();
export const nameClose = (a, b) => {
  const x = normName(a), y = normName(b);
  return !!x && !!y && (x.includes(y) || y.includes(x));
};

// ---------- จำแนกประเภทเอกสารจากข้อความ OCR ----------
const SLIP_STRONG = /โอนเงินสำเร็จ|โอนเงินสําเร็จ|ทำรายการสำเร็จ|ทำรายการสําเร็จ|จ่ายเงินสำเร็จ|ชำระเงินสำเร็จ|transfersuccessful|paymentsuccessful/;
const SLIP_WEAK = /รหัสอ้างอิง|เลขที่รายการ|promptpay|พร้อมเพย์/;
const DOC_TESTS = [
  ['BN', /ใบวางบิล|billingnote/],
  ['RC', /ใบเสร็จ|receipt/],
  ['INV', /ใบแจ้งหนี/],
  ['TX', /ใบกำกับภาษี|ใบกํากับภาษี|taxinvoice/],
  ['OP', /ใบสั่งซื้อ|purchaseorder/],
  ['INV', /invoice/],
];
const firstMatch = (s) => DOC_TESTS.find(([, re]) => re.test(s))?.[0] || null;

export function classify(text = '', guess = null) {
  const t = String(text).replace(/\s+/g, '').toLowerCase();
  if (SLIP_STRONG.test(t)) return 'SLIP';
  const head = firstMatch(t.slice(0, 500)); // หัวเอกสารสำคัญกว่าข้อความท้ายเอกสาร
  if (head) return head;
  if (SLIP_WEAK.test(t)) return 'SLIP';
  const any = firstMatch(t);
  if (any) return any;
  return ['SLIP', ...DOC_TYPES].includes(guess) ? guess : 'UNKNOWN';
}

// ---------- ลูกค้า ----------
export async function findCustomer(c, d) {
  const taxId = String(d.tax_id || '').replace(/\D/g, '') || null;
  let cust = taxId ? (await c.query('SELECT * FROM customers WHERE tax_id = $1', [taxId])).rows[0] : null;
  if (!cust && d.customer_name) {
    cust = (await c.query('SELECT * FROM customers WHERE name ILIKE $1 LIMIT 1', [d.customer_name])).rows[0];
  }
  return cust || null;
}

const cleanItems = (d) => (d.items || []).filter((i) => i?.description)
  .map((i) => ({ description: i.description, qty: num(i.qty), unit_price: num(i.unit_price) }));

// ---------- ตรวจความถูกต้องของตัวเอกสาร ----------
export function validateDoc(type, d, confidence) {
  const e = [];
  if (!d.customer_name) e.push('ไม่พบชื่อลูกค้า');
  const tax = String(d.tax_id || '').replace(/\D/g, '');
  if (tax ? tax.length !== 13 : ['OP', 'TX'].includes(type)) e.push('เลขผู้เสียภาษีไม่ครบ 13 หลัก');

  if (type === 'BN') {
    const refs = d.invoice_refs || [];
    if (!refs.length) e.push('ไม่พบรายการใบแจ้งหนี้ในใบวางบิล');
    else if (!near(refs.reduce((s, x) => s + num(x.amount), 0), d.total, 0.05)) {
      e.push(`ผลรวมใบแจ้งหนี้ในใบวางบิลไม่เท่ากับยอดรวม ${money(d.total)}`);
    }
  } else {
    const items = cleanItems(d);
    if (!items.length) e.push('ไม่พบรายการสินค้า');
    else {
      const vatOn = num(d.vat) > 0;
      const t = calcTotals(items, vatOn);
      const sum = items.reduce((s, i) => s + i.qty * i.unit_price, 0);
      if (d.subtotal != null && !near(sum, d.subtotal, 0.05)) e.push(`ผลรวมรายการ ${money(sum)} ไม่เท่ากับยอดก่อน VAT ${money(d.subtotal)}`);
      if (vatOn && Math.abs(num(d.subtotal ?? sum) * 0.07 - num(d.vat)) > 0.1) e.push('VAT ไม่เท่ากับ 7% ของยอดก่อน VAT');
      if (!near(t.total, d.total, 0.05)) e.push(`ยอดรวมในเอกสาร (${money(d.total)}) ไม่ตรงกับที่คำนวณ (${money(t.total)})`);
    }
  }
  if (confidence != null && Number(confidence) < 0.8) e.push(`ความมั่นใจ OCR ต่ำ (${confidence})`);
  return e;
}

// ---------- เทียบกับเอกสารก่อนหน้า ----------
const PREV = { OP: ['QT'], INV: ['OP'], RC: ['INV', 'BN'], TX: ['INV', 'BN'] };

export async function checkChain(c, type, d, customerId) {
  const notes = [];
  const total = num(d.total);
  const byNo = async (types, no) => {
    no = String(no || '').trim();
    if (!no) return null;
    return (await c.query(
      `SELECT * FROM documents WHERE doc_type = ANY($1) AND (doc_no ILIKE $2 OR customer_po ILIKE $2)
       ORDER BY id DESC LIMIT 1`, [types, no])).rows[0] || null;
  };

  // ใบวางบิล: เทียบทีละใบแจ้งหนี้
  if (type === 'BN') {
    const ids = [];
    let bad = false;
    for (const r of d.invoice_refs || []) {
      const inv = await byNo(['INV'], r.doc_no);
      if (!inv) { bad = true; notes.push(`ไม่พบใบแจ้งหนี้ ${r.doc_no} ในระบบ`); continue; }
      ids.push(inv.id);
      if (!near(inv.total, r.amount)) { bad = true; notes.push(`${inv.doc_no}: ยอดในใบวางบิล ${money(r.amount)} ต่างจากใบแจ้งหนี้ ${money(inv.total)}`); }
      if (customerId && inv.customer_id !== customerId) { bad = true; notes.push(`${inv.doc_no}: เป็นของลูกค้าคนละราย`); }
    }
    if (!ids.length && !bad) notes.push('ไม่พบใบแจ้งหนี้ให้เทียบ');
    return { result: bad ? 'mismatch' : ids.length ? 'matched' : 'no_reference', notes, ref_id: null, ref_doc_no: null, invoice_ids: ids };
  }

  const types = PREV[type];
  if (!types) return { result: 'no_reference', notes: ['ไม่มีเอกสารก่อนหน้าให้เทียบ'], ref_id: null, ref_doc_no: null, invoice_ids: [] };

  let ref = await byNo(types, d.ref_no || d.customer_po_no);
  if (!ref && customerId && type !== 'OP') {
    ref = (await c.query(
      `SELECT * FROM documents WHERE doc_type = ANY($1) AND customer_id = $2 AND ABS(total - $3) < 0.01
       ORDER BY id DESC LIMIT 1`, [types, customerId, total])).rows[0] || null;
  }
  if (!ref) return { result: 'no_reference', notes: [`ไม่พบ${types.map((t) => TYPE_LABEL[t]).join('/')}ที่อ้างถึง`], ref_id: null, ref_doc_no: null, invoice_ids: [] };

  let bad = false;
  if (!near(ref.total, total)) {
    bad = true;
    notes.push(`ยอด ${money(total)} ต่างจาก ${ref.doc_no} (${money(ref.total)}) ${money(Math.abs(num(ref.total) - total))} บาท`);
  }
  if (customerId && ref.customer_id && ref.customer_id !== customerId) { bad = true; notes.push(`ลูกค้าไม่ตรงกับ ${ref.doc_no}`); }
  return { result: bad ? 'mismatch' : 'matched', notes, ref_id: ref.id, ref_doc_no: ref.doc_no, invoice_ids: [] };
}

// ---------- บันทึกเอกสาร (ต้องเรียกภายใน tx) ----------
export async function saveDocument(c, o) {
  const { type, d, source, source_ref, file_path = null, created_by = null, email_from = null, confidence = null } = o;

  if (d.doc_no && type !== 'OP') {
    const dup = (await c.query('SELECT id, doc_no, status FROM documents WHERE doc_type = $1 AND doc_no = $2', [type, d.doc_no])).rows[0];
    if (dup) return { duplicate: true, ...dup };
  }

  let cust = await findCustomer(c, d);
  if (!cust) {
    const taxId = String(d.tax_id || '').replace(/\D/g, '') || null;
    cust = (await c.query('INSERT INTO customers(name,address,tax_id,email) VALUES ($1,$2,$3,$4) RETURNING *',
      [d.customer_name || email_from || 'ไม่ทราบชื่อ', d.address || null, taxId, d.email || email_from || null])).rows[0];
  }

  const errors = [...(o.errors || []), ...validateDoc(type, d, confidence)];
  const chk = await checkChain(c, type, d, cust.id);
  if (chk.result === 'mismatch') errors.push(...chk.notes);

  const items = cleanItems(d);
  let extra = { items, vat_enabled: num(d.vat) > 0 };
  if (type === 'BN') {
    extra = { items: [{ description: `ใบวางบิล ${d.doc_no || ''}`.trim(), qty: 1, unit_price: num(d.total) }], vat_enabled: false };
    if (chk.invoice_ids.length) {
      try { extra = await prepareBilling(c, { customer_id: cust.id, invoice_ids: chk.invoice_ids }); }
      catch (e) { errors.push(e.message); }
    }
  }

  const ok = errors.length === 0;
  const doc = await createDocument(c, {
    doc_type: type,
    doc_no: type !== 'OP' ? (d.doc_no || undefined) : undefined,   // ว่าง = ให้ระบบรันเลขให้
    customer_id: cust.id, issue_date: d.issue_date || null, due_date: d.due_date || null,
    // ผูกกับเอกสารก่อนหน้าเฉพาะตอนตรวจผ่าน (RC ที่ผูกแล้วจะปิดใบแจ้งหนี้เป็นชำระแล้ว)
    ref_text: ok && chk.ref_doc_no ? chk.ref_doc_no : (d.ref_no || null),
    customer_po: type === 'OP' ? (d.customer_po_no || d.doc_no || null) : null,
    source, source_ref, file_path, created_by,
    ...extra,
    status: ok ? INITIAL_STATUS[type] : 'invalid',
    status_reason: ok ? null : errors.join('; '),
  });

  await c.query('UPDATE documents SET check_result = $2, check_notes = $3 WHERE id = $1',
    [doc.id, chk.result, JSON.stringify(chk.notes)]);
  await c.query('INSERT INTO ocr_logs(source, source_ref, raw, confidence, ok, errors) VALUES ($1,$2,$3,$4,$5,$6)',
    [source, source_ref, d, confidence, ok, JSON.stringify(errors)]);
  await notify(c, ok ? `รับ${TYPE_LABEL[type]}ใหม่ ${doc.doc_no} จาก ${cust.name}` : `${TYPE_LABEL[type]} ${doc.doc_no} ต้องตรวจสอบ: ${errors[0]}`, `/documents?q=${doc.doc_no}`);
  return { kind: 'document', id: doc.id, doc_no: doc.doc_no, doc_type: type, label: TYPE_LABEL[type], status: doc.status, errors, check: chk };
}

// ---------- บันทึกสลิป + จับคู่ใบแจ้งหนี้ (ต้องเรียกภายใน tx) ----------
export async function saveSlip(c, { up = null, ocr, source_ref = null, file_path = null }) {
  const amount = Number(ocr.amount) || 0;
  if (!amount) throw Object.assign(new Error('อ่านยอดเงินจากสลิปไม่ได้'), { status: 400 });

  const cands = (await c.query(
    `SELECT d.*, cu.name AS customer_name FROM documents d LEFT JOIN customers cu ON cu.id = d.customer_id
     WHERE d.doc_type IN ('INV','BN') AND d.status IN ('unpaid','due_soon','overdue','mismatch')`)).rows;
  const hay = `${up?.note || ''} ${ocr.ref_no || ''} ${ocr.memo || ''}`.toLowerCase();
  let doc = cands.find((d) => hay.includes(d.doc_no.toLowerCase())) || null;
  if (!doc) {
    const byAmt = cands.filter((d) => Math.abs(d.total - amount) < 0.01);
    doc = byAmt.length === 1 ? byAmt[0] : byAmt.find((d) => nameClose(d.customer_name, ocr.sender_name)) || null;
  }
  const matchResult = !doc ? 'no_invoice' : Math.abs(doc.total - amount) < 0.01 ? 'matched' : 'mismatch';

  const slip = (await c.query(
    `INSERT INTO payment_slips(upload_id, transfer_at, amount, sender_name, ref_no, matched_document_id, match_result, file_path, ocr_raw, source_ref)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [up?.id ?? null, ocr.transfer_datetime || null, amount, ocr.sender_name || null, ocr.ref_no || null,
     doc?.id ?? null, matchResult, up?.file_path ?? file_path, ocr, source_ref])).rows[0];

  if (doc) {
    await c.query(`UPDATE documents SET status=$2, status_reason=$3, updated_at=now() WHERE id=$1`,
      [doc.id, matchResult === 'matched' ? 'slip_review' : 'mismatch',
       matchResult === 'matched' ? null : `ยอดสลิป ${amount} ไม่ตรงกับยอดเอกสาร ${doc.total}`]);
  }
  await c.query('INSERT INTO ocr_logs(source, source_ref, raw, confidence, ok) VALUES ($1,$2,$3,$4,$5)',
    [up ? 'upload' : 'gmail', String(up?.id ?? source_ref), ocr, ocr.confidence ?? null, true]);
  await notify(c, `สลิปใหม่ ${amount.toLocaleString('th-TH')} บาท รอตรวจสอบ (${matchResult})`, '/verify');
  return { kind: 'slip', slip_id: slip.id, match_result: matchResult, doc_no: doc?.doc_no ?? null };
}