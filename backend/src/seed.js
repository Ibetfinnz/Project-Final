import bcrypt from 'bcryptjs';
import { q, pool } from './db.js';

const hash = await bcrypt.hash('ChangeMe123!', 10);
await q(
  `INSERT INTO users(name,email,password_hash,role) VALUES ('พนักงานบัญชีรายรับ (AR)','ar@example.com',$1,'AR')
   ON CONFLICT (email) DO NOTHING`, [hash]);
await q(
  `INSERT INTO customers(name,address,tax_id,email) VALUES
   ('บริษัท สยามเทค โซลูชั่นส์ จำกัด','123 ถ.สีลม กรุงเทพฯ','0105551234567','billing@siamtech.example'),
   ('บริษัท ธนบูรณะ จำกัด','45 ถ.รัชดา กรุงเทพฯ','0105559876543','ap@thanaburana.example')
   ON CONFLICT (tax_id) DO NOTHING`);
console.log('seed เสร็จ: ar@example.com / ChangeMe123!  (เปลี่ยนรหัสผ่านทันทีใน production)');
await pool.end();
