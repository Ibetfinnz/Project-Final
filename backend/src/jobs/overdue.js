import cron from 'node-cron';
import { q } from '../db.js';

export async function markOverdue() {
  const { rows } = await q(
    `UPDATE documents SET status = 'overdue', updated_at = now()
     WHERE doc_type IN ('INV','BN') AND status = 'unpaid' AND due_date IS NOT NULL AND due_date < CURRENT_DATE
     RETURNING side`
  );
  const counts = rows.reduce((m, r) => {
    const side = r.side || 'AR';
    m[side] = (m[side] || 0) + 1;
    return m;
  }, {});
  for (const [side, count] of Object.entries(counts)) {
    await q(
      'INSERT INTO notifications(message, link, side) VALUES ($1,$2,$3)',
      [`มีเอกสารเกินกำหนดชำระ ${count} รายการ`, '/documents?status=overdue', side]
    );
  }
  return rows.length;
}

export function startJobs() {
  markOverdue().catch(console.error);
  cron.schedule('5 0 * * *', () => markOverdue().catch(console.error), { timezone: 'Asia/Bangkok' });
}
