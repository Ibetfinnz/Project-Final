import { q } from '../db.js';

// ใกล้ครบกำหนด = เหลืออีกไม่เกินกี่วัน
export const DUE_SOON_DAYS = 7;

// วันนี้ตามเวลาไทย (ไม่พึ่ง timezone ของ server/DB)
export const TODAY = `(now() AT TIME ZONE 'Asia/Bangkok')::date`;

const thDate = (d) =>
  new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok' });

/**
 * ซิงก์สถานะใบแจ้งหนี้ตามวันครบกำหนด
 *   unpaid / due_soon -> overdue   เมื่อเลยกำหนด
 *   unpaid            -> due_soon  เมื่อเหลือ 0-7 วัน  (และแจ้งเตือน 1 ครั้ง)
 *   overdue / due_soon -> กลับตามวันที่ เมื่อเลื่อนวันครบกำหนดออกไป
 * สถานะที่มีสลิปแล้ว (slip_review, mismatch) และ paid จะไม่ถูกแตะ
 */
export async function syncOverdue() {
  // 1) เลยกำหนดแล้ว
  await q(`
    UPDATE documents SET status = 'overdue'
    WHERE doc_type = 'INV' AND status IN ('unpaid','due_soon')
      AND due_date IS NOT NULL AND due_date < ${TODAY}`);

  // 2) เลื่อนวันครบกำหนดออกไป / ลบวันครบกำหนด -> ย้อนกลับ
  await q(`
    UPDATE documents SET status = CASE
        WHEN due_date IS NOT NULL AND due_date <= ${TODAY} + ${DUE_SOON_DAYS} THEN 'due_soon'
        ELSE 'unpaid' END
    WHERE doc_type = 'INV' AND status = 'overdue'
      AND (due_date IS NULL OR due_date >= ${TODAY})`);
  await q(`
    UPDATE documents SET status = 'unpaid'
    WHERE doc_type = 'INV' AND status = 'due_soon'
      AND (due_date IS NULL OR due_date > ${TODAY} + ${DUE_SOON_DAYS})`);

  // 3) ใกล้ครบกำหนด (เปลี่ยนสถานะครั้งเดียว จึงแจ้งเตือนครั้งเดียว)
  const { rows } = await q(`
    UPDATE documents SET status = 'due_soon'
    WHERE doc_type = 'INV' AND status = 'unpaid'
      AND due_date IS NOT NULL
      AND due_date BETWEEN ${TODAY} AND ${TODAY} + ${DUE_SOON_DAYS}
    RETURNING doc_no, due_date`);

  for (const d of rows) {
    // ตาราง notifications มีคอลัมน์ message, link (ตาม notify() ใน docs.js)
    await q(
      'INSERT INTO notifications (message, link) VALUES ($1, $2)',
      [`ใบแจ้งหนี้ ${d.doc_no} ใกล้ครบกำหนดชำระ (ครบกำหนด ${thDate(d.due_date)})`, `/documents?q=${d.doc_no}`],
    );
  }
}