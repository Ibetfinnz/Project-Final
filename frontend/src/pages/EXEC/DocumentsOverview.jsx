import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { api } from '../../api.js';
import { DOC_TYPES, baht } from '../../format.js';
import {
  IRefresh, Kpi, Panel, LegendChip, compact, compactBaht, shortDate, pct, dueLevel,
} from './ui.jsx';

const TYPE_ORDER = ['QT', 'OP', 'INV', 'BN', 'RC', 'TX'];

function DocTypePanel({ side, rows }) {
  const sideLabel = side === 'AR' ? 'รายรับ' : 'รายจ่าย';
  return (
    <Panel
      title={`เอกสาร${sideLabel}`}
      sub={`เปรียบเทียบฝั่ง${sideLabel}`}
      actions={<span className={`ex-side-pill ${side.toLowerCase()}`}>{side}</span>}
    >
      <div className="ex-doc-list">
        {TYPE_ORDER.map((type) => {
          const row = rows.find((r) => r.doc_type === type) || {
            doc_type: type, total: 0, paid: 0, pending: 0, overdue: 0, cancelled: 0,
          };
          return (
            <div className={`ex-doc-row ${row.total === 0 ? 'is-zero' : ''}`} key={type}>
              <span className="ex-doc-name">{DOC_TYPES[type]?.label || type}</span>
              <span className="ex-doc-count">{row.total} ใบ</span>
              <span className="ex-badge green">{sideLabel}</span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

export default function DocumentsOverview() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const nav = useNavigate();

  const load = () => api.get('/exec/overview')
    .then((d) => { setData(d); setError(''); })
    .catch((e) => setError(e.message));

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  if (!data) {
    return (
      <div className="ex-page">
        <div className="ex-page-head">
          <div>
            <h1>ภาพรวมเอกสารทั้งหมดในระบบ</h1>
            <p>Document command center</p>
          </div>
        </div>
        {error ? <div className="err">{error}</div> : <div className="ex-loading">กำลังโหลดข้อมูล…</div>}
      </div>
    );
  }

  const k = data.kpis;
  const total = Number(k.total || 0);
  const openCount = Math.max(0, total - Number(k.paid || 0) - Number(data.overview.all.cancelled || 0));
  const openAmount = Number(k.outstanding_amount || 0);

  const cash = data.cashflow || [];
  const cashChart = cash.map((x) => ({ ...x, label: shortDate(x.date) }));
  const totalIn = cash.reduce((s, x) => s + Number(x.income || 0), 0);
  const totalOut = cash.reduce((s, x) => s + Number(x.expense || 0), 0);

  const ov = data.overview;
  const docChart = [
    {
      name: 'เสร็จสิ้น',
      AR: Number(ov.AR.complete || 0),
      AP: Number(ov.AP.complete || 0),
    },
    {
      name: 'รอดำเนินการ',
      AR: Number(ov.AR.pending || 0) + Number(ov.AR.active || 0) + Number(ov.AR.overdue || 0),
      AP: Number(ov.AP.pending || 0) + Number(ov.AP.active || 0) + Number(ov.AP.overdue || 0),
    },
    {
      name: 'ยกเลิก',
      AR: Number(ov.AR.cancelled || 0),
      AP: Number(ov.AP.cancelled || 0),
    },
  ];

  return (
    <div className="ex-page">
      <div className="ex-page-head">
        <div>
          <h1>ภาพรวมเอกสารทั้งหมดในระบบ</h1>
          <p>Document command center</p>
        </div>
        <button className="ex-icon-btn" onClick={load} title="รีเฟรช" aria-label="รีเฟรช">
          <IRefresh />
        </button>
      </div>

      {error && <div className="err">{error}</div>}

      <div className="ex-kpis">
        <Kpi
          tone="blue"
          label="เอกสารทั้งหมด"
          value={k.total}
          unit="ใบ"
          delta={`${k.paid} เอกสารที่ปิดแล้วใน 2 สาย (AR/AP)`}
          deltaTone="flat"
          footer={`ไฟล์ต้นทาง ${k.files} ไฟล์`}
        />
        <Kpi
          tone="green"
          label="อนุมัติแล้ว"
          value={k.approved}
          unit="ใบ"
          delta={`${pct(k.approved, total)}% ของเอกสารทั้งหมด`}
          deltaTone="good"
          footer={`มูลค่า ${compactBaht(k.approved_amount)}`}
        />
        <Kpi
          tone="orange"
          label="รอดำเนินการ"
          value={openCount}
          unit="ใบ"
          delta={`${pct(openCount, total)}% ของเอกสารทั้งหมด`}
          deltaTone="flat"
          footer={`มูลค่า ${compactBaht(openAmount)}`}
        />
        <Kpi
          tone="red"
          label="ครบกำหนด / เกินกำหนด"
          value={k.due}
          unit="ใบ"
          delta={`${pct(k.due, total)}% ของเอกสารทั้งหมด`}
          deltaTone="bad"
          footer={`เกินกำหนดแล้ว ${k.overdue} ใบ`}
        />
      </div>

      <div className="ex-grid ex-grid-2">
        <DocTypePanel side="AR" rows={data.breakdown.AR} />
        <DocTypePanel side="AP" rows={data.breakdown.AP} />
      </div>

      <div className="ex-grid ex-grid-2">
        <Panel
          title="สถิติการเงินรับ–จ่าย"
          sub="Cash Flow Impact"
          actions={(
            <div className="ex-legends">
              <LegendChip color="#22c55e">Cash-in (AR)</LegendChip>
              <LegendChip color="#ef4444">Cash-out (AP)</LegendChip>
            </div>
          )}
        >
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={cashChart} margin={{ top: 6, right: 6, left: 0, bottom: 0 }} barGap={3}>
              <CartesianGrid vertical={false} stroke="#eef2f7" />
              <XAxis dataKey="label" tick={{ fontSize: 10.5 }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} interval={2} tickMargin={6} />
              <YAxis tickFormatter={compact} tick={{ fontSize: 10.5 }} width={46} tickLine={false} axisLine={false} />
              <Tooltip formatter={(v) => baht(v)} labelFormatter={(l) => 'วันที่ ' + l} />
              <Bar dataKey="income" name="Cash-in (AR)" fill="#22c55e" radius={[3, 3, 0, 0]} barSize={10} isAnimationActive={false} />
              <Bar dataKey="expense" name="Cash-out (AP)" fill="#ef4444" radius={[3, 3, 0, 0]} barSize={10} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
          <div className="ex-cf-summary">
            <div className="in"><b>{compactBaht(totalIn)}</b><span>รวม 15 วัน (AR)</span></div>
            <div className="out"><b>{compactBaht(totalOut)}</b><span>รวม 15 วัน (AP)</span></div>
          </div>
        </Panel>

        <Panel
          title="ภาพรวมเอกสาร"
          sub="Document Overview"
          actions={(
            <div className="ex-legends">
              <LegendChip color="#3b82f6">AR</LegendChip>
              <LegendChip color="#8b5cf6">AP</LegendChip>
            </div>
          )}
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={docChart} margin={{ top: 6, right: 6, left: 0, bottom: 0 }} barGap={4}>
              <CartesianGrid vertical={false} stroke="#eef2f7" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} tickMargin={6} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10.5 }} width={34} tickLine={false} axisLine={false} />
              <Tooltip formatter={(v, name) => [`${v} ใบ`, name]} />
              <Bar dataKey="AR" name="AR" fill="#3b82f6" radius={[3, 3, 0, 0]} barSize={14} isAnimationActive={false} />
              <Bar dataKey="AP" name="AP" fill="#8b5cf6" radius={[3, 3, 0, 0]} barSize={14} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <Panel title="เตือนถึงกำหนดชำระ" sub="Document Due Date Reminder">
        <div className="ex-due-list">
          {data.due.length === 0 && <div className="ex-empty">ไม่มีเอกสารที่ใกล้หรือเกินกำหนด</div>}
          {data.due.map((d) => {
            const lv = dueLevel(d.days_left);
            return (
              <button
                key={d.id}
                className={`ex-due-row ${lv.level}`}
                onClick={() => nav('/documents?q=' + encodeURIComponent(d.doc_no))}
              >
                <div className="ex-due-main">
                  <b>{d.doc_no}</b>
                  <span>
                    {DOC_TYPES[d.doc_type]?.label || d.doc_type}
                    {' · '}ครบกำหนด {shortDate(d.due_date)}
                    {' · '}{d.customer_name || '-'}
                    {' '}({d.side})
                  </span>
                </div>
                <div className="ex-due-right">
                  <b>{compactBaht(d.total)}</b>
                  <span className="ex-due-pill">{lv.label}</span>
                </div>
              </button>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
