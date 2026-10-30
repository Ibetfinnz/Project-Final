import { Router } from 'express';
import { q } from '../db.js';
import { syncOverdue } from '../services/overdue.js';

const r = Router();

// นับเฉพาะ INV เพื่อไม่ให้ยอดซ้ำกับ BN (ใบวางบิลรวมหลาย INV)
r.use(async (_req, _res, next) => {
  try { await syncOverdue(); next(); } catch (e) { next(e); }
});

r.get('/summary', async (_req, res) => {
  const { rows } = await q(`
    SELECT
      COALESCE(SUM(total) FILTER (WHERE status IN ('unpaid','due_soon','slip_review','mismatch')),0) AS pending_amount,
      COUNT(*) FILTER (WHERE status IN ('unpaid','due_soon','slip_review','mismatch')) AS pending_count,
      COALESCE(SUM(total) FILTER (WHERE status='paid' AND date_trunc('month',paid_at)=date_trunc('month',now())),0) AS paid_amount,
      COALESCE(SUM(total) FILTER (WHERE status='overdue'),0) AS overdue_amount,
      COUNT(*) FILTER (WHERE status='overdue') AS overdue_count
    FROM documents WHERE doc_type = 'INV'`);
  res.json(rows[0]);
});

r.get('/chart', async (_req, res) => {
  const { rows } = await q(`
    SELECT to_char(d, 'YYYY-MM-DD') AS date,
           COALESCE(r.amt,0) AS received, COALESCE(e.amt,0) AS expected
    FROM generate_series(current_date - 29, current_date, interval '1 day') d
    LEFT JOIN (SELECT paid_at::date pd, SUM(total) amt FROM documents
               WHERE doc_type='INV' AND status='paid' GROUP BY 1) r ON r.pd = d::date
    LEFT JOIN (SELECT due_date dd, SUM(total) amt FROM documents
               WHERE doc_type='INV' GROUP BY 1) e ON e.dd = d::date
    ORDER BY d`);
  res.json(rows.filter((x) => x.received > 0 || x.expected > 0));
});

r.get('/todos', async (_req, res) => {
  const fmt = (n) => Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2 });
  const slips = await q(`
    SELECT d.doc_no, d.total, c.name, s.created_at FROM documents d
    JOIN customers c ON c.id = d.customer_id
    LEFT JOIN payment_slips s ON s.matched_document_id = d.id AND NOT s.verified
    WHERE d.status = 'slip_review' ORDER BY s.created_at DESC NULLS LAST`);
  const bad = await q(`
    SELECT doc_no, status_reason, updated_at FROM documents
    WHERE status IN ('mismatch','invalid') ORDER BY updated_at DESC`);
  const over = await q(`
    SELECT d.doc_no, d.total, c.name, (CURRENT_DATE - d.due_date) AS days
    FROM documents d LEFT JOIN customers c ON c.id = d.customer_id
    WHERE d.doc_type='INV' AND d.status='overdue' ORDER BY d.due_date`);
  const soon = await q(`
  SELECT d.doc_no, d.total, d.due_date, c.name,
         (d.due_date - (now() AT TIME ZONE 'Asia/Bangkok')::date) AS days
  FROM documents d LEFT JOIN customers c ON c.id = d.customer_id
  WHERE d.doc_type='INV' AND d.status='due_soon' ORDER BY d.due_date`);

  res.json([
    ...slips.rows.map((x) => ({
      title: `ตรวจสลิปจาก ${x.name}`, description: `${fmt(x.total)} บาท (${x.doc_no})`,
      at: x.created_at, status: 'slip_review', action: 'ตรวจสลิป', link: '/verify',
    })),
    ...bad.rows.map((x) => ({
      title: `${x.doc_no} ต้องแก้ไข`, description: x.status_reason || 'ข้อมูลไม่ตรง',
      at: x.updated_at, status: 'mismatch', action: 'ไปแก้ไข', link: `/documents?q=${x.doc_no}`,
    })),
    ...over.rows.map((x) => ({
      title: `ติดตามทวง ${x.doc_no}`, description: `${x.name} ค้าง ${fmt(x.total)} บาท`,
      at: null, overdue_days: x.days, status: 'overdue', action: 'ดูเอกสาร', link: `/documents?q=${x.doc_no}`,
    })),
    ...soon.rows.map((x) => ({
  title: `${x.doc_no} ใกล้ครบกำหนดชำระ`, description: `${x.name} ${fmt(x.total)} บาท`,
  at: null, due_in_days: x.days, status: 'due_soon', action: 'ดูเอกสาร', link: `/documents?q=${x.doc_no}`,
})),
  ]);
});
export default r;
