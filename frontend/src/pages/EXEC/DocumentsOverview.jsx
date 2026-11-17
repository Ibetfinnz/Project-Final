import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bar, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { api } from '../../api.js';
import { DOC_TYPES, baht, num, timeTh } from '../../format.js';
import { PageHeader } from '../../components.jsx';
import {
  IDocs, ICheck, IClock, IAlert, IRefresh,
  Kpi, Panel, StackBar, compact, daysBadge, shortDate, signedBaht,
} from './ui.jsx';

const GROUPS = [
  { key: 'complete', label: 'ชำระแล้ว', color: '#22c55e' },
  { key: 'active', label: 'กำลังดำเนินการ', color: '#60a5fa' },
  { key: 'pending', label: 'รอดำเนินการ', color: '#f59e0b' },
  { key: 'overdue', label: 'เกินกำหนด', color: '#ef4444' },
  { key: 'cancelled', label: 'ยกเลิก', color: '#cbd5e1' },
];

const sideParts = (o) => GROUPS.map((g) => ({
  key: g.key, label: g.label, color: g.color, value: Number(o?.[g.key] || 0),
}));

function TypeBreakdown({ side, rows }) {
  const filled = rows.filter((r) => r.total > 0);
  const count = filled.reduce((s, r) => s + r.total, 0);
  const amount = filled.reduce((s, r) => s + r.amount, 0);

  return (
    <div className="exec-side">
      <div className="exec-side-head">
        <span className={'exec-dot ' + side.toLowerCase()} />
        <b>{side === 'AR' ? 'รายรับ (AR)' : 'รายจ่าย (AP)'}</b>
        <span className="muted">{count} ใบ · {baht(amount)}</span>
      </div>

      {filled.length === 0 && <div className="empty" style={{ padding: 18 }}>ยังไม่มีเอกสาร</div>}

      {filled.map((r) => {
        const active = Math.max(0, r.total - r.paid - r.pending - r.overdue - r.cancelled);
        return (
          <div className="exec-type-row" key={r.doc_type}>
            <div className="exec-type-name">
              <b>{DOC_TYPES[r.doc_type]?.label || r.doc_type}</b>
              <small>{r.total} ใบ</small>
            </div>
            <div>
              <StackBar
                total={r.total}
                parts={[
                  { key: 'paid', label: 'ชำระแล้ว', value: r.paid, color: '#22c55e' },
                  { key: 'pending', label: 'รอดำเนินการ', value: r.pending, color: '#f59e0b' },
                  { key: 'overdue', label: 'เกินกำหนด', value: r.overdue, color: '#ef4444' },
                  { key: 'cancelled', label: 'ยกเลิก', value: r.cancelled, color: '#cbd5e1' },
                  { key: 'active', label: 'กำลังดำเนินการ', value: active, color: '#60a5fa' },
                ]}
              />
              <div className="exec-chips">
                {r.paid > 0 && <span className="exec-chip green">ชำระแล้ว {r.paid}</span>}
                {active > 0 && <span className="exec-chip blue">ดำเนินการ {active}</span>}
                {r.pending > 0 && <span className="exec-chip amber">รอ {r.pending}</span>}
                {r.overdue > 0 && <span className="exec-chip red">เกินกำหนด {r.overdue}</span>}
                {r.cancelled > 0 && <span className="exec-chip gray">ยกเลิก {r.cancelled}</span>}
              </div>
            </div>
            <div className="exec-type-amount">{compact(r.amount)}</div>
          </div>
        );
      })}
    </div>
  );
}

