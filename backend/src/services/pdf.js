import puppeteer from 'puppeteer-core';
import { cfg } from '../config.js';

const TITLES = {
  QT: ['ใบเสนอราคา', 'Quotation'],
  OP: ['ใบสั่งซื้อ', 'Purchase Order'],
  INV: ['ใบแจ้งหนี้', 'Invoice'],
  BN: ['ใบวางบิล', 'Billing Note'],
  RC: ['ใบเสร็จรับเงิน / ใบกำกับภาษี', 'Receipt / Tax Invoice'],
};
const baht = (n) => Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateTh = (s) => (s ? new Date(s + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }) : '-');
const esc = (s = '') => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function renderHtml(doc) {
  const [th, en] = TITLES[doc.doc_type];
  const rows = doc.items
    .map((i, n) => `<tr><td>${n + 1}</td><td>${esc(i.description)}</td><td class="r">${i.qty}</td><td class="r">${baht(i.unit_price)}</td><td class="r">${baht(i.amount)}</td></tr>`)
    .join('');
  const isBN = doc.doc_type === 'BN' && (doc.linked || []).length > 0;
  const itemsTable = isBN
    ? `<table class="items"><colgroup><col style="width:6%"><col style="width:34%"><col style="width:20%"><col style="width:20%"><col style="width:20%"></colgroup><thead><tr><th>#</th><th>เลขที่ใบแจ้งหนี้</th><th>วันที่ออก</th><th>ครบกำหนด</th><th class="r">จำนวนเงิน</th></tr></thead><tbody>${doc.linked.map((x, n) => `<tr><td>${n + 1}</td><td>${esc(x.doc_no)}</td><td>${dateTh(x.issue_date)}</td><td>${dateTh(x.due_date)}</td><td class="r">${baht(x.subtotal)}</td></tr>`).join('')}</tbody></table>`
    : `<table class="items"><colgroup><col style="width:6%"><col style="width:44%"><col style="width:12%"><col style="width:19%"><col style="width:19%"></colgroup><thead><tr><th>#</th><th>รายการ</th><th class="r">จำนวน</th><th class="r">ราคา/หน่วย</th><th class="r">จำนวนเงิน</th></tr></thead><tbody>${rows}</tbody></table>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:'Garuda','Loma','Norasi',sans-serif;font-size:12px;color:#222;padding:32px}
    h1{margin:0;font-size:22px} .sub{color:#666;margin:0 0 16px}
    .head{display:flex;justify-content:space-between;border-bottom:2px solid #222;padding-bottom:12px}

    /* ลูกค้า (ซ้าย) + เลขที่เอกสาร (ขวา) */
    .info{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;margin-top:14px}
    .cust{flex:0 1 auto;max-width:50%;line-height:1.6;word-break:break-word}
    .cust .name{font-weight:bold;font-size:13px}
    .docmeta{width:240px;border-collapse:collapse}
    .docmeta td{padding:2px 0;vertical-align:top;white-space:nowrap}
    .docmeta td:first-child{color:#555;padding-right:14px}
    .docmeta td:last-child{text-align:right;font-weight:bold}

    table.items{width:100%;border-collapse:collapse;margin-top:18px;table-layout:fixed}
    table.items th{background:#eee;text-align:left;padding:6px;border-bottom:1px solid #999}
    table.items td{padding:6px;border-bottom:1px solid #ddd;word-wrap:break-word}
    table.items th.r,table.items td.r{text-align:right}
    .tot{margin-left:auto;margin-top:12px;width:260px} .tot div{display:flex;justify-content:space-between;padding:3px 0}
    .tot .grand{font-weight:bold;border-top:2px solid #222;margin-top:4px;padding-top:6px}
    .foot{margin-top:28px;color:#555;white-space:pre-line}
  </style></head><body>
    <div class="head">
      <div><b>${esc(cfg.company.name)}</b><br>${esc(cfg.company.address)}<br>เลขประจำตัวผู้เสียภาษี ${esc(cfg.company.taxId)}</div>
      <div style="text-align:right"><h1>${th}</h1><p class="sub">${en}</p></div>
    </div>
    <div class="info">
      <div class="cust">
        <span style="color:#555">ลูกค้า</span> <span class="name">${esc(doc.customer_name || '-')}</span><br>
        ${esc(doc.customer_address || '')}<br>
        เลขประจำตัวผู้เสียภาษี ${esc(doc.customer_tax_id || '-')}
      </div>
      <table class="docmeta">
        <tr><td>เลขที่</td><td>${esc(doc.doc_no)}</td></tr>
        <tr><td>วันที่ออก</td><td>${dateTh(doc.issue_date)}</td></tr>
        ${doc.due_date ? `<tr><td>ครบกำหนด</td><td>${dateTh(doc.due_date)}</td></tr>` : ''}
        ${doc.ref_text && !isBN ? `<tr><td>อ้างอิง</td><td>${esc(doc.ref_text)}</td></tr>` : ''}
      </table>
    </div>
    ${itemsTable}
    <div class="tot"><div><span>ยอดก่อน VAT</span><span>${baht(doc.subtotal)}</span></div>
      <div><span>ภาษีมูลค่าเพิ่ม 7%</span><span>${baht(doc.vat)}</span></div>
      <div class="grand"><span>ยอดรวมสุทธิ</span><span>${baht(doc.total)}</span></div></div>
    ${['INV', 'BN'].includes(doc.doc_type) ? `<div class="foot">ช่องทางชำระเงิน\n${esc(cfg.company.bank)}</div>` : ''}
  </body></html>`;
}

export async function generatePdf(doc) {
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(renderHtml(doc), { waitUntil: 'load' });
    return Buffer.from(await page.pdf({ format: 'A4', printBackground: true }));
  } finally {
    await browser.close();
  }
}