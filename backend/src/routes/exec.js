import { Router } from 'express';
import { q } from '../db.js';
import { DUE_SOON_DAYS, TODAY, syncOverdue } from '../services/overdue.js';

// API สำหรับผู้บริหาร (EXEC): ภาพรวมเอกสารทั้งระบบ + แดชบอร์ดการเงินแบบรวมศูนย์
const r = Router();

// อัปเดตสถานะใกล้/เกินกำหนดก่อนตอบทุกครั้ง
r.use(async (_req, _res, next) => {
  try { await syncOverdue(); next(); } catch (e) { next(e); }
});

const TYPES = ['QT', 'OP', 'INV', 'BN', 'RC', 'TX'];

// กลุ่มสถานะ (ใช้ชื่อคงที่ในโค้ด จึงต่อเป็น SQL literal ได้อย่างปลอดภัย)
const PENDING = ['pending_approval', 'payment_pending', 'mismatch', 'invalid', 'incomplete'];
const APPROVED = [
  'approved', 'paid', 'unpaid', 'due_soon', 'slip_review',
  'po_wait_invoice', 'po_invoiced', 'wait_invoice', 'invoiced',
];

const inList = (arr) => arr.map((s) => `'${s}'`).join(', ');
const PENDING_SQL = inList(PENDING);
const APPROVED_SQL = inList(APPROVED);

// รายรับ/รายจ่ายใช้เฉพาะ INV เพื่อไม่ให้ยอดซ้ำกับ OP/BN/RC ในสายเอกสารเดียวกัน
// (ตรงกับหลักการของแดชบอร์ด AR/AP เดิม)
const CASHFLOW_DAYS = 30;
const AGING_BUCKETS = ['0-30', '31-60', '61-90', '90+'];

async function cashflowSeries(days) {
  const { rows } = await q(`
    WITH days AS (
      SELECT generate_series(CURRENT_DATE - ($1::int - 1), CURRENT_DATE, interval '1 day')::date AS day
    )
    SELECT to_char(days.day, 'YYYY-MM-DD') AS date,
           COALESCE(ar.amt, 0) AS income,
           COALESCE(ap.amt, 0) AS expense
    FROM days
    LEFT JOIN (
      SELECT paid_at::date AS day, SUM(total) AS amt FROM documents
      WHERE side = 'AR' AND doc_type = 'INV' AND status = 'paid' AND paid_at IS NOT NULL
      GROUP BY 1
    ) ar ON ar.day = days.day
    LEFT JOIN (
      SELECT paid_at::date AS day, SUM(total) AS amt FROM documents
      WHERE side = 'AP' AND doc_type = 'INV' AND status = 'paid' AND paid_at IS NOT NULL
      GROUP BY 1
    ) ap ON ap.day = days.day
    ORDER BY days.day`, [days]);

  return rows.map((x) => ({ ...x, net: Number(x.income) - Number(x.expense) }));
}

/* ============================================================
   ภาพรวมเอกสารทั้งหมดในระบบ (Document command center)
   ============================================================ */
