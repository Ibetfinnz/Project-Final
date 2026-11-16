import React, { useEffect, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../../api.js';
import { baht, dateTh, num } from '../../format.js';
import { Card, PageHeader } from '../../components.jsx';

const dueBadge = (days) => {
  if (days == null) return { label: '-', bg: '#e5e7eb', fg: '#374151' };
  const n = Number(days);
  if (n < 0) return { label: 'ครบกำหนดชำระแล้ว', bg: '#ffb4b4', fg: '#7a0b0b' };
  if (n === 0) return { label: 'ครบกำหนดวันนี้', bg: '#ffb4b4', fg: '#7a0b0b' };
  if (n <= 3) return { label: `อีก ${n} วัน`, bg: '#ffd9a8', fg: '#7a4300' };
  if (n <= 7) return { label: `อีก ${n} วัน`, bg: '#cfe8ff', fg: '#0b3b73' };
  return { label: `อีก ${n} วัน`, bg: '#e5e7eb', fg: '#374151' };
};

export default function DashboardAP() {
  const [sum, setSum] = useState(null);
  const [chart, setChart] = useState([]);
  const [due, setDue] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = () =>
      Promise.all([api.get('/ap/summary'), api.get('/ap/chart'), api.get('/ap/due-soon')])
        .then(([s, c, d]) => { setSum(s); setChart(c); setDue(d); })
        .catch((e) => setError(e.message));
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  return (
    <>
      <PageHeader title="แดชบอร์ดรายจ่าย" sub="Spending dashboard" />
      {error && <div className="err">{error}</div>}

      <div className="kpis">
        <div className="kpi blue">
          <small>ยอดค้างชำระ</small>
          <div className="v">{baht(sum?.pending_amount)}</div>
          <small>{sum?.pending_count ?? 0} ใบแจ้งหนี้ที่ยังไม่ชำระ</small>
        </div>
        <div className="kpi green">
          <small>เอกสารรอตรวจ OCR</small>
          <div className="v">{sum?.ocr_pending ?? 0} ฉบับ</div>
          <small>{sum?.review_docs ?? 0} รายการรอตรวจสอบบัญชี</small>
        </div>
        <div className="kpi red">
          <small>รออนุมัติจ่าย</small>
          <div className="v">{sum?.approval_count ?? 0} รายการ</div>
          <small>รวม {num(sum?.approval_amount)} บาท</small>
        </div>
      </div>

      <Card>
        <h2>แดชบอร์ดรายจ่าย</h2><p className="sub">Expenditure dashboard</p>
        {chart.length === 0 ? <div className="empty">ยังไม่มีข้อมูลรายจ่ายในช่วงนี้</div> : (
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={chart.map((x) => ({ ...x, label: dateTh(x.date).replace(/ \d{4}$/, '') }))}>
              <CartesianGrid vertical={false} stroke="#eee" />
              <XAxis dataKey="label" /><YAxis tickFormatter={(v) => (v >= 1000 ? v / 1000 + 'K' : v)} />
              <Tooltip formatter={(v) => num(v) + ' บาท'} /><Legend />
              <Bar dataKey="spent" name="ยอดค่าใช้จ่ายจริง (AP)" fill="#e11d1d" barSize={16} />
              <Line dataKey="planned" name="ยอดตามใบสั่งซื้อ" stroke="#2563eb" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Card>
        <h2>ใกล้ถึงกำหนดชำระ</h2><p className="sub">Payment due soon</p>
        <div className="t-wrap"><table className="t">
          <thead><tr><th>เลขที่เอกสาร</th><th>คู่ค้า</th><th>ครบกำหนด</th><th className="r">ยอดค้าง (บาท)</th><th>เหลือเวลา</th></tr></thead>
          <tbody>
            {due.length === 0 && <tr><td colSpan="5" className="empty">ไม่มีเอกสารที่ใกล้ถึงกำหนดชำระ</td></tr>}
            {due.map((d) => {
              const b = dueBadge(d.days_left);
              return (
                <tr key={d.id}>
                  <td>{d.doc_no}</td>
                  <td>{d.customer_name || '-'}</td>
                  <td>{dateTh(d.due_date)}</td>
                  <td className="r">{num(d.total)}</td>
                  <td><span className="badge" style={{ background: b.bg, color: b.fg }}>{b.label}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </Card>
    </>
  );
}