export default function DocumentsOverview() {
  const [data, setData] = useState(null);
  const [range, setRange] = useState(7);
  const [updated, setUpdated] = useState(null);
  const [error, setError] = useState('');
  const nav = useNavigate();

  const load = () => api.get('/exec/overview')
    .then((d) => { setData(d); setUpdated(new Date()); setError(''); })
    .catch((e) => setError(e.message));

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  if (!data) {
    return (
      <>
        <PageHeader title="ภาพรวมเอกสารทั้งหมดในระบบ" sub="Document command center" />
        {error ? <div className="err">{error}</div> : <div className="empty">กำลังโหลดข้อมูล…</div>}
      </>
    );
  }

  const k = data.kpis;
  const approvalRate = k.total ? Math.round((k.approved / k.total) * 100) : 0;
  const dueSoon = Math.max(0, (k.due || 0) - (k.overdue || 0));

  const cash = data.cashflow.slice(-range);
  const totalIn = cash.reduce((s, x) => s + Number(x.income || 0), 0);
  const totalOut = cash.reduce((s, x) => s + Number(x.expense || 0), 0);

  const pieData = GROUPS
    .map((g) => ({ ...g, value: Number(data.overview.all[g.key] || 0) }))
    .filter((g) => g.value > 0);
  const totalDocs = Number(data.overview.all.total || 0);

  return (
    <>
      <PageHeader
        title="ภาพรวมเอกสารทั้งหมดในระบบ"
        sub="Document command center · ภาพรวมเอกสาร AR/AP ทั้งสองฝั่ง"
      >
        {updated && <span className="exec-updated">อัปเดต {timeTh(updated)}</span>}
        <button className="btn exec-refresh" onClick={load}><IRefresh size={15} /> รีเฟรช</button>
      </PageHeader>

      {error && <div className="err">{error}</div>}

      <div className="kpis four">
        <Kpi
          tone="blue"
          label="เอกสารทั้งหมด"
          value={`${k.total} ฉบับ`}
          hint={`AR ${k.ar_count} · AP ${k.ap_count} · ไฟล์ต้นทาง ${k.files}`}
          icon={<IDocs />}
        />
        <Kpi
          tone="green"
          label="อนุมัติแล้ว"
          value={`${k.approved} ฉบับ`}
          hint={`${approvalRate}% ของเอกสารทั้งหมด`}
          icon={<ICheck />}
        >
          <div className="foot"><StackBar total={k.total} parts={[
            { key: 'approved', value: k.approved, color: '#22c55e' },
            { key: 'rest', value: Math.max(0, k.total - k.approved), color: '#e2e8f0' },
          ]} /></div>
        </Kpi>
        <Kpi
          tone="amber"
          label="รอดำเนินการ"
          value={`${k.pending} ฉบับ`}
          hint={`รออนุมัติ/รอตรวจสอบ · ชำระแล้ว ${k.paid} ฉบับ`}
          icon={<IClock />}
        />
        <Kpi
          tone="red"
          label="ครบกำหนด / เกินกำหนด"
          value={`${k.due} ฉบับ`}
          hint={`เกินกำหนดแล้ว ${k.overdue} · ใกล้ครบกำหนด ${dueSoon}`}
          icon={<IAlert />}
        />
      </div>

      <div className="exec-grid two">
        <Panel title="เอกสารแยกตามฝั่งและประเภท" sub="AR / AP breakdown by document type">
          <TypeBreakdown side="AR" rows={data.breakdown.AR} />
          <TypeBreakdown side="AP" rows={data.breakdown.AP} />
        </Panel>

        <Panel
          title="กระแสเงินสด"
          sub="Cash flow · เปรียบเทียบรายรับและรายจ่ายที่ชำระแล้ว"
          actions={(
            <div className="exec-seg">
              <button className={range === 7 ? 'on' : ''} onClick={() => setRange(7)}>7 วัน</button>
              <button className={range === 15 ? 'on' : ''} onClick={() => setRange(15)}>15 วัน</button>
            </div>
          )}
        >
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={cash.map((x) => ({ ...x, label: shortDate(x.date) }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#eef2f7" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis tickFormatter={compact} tick={{ fontSize: 11 }} width={54} />
              <Tooltip formatter={(v) => baht(v)} labelFormatter={(l) => 'วันที่ ' + l} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="income" name="รายรับ (AR)" fill="#22c55e" radius={[4, 4, 0, 0]} barSize={14} isAnimationActive={false} />
              <Bar dataKey="expense" name="รายจ่าย (AP)" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={14} isAnimationActive={false} />
              <Line dataKey="net" name="สุทธิ" stroke="#2563eb" strokeWidth={2} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="exec-cash-summary">
            <div><span className="exec-dot ar" />รายรับ <b>{baht(totalIn)}</b></div>
            <div><span className="exec-dot ap" />รายจ่าย <b>{baht(totalOut)}</b></div>
            <div><span className="exec-dot blue" />สุทธิ <b>{signedBaht(totalIn - totalOut)}</b></div>
          </div>
        </Panel>
      </div>

      <div className="exec-grid two">
        <Panel title="ภาพรวมสถานะเอกสาร" sub="Document overview · สัดส่วนตามสถานะ">
          {pieData.length === 0 ? <div className="empty">ยังไม่มีข้อมูลเอกสาร</div> : (
            <>
              <div className="exec-overview-grid">
                <div className="exec-donut">
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="label" innerRadius={58} outerRadius={84}
                        paddingAngle={2} stroke="#fff" strokeWidth={2} isAnimationActive={false}>
                        {pieData.map((g) => <Cell key={g.key} fill={g.color} />)}
                      </Pie>
                      <Tooltip formatter={(v, name) => [`${v} ฉบับ`, name]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="exec-donut-center">
                    <b>{totalDocs}</b>
                    <small>เอกสาร</small>
                  </div>
                </div>
                <div className="exec-legend">
                  {GROUPS.map((g) => {
                    const value = Number(data.overview.all[g.key] || 0);
                    return (
                      <div className="exec-legend-row" key={g.key}>
                        <span className="exec-dot" style={{ background: g.color }} />
                        <span>{g.label}</span>
                        <b>{value}</b>
                        <small>{totalDocs ? Math.round((value / totalDocs) * 100) : 0}%</small>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="exec-side-mini">
                {['AR', 'AP'].map((side) => {
                  const o = data.overview[side];
                  return (
                    <div className="exec-mini-side" key={side}>
                      <div className="exec-mini-head">
                        <span className={'exec-dot ' + side.toLowerCase()} />
                        {side === 'AR' ? 'รายรับ (AR)' : 'รายจ่าย (AP)'}
                        <b>{o.total} ใบ</b>
                      </div>
                      <StackBar total={o.total} parts={sideParts(o)} />
                      <div className="exec-chips">
                        {o.complete > 0 && <span className="exec-chip green">ชำระแล้ว {o.complete}</span>}
                        {o.active > 0 && <span className="exec-chip blue">ดำเนินการ {o.active}</span>}
                        {o.pending > 0 && <span className="exec-chip amber">รอ {o.pending}</span>}
                        {o.overdue > 0 && <span className="exec-chip red">เกินกำหนด {o.overdue}</span>}
                        {o.cancelled > 0 && <span className="exec-chip gray">ยกเลิก {o.cancelled}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </Panel>

        <Panel title="เอกสารใกล้ถึงกำหนดชำระ" sub="Due date reminders · คลิกเพื่อเปิดเอกสาร">
          <div className="t-wrap">
            <table className="t">
              <thead>
                <tr>
                  <th>เลขที่เอกสาร</th><th>ฝั่ง</th><th>คู่ค้า</th><th>ครบกำหนด</th>
                  <th className="r">ยอดเงิน (บาท)</th><th>เหลือเวลา</th>
                </tr>
              </thead>
              <tbody>
                {data.due.length === 0 && <tr><td colSpan="6" className="empty">ไม่มีเอกสารที่ใกล้หรือเกินกำหนด</td></tr>}
                {data.due.map((d) => {
                  const b = daysBadge(d.days_left);
                  return (
                    <tr key={d.id} className="clickable" onClick={() => nav('/documents?q=' + encodeURIComponent(d.doc_no))}>
                      <td>{d.doc_no}<small>{DOC_TYPES[d.doc_type]?.label || d.doc_type}</small></td>
                      <td><span className={'exec-side-badge ' + d.side.toLowerCase()}>{d.side}</span></td>
                      <td>{d.customer_name || '-'}</td>
                      <td>{shortDate(d.due_date)}</td>
                      <td className="r">{num(d.total)}</td>
                      <td><span className="badge" style={{ background: b.bg, color: b.fg }}>{b.label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </>
  );
}
