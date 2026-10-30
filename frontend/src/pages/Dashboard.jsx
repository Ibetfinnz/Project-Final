import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../api.js';
import { baht, dateTh, num } from '../format.js';
import { Card, PageHeader, StatusBadge } from '../components.jsx';

export default function Dashboard() {
  const [sum, setSum] = useState(null);
  const [chart, setChart] = useState([]);
  const [todos, setTodos] = useState([]);
  const [error, setError] = useState('');
  const nav = useNavigate();

  useEffect(() => {
    const load = () =>
      Promise.all([api.get('/dashboard/summary'), api.get('/dashboard/chart'), api.get('/dashboard/todos')])
        .then(([s, c, t]) => { setSum(s); setChart(c); setTodos(t); })
        .catch((e) => setError(e.message));
    load();
    const t = setInterval(load, 30000); // polling ทุก 30 วินาที
    return () => clearInterval(t);
  }, []);

  return (
    <>
      <PageHeader title="แดชบอร์ดรายรับ" sub="Revenue Dashboard" />
      {error && <div className="err">{error}</div>}
      <div className="kpis">
        <div className="kpi blue"><small>ยอดรอรับชำระ</small><div className="v">{baht(sum?.pending_amount)}</div><small>{sum?.pending_count ?? 0} เอกสาร ยังอยู่ในกำหนด</small></div>
        <div className="kpi green"><small>รับชำระแล้ว</small><div className="v">{baht(sum?.paid_amount)}</div><small>รับชำระแล้วเดือนนี้</small></div>
        <div className="kpi red"><small>เกินกำหนดชำระ</small><div className="v">{baht(sum?.overdue_amount)}</div><small>{sum?.overdue_count ?? 0} เอกสาร ต้องติดตาม</small></div>
      </div>

      <Card>
        <h2>แดชบอร์ดรายรับ</h2><p className="sub">Revenue bar chart (30 วันล่าสุด)</p>
        {chart.length === 0 ? <div className="empty">ยังไม่มีข้อมูลรายรับในช่วงนี้</div> : (
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={chart.map((x) => ({ ...x, label: dateTh(x.date).replace(/ \d{4}$/, '') }))}>
              <CartesianGrid vertical={false} stroke="#eee" />
              <XAxis dataKey="label" /><YAxis tickFormatter={(v) => (v >= 1000 ? v / 1000 + 'K' : v)} />
              <Tooltip formatter={(v) => num(v) + ' บาท'} /><Legend />
              <Bar dataKey="received" name="กระแสเงินสดรับ" fill="#16a34a" barSize={14} />
              <Line dataKey="expected" name="ยอดที่ถึงกำหนดรับ" stroke="#5b6cf0" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Card>
        <h2>รายการที่ต้องทำ</h2><p className="sub">To-do list</p>
        <div className="t-wrap"><table className="t">
          <thead><tr><th>หัวข้อ</th><th>คำอธิบาย</th><th>วันที่/เวลา</th><th>สถานะ</th><th>รายการที่ต้องทำ</th></tr></thead>
          <tbody>
            {todos.length === 0 && <tr><td colSpan="5" className="empty">ไม่มีงานค้าง</td></tr>}
            {todos.map((t, i) => (
              <tr key={i}>
                <td>{t.title}</td><td>{t.description}</td>
                <td>{t.overdue_days != null ? `เกินมา ${t.overdue_days} วัน`
  : t.due_in_days != null ? (t.due_in_days === 0 ? 'ครบกำหนดวันนี้' : `อีก ${t.due_in_days} วัน`)
  : t.at ? dateTh(t.at) : '-'}</td>
                <td><StatusBadge status={t.status} /></td>
                <td><button className="btn red-o sm" onClick={() => nav(t.link)}>{t.action}</button></td>
                
              </tr>
            ))}
          </tbody>
        </table></div>
      </Card>
    </>
  );
}
