import nodemailer from 'nodemailer';
import { cfg } from '../config.js';

const transporter = nodemailer.createTransport({
  host: cfg.smtp.host,
  port: cfg.smtp.port,
  secure: cfg.smtp.port === 465,
  auth: { user: cfg.smtp.user, pass: cfg.smtp.pass },
});

export async function sendDocumentEmail(to, doc, pdf) {
  await transporter.sendMail({
    from: cfg.smtp.from,
    to,
    subject: `เอกสาร ${doc.doc_no} จาก ${cfg.company.name}`,
    text: `เรียน ${doc.customer_name || 'ลูกค้า'}\n\nแนบเอกสารเลขที่ ${doc.doc_no} ยอดรวม ${doc.total.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท\n\nขอบคุณครับ/ค่ะ\n${cfg.company.name}`,
    attachments: [{ filename: `${doc.doc_no}.pdf`, content: pdf, contentType: 'application/pdf' }],
  });
}