r.get('/overview', async (_req, res) => {
  const kpis = (await q(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE side = 'AR')::int AS ar_count,
      COUNT(*) FILTER (WHERE side = 'AP')::int AS ap_count,
      COUNT(*) FILTER (WHERE status IN (${APPROVED_SQL}))::int AS approved,
      COUNT(*) FILTER (WHERE status IN (${PENDING_SQL}))::int AS pending,
      COUNT(*) FILTER (WHERE status = 'paid')::int AS paid,
      COUNT(*) FILTER (WHERE status = 'overdue')::int AS overdue,
      COUNT(*) FILTER (
        WHERE status NOT IN ('paid', 'cancelled')
          AND due_date IS NOT NULL
          AND due_date <= ${TODAY} + ${DUE_SOON_DAYS}
      )::int AS due,
      COALESCE(SUM(total), 0) AS total_amount,
      COALESCE(SUM(total) FILTER (WHERE status = 'paid'), 0) AS paid_amount,
      COALESCE(SUM(total) FILTER (WHERE status IN (${APPROVED_SQL})), 0) AS approved_amount,
      COALESCE(SUM(total) FILTER (
        WHERE status NOT IN ('paid', 'cancelled')
          AND due_date IS NOT NULL
          AND due_date <= ${TODAY} + ${DUE_SOON_DAYS}
      ), 0) AS due_amount,
      COALESCE(SUM(total) FILTER (WHERE status NOT IN ('paid', 'cancelled')), 0) AS outstanding_amount
    FROM documents`)).rows[0];

  const files = (await q('SELECT COUNT(*)::int AS n FROM source_files')).rows[0];

  // แยกตามฝั่งและประเภทเอกสาร
  const rows = (await q(`
    SELECT side, doc_type,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'paid')::int AS paid,
      COUNT(*) FILTER (WHERE status = 'overdue')::int AS overdue,
      COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
      COUNT(*) FILTER (WHERE status IN (${PENDING_SQL}))::int AS pending,
      COALESCE(SUM(total), 0) AS amount
    FROM documents
    GROUP BY side, doc_type`)).rows;

  const breakdown = { AR: [], AP: [] };
  for (const side of ['AR', 'AP']) {
    for (const type of TYPES) {
      const f = rows.find((x) => x.side === side && x.doc_type === type) || {};
      breakdown[side].push({
        doc_type: type,
        total: f.total || 0,
        paid: f.paid || 0,
        pending: f.pending || 0,
        overdue: f.overdue || 0,
        cancelled: f.cancelled || 0,
        amount: Number(f.amount || 0),
      });
    }
  }

  // ภาพรวมสถานะเอกสาร (สำหรับกราฟวงกลม + แถบแยกฝั่ง)
  const statusRows = (await q(`
    SELECT side,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'paid')::int AS complete,
      COUNT(*) FILTER (WHERE status IN (${PENDING_SQL}))::int AS pending,
      COUNT(*) FILTER (WHERE status = 'overdue')::int AS overdue,
      COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
      COUNT(*) FILTER (
        WHERE status NOT IN ('paid', 'cancelled', 'overdue', ${PENDING_SQL})
      )::int AS active
    FROM documents
    GROUP BY side`)).rows;

  const empty = { total: 0, complete: 0, pending: 0, overdue: 0, cancelled: 0, active: 0 };
  const pickSide = (side) => {
    const found = statusRows.find((x) => x.side === side) || {};
    const { side: _side, ...rest } = found;
    return { ...empty, ...rest };
  };
  const overview = {
    AR: pickSide('AR'),
    AP: pickSide('AP'),
    all: { ...empty },
  };
  overview.all.total = kpis.total;
  for (const key of ['complete', 'pending', 'overdue', 'cancelled', 'active']) {
    overview.all[key] =
      Number(overview.AR[key] || 0) + Number(overview.AP[key] || 0);
  }

  // เอกสารที่ใกล้ถึง/เลยกำหนดชำระ
  const due = (await q(`
    SELECT d.id, d.doc_no, d.doc_type, d.side, d.total, d.due_date, d.status,
           c.name AS customer_name,
           (d.due_date - ${TODAY})::int AS days_left
    FROM documents d
    LEFT JOIN customers c ON c.id = d.customer_id
    WHERE d.status NOT IN ('paid', 'cancelled')
      AND d.due_date IS NOT NULL
    ORDER BY d.due_date ASC, d.id ASC
    LIMIT 8`)).rows;

  res.json({
    kpis: { ...kpis, files: files.n },
    breakdown,
    cashflow: await cashflowSeries(15),
    overview,
    due,
  });
});

/* ============================================================
   แดชบอร์ดข้อมูลทางการเงินแบบรวมศูนย์ (Master financial dashboard)
   ============================================================ */
r.get('/finance', async (_req, res) => {
  const kpis = (await q(`
    SELECT
      COALESCE(SUM(total) FILTER (
        WHERE side = 'AR' AND doc_type = 'INV' AND status = 'paid'), 0) AS income,
      COALESCE(SUM(total) FILTER (
        WHERE side = 'AP' AND doc_type = 'INV' AND status = 'paid'), 0) AS expense,
      COUNT(*) FILTER (
        WHERE side = 'AR' AND doc_type = 'INV' AND status = 'paid')::int AS income_count,
      COUNT(*) FILTER (
        WHERE side = 'AP' AND doc_type = 'INV' AND status = 'paid')::int AS expense_count,
      COALESCE(SUM(total) FILTER (
        WHERE side = 'AR' AND doc_type = 'INV' AND status = 'paid'
          AND date_trunc('month', paid_at) = date_trunc('month', now())), 0) AS month_income,
      COALESCE(SUM(total) FILTER (
        WHERE side = 'AP' AND doc_type = 'INV' AND status = 'paid'
          AND date_trunc('month', paid_at) = date_trunc('month', now())), 0) AS month_expense,
      COALESCE(SUM(total) FILTER (
        WHERE side = 'AR' AND doc_type = 'INV' AND status = 'paid'
          AND paid_at >= CURRENT_DATE - 29), 0) AS period_income,
      COALESCE(SUM(total) FILTER (
        WHERE side = 'AP' AND doc_type = 'INV' AND status = 'paid'
          AND paid_at >= CURRENT_DATE - 29), 0) AS period_expense,
      COALESCE(SUM(total) FILTER (
        WHERE side = 'AR' AND doc_type = 'INV' AND status = 'paid'
          AND paid_at >= CURRENT_DATE - 59 AND paid_at < CURRENT_DATE - 29), 0) AS prev_income,
      COALESCE(SUM(total) FILTER (
        WHERE side = 'AP' AND doc_type = 'INV' AND status = 'paid'
          AND paid_at >= CURRENT_DATE - 59 AND paid_at < CURRENT_DATE - 29), 0) AS prev_expense,
      COALESCE(SUM(total) FILTER (
        WHERE side = 'AR' AND status NOT IN ('paid', 'cancelled')), 0) AS ar_outstanding,
      COUNT(*) FILTER (
        WHERE side = 'AR' AND status NOT IN ('paid', 'cancelled'))::int AS ar_outstanding_count,
      COALESCE(SUM(total) FILTER (
        WHERE side = 'AP' AND status NOT IN ('paid', 'cancelled')), 0) AS ap_outstanding,
      COUNT(*) FILTER (
        WHERE side = 'AP' AND status NOT IN ('paid', 'cancelled'))::int AS ap_outstanding_count,
      COALESCE(SUM(total) FILTER (WHERE side = 'AR' AND status = 'overdue'), 0) AS ar_overdue,
      COALESCE(SUM(total) FILTER (WHERE side = 'AP' AND status = 'overdue'), 0) AS ap_overdue
    FROM documents`)).rows[0];

  // อายุเอกสารคงค้าง (ทุกประเภทที่ยังไม่ปิด) แยกฝั่ง AR/AP
  const agingRows = (await q(`
    SELECT side,
      CASE
        WHEN due_date IS NULL OR CURRENT_DATE - due_date <= 30 THEN '0-30'
        WHEN CURRENT_DATE - due_date <= 60 THEN '31-60'
        WHEN CURRENT_DATE - due_date <= 90 THEN '61-90'
        ELSE '90+'
      END AS bucket,
      COUNT(*)::int AS count,
      COALESCE(SUM(total), 0) AS amount
    FROM documents
    WHERE status NOT IN ('paid', 'cancelled')
    GROUP BY 1, 2`)).rows;

  const aging = { AR: [], AP: [] };
  for (const side of ['AR', 'AP']) {
    for (const bucket of AGING_BUCKETS) {
      const f = agingRows.find((x) => x.side === side && x.bucket === bucket) || {};
      aging[side].push({
        bucket,
        count: f.count || 0,
        amount: Number(f.amount || 0),
      });
    }
  }

  // รายได้/รายจ่ายตามบริษัท (เฉพาะ INV ที่ชำระแล้ว เพื่อไม่ให้ซ้ำในสายเอกสาร)
  const companyRows = (await q(`
    SELECT COALESCE(c.name, 'ไม่ระบุบริษัท') AS name, d.side,
           COUNT(*)::int AS count, COALESCE(SUM(d.total), 0) AS amount
    FROM documents d
    LEFT JOIN customers c ON c.id = d.customer_id
    WHERE d.doc_type = 'INV' AND d.status = 'paid'
    GROUP BY 1, 2
    ORDER BY amount DESC`)).rows;

  const pick = (side) => companyRows
    .filter((x) => x.side === side)
    .slice(0, 6)
    .map((x) => ({ name: x.name, count: x.count, amount: Number(x.amount) }));

  const income = Number(kpis.income || 0);
  const expense = Number(kpis.expense || 0);
  const periodIncome = Number(kpis.period_income || 0);
  const periodExpense = Number(kpis.period_expense || 0);

  res.json({
    kpis: {
      ...kpis,
      net: income - expense,
      ratio: expense > 0 ? income / expense : null,
      period_net: periodIncome - periodExpense,
      prev_net: Number(kpis.prev_income || 0) - Number(kpis.prev_expense || 0),
    },
    cashflow: await cashflowSeries(CASHFLOW_DAYS),
    aging,
    revenue: pick('AR'),
    expense_by_company: pick('AP'),
  });
});

export default r;
