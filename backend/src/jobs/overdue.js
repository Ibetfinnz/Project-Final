import cron from 'node-cron';
import { q } from '../db.js';

export async function markOverdue() {
  const { rowCount } = await q(
    `UPDATE documents SET status = 'overdue', updated_at = now()
     WHERE doc_type IN ('INV','BN') AND status = 'unpaid' AND due_date IS NOT NULL AND due_date < CURRENT_DATE`
  );
  if (rowCount) {
    await q('INSERT INTO notifications(message, link) VALUES ($1,$2)', [`มีเอกสารเกินกำหนดชำระ ${rowCount} รายการ`, '/documents?status=overdue']);
  }
  return rowCount;
}

export function startJobs() {
  markOverdue().catch(console.error);
  cron.schedule('5 0 * * *', () => markOverdue().catch(console.error), { timezone: 'Asia/Bangkok' });
}
