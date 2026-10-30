export const baht = (n) =>
  '฿' + Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const num = (n) =>
  Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const dateTh = (s) =>
  s ? new Date(String(s).length === 10 ? s + 'T00:00:00' : s).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
export const timeTh = (s) =>
  s ? new Date(s).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '';

export const DOC_TYPES = {
  QT: { label: 'ใบเสนอราคา', sub: 'ใบเสนอราคา' },
  OP: { label: 'ใบสั่งซื้อ', sub: 'ใบสั่งซื้อ' },
  INV: { label: 'ใบแจ้งหนี้', sub: 'ใบแจ้งหนี้' },
  BN: { label: 'ใบวางบิล', sub: 'ใบวางบิล' },
  RC: { label: 'ใบเสร็จรับเงิน/ใบกำกับภาษี', sub: 'ใบเสร็จรับเงิน' },
  TX: { label: 'ใบกำกับภาษี', sub: 'Tax invoice' },
};

// สถานะทั้งหมดอยู่ที่เดียว: ป้ายชื่อ + สี (ตรงตามสเปก)
export const STATUS = {
  pending_approval: { label: 'รออนุมัติ', bg: '#cfe8ff', fg: '#0b3b73' },
  approved: { label: 'ได้รับอนุมัติแล้ว', bg: '#6f93d6', fg: '#071a3a' },
  rejected: { label: 'ไม่ได้รับการอนุมัติ', bg: '#ffb4b4', fg: '#7a0b0b' },
  wait_invoice: { label: 'รอทำใบแจ้งหนี้', bg: '#e6d4ff', fg: '#4a1d8f' },
  invoiced: { label: 'ทำใบแจ้งหนี้แล้ว', bg: '#f6d0f2', fg: '#7a1a72' },
  invalid: { label: 'ข้อมูลไม่ถูกต้อง', bg: '#ff9fc4', fg: '#7a0b3d' },
  unpaid: { label: 'รอชำระ', bg: '#ffd9a8', fg: '#7a4300' },
  due_soon: { label: 'ใกล้ครบกำหนดชำระ', bg: '#fff099', fg: '#7a6000' }, // เพิ่มสถานะใหม่ (ป้ายสีเหลือง)
  slip_review: { label: 'รอตรวจสอบสลิป', bg: '#ffb9d9', fg: '#7a0b45' },
  mismatch: { label: 'ข้อมูลไม่ตรง', bg: '#fff3a3', fg: '#6b5a00' },
  overdue: { label: 'เกินกำหนด', bg: '#f08a8a', fg: '#5a0000' },
  paid: { label: 'ชำระแล้ว', bg: '#b9f0c8', fg: '#0b5a24' },
  
};

export const STATUS_BY_TYPE = {
  QT: ['pending_approval', 'approved', 'rejected'],
  OP: ['wait_invoice', 'invoiced', 'invalid'],
  INV: ['unpaid', 'due_soon', 'slip_review', 'mismatch', 'overdue', 'paid'], // เพิ่ม due_soon
  BN: ['unpaid', 'due_soon', 'mismatch', 'overdue', 'paid'], // เพิ่ม due_soon
  RC: ['paid'],
  TX: ['paid', 'invalid'],
};

export const ALL_STATUSES = Object.keys(STATUS);