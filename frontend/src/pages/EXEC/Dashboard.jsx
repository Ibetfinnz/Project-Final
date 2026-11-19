import React, { useEffect, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie,
  PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { api } from '../../api.js';
import { baht } from '../../format.js';
import {
  IRefresh, IInfo, Kpi, Panel, LegendChip, compact, compactBaht, shortDate, deltaInfo,
} from './ui.jsx';

const COMPANY_COLORS = ['#22c55e', '#3b82f6', '#8b5cf6', '#f59e0b', '#14b8a6', '#ec4899'];
const AGING_LABELS = { '0-30': '0–30 วัน', '31-60': '31–60 วัน', '61-90': '61–90 วัน', '90+': '90+ วัน' };

function CompanyDonut({ data, centerLabel }) {
  const total = data.reduce((s, x) => s + Number(x.amount || 0), 0);
  return (
    <div className="ex-company">
      <div className="ex-company-chart">
        <ResponsiveContainer width="100%" height={150}>
          <PieChart>
            <Pie data={data} dataKey="amount" nameKey="name" innerRadius={44} outerRadius={66}
              paddingAngle={2} stroke="#fff" strokeWidth={2} isAnimationActive={false}>
              {data.map((x, i) => (
                <Cell key={x.name} fill={COMPANY_COLORS[i % COMPANY_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(v) => baht(v)} />
          </PieChart>
        </ResponsiveContainer>
        <div className="ex-company-center">
          <b>{compactBaht(total)}</b>
          <small>{centerLabel}</small>
        </div>
      </div>
      <div className="ex-company-legend">
        {data.map((x, i) => (
          <div className="ex-company-row" key={x.name}>
            <i style={{ background: COMPANY_COLORS[i % COMPANY_COLORS.length] }} />
            <span title={x.name}>{x.name}</span>
            <b>{compactBaht(x.amount)}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ExecDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = () => api.get('/exec/finance')
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
            <h1>แดชบอร์ดข้อมูลทางการเงินแบบรวมศูนย์</h1>
            <p>Master Financial Dashboard</p>
          </div>
        </div>
        {error ? <div className="err">{error}</div> : <div className="ex-loading">กำลังโหลดข้อมูล…</div>}
      </div>
    );
  }

  const k = data.kpis;
  const net = Number(k.net || 0);
  const ratio = k.ratio == null ? null : Number(k.ratio);

  const cashChart = (data.cashflow || []).map((x) => ({ ...x, label: shortDate(x.date) }));

  const agingChart = ['0-30', '31-60', '61-90', '90+'].map((bucket) => ({
    bucket: AGING_LABELS[bucket],
    AR: Number((data.aging.AR.find((x) => x.bucket === bucket) || {}).amount || 0),
    AP: Number((data.aging.AP.find((x) => x.bucket === bucket) || {}).amount || 0),
  }));

  const netDelta = deltaInfo(k.period_net, k.prev_net, true);
  const incomeDelta = deltaInfo(k.period_income, k.prev_income, true);
  const expenseDelta = deltaInfo(k.period_expense, k.prev_expense, false);

  const ratioValue = ratio == null ? '—' : `${ratio.toFixed(2)}x`;
  const ratioSub = ratio == null
    ? 'ยังไม่มีข้อมูลรายจ่าย'
    : ratio >= 1
      ? `Healthy — รายรับครอบคลุมค่าใช้จ่าย ${Math.round(ratio * 100)}%`
      : `Warning — รายรับครอบคลุมเพียง ${Math.round(ratio * 100)}%`;

  return (
    <div className="ex-page">
      <div className="ex-page-head">
        <div>
          <h1>แดชบอร์ดข้อมูลทางการเงินแบบรวมศูนย์</h1>
          <p>Master Financial Dashboard</p>
        </div>
        <button className="ex-icon-btn" onClick={load} title="รีเฟรช" aria-label="รีเฟรช">
          <IRefresh />
        </button>
      </div>

      {error && <div className="err">{error}</div>}

      <div className="ex-kpis">
        <Kpi
          tone="blue"
          label="กระแสเงินสดสุทธิ (Net cash flow)"
          value={compactBaht(net)}
          delta={netDelta.text}
          deltaTone={netDelta.tone}
        />
        <Kpi
          tone="green"
          label="รายรับรวม (Total income)"
          value={compactBaht(k.income)}
          delta={incomeDelta.text}
          deltaTone={incomeDelta.tone}
        />
        <Kpi
          tone="red"
          label="รายจ่ายรวม (Total expense)"
          value={compactBaht(k.expense)}
          delta={expenseDelta.text}
          deltaTone={expenseDelta.tone}
        />
        <Kpi
          tone="purple"
          label="In vs Out ratio"
          value={ratioValue}
          sub={ratioSub}
        />
      </div>

      <Panel title="เงินเข้า vs เงินออก" sub="Cash Flow analysis" className="ex-cash-panel">
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={cashChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
            <CartesianGrid vertical={false} stroke="#eef2f7" />
            <XAxis dataKey="label" tick={{ fontSize: 10.5 }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} interval={3} tickMargin={7} />
            <YAxis tickFormatter={compact} tick={{ fontSize: 10.5 }} width={46} tickLine={false} axisLine={false} />
            <Tooltip formatter={(v) => baht(v)} labelFormatter={(l) => 'วันที่ ' + l} />
            <Legend verticalAlign="bottom" align="left" iconType="square" iconSize={9} wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
            <Bar dataKey="income" name="เงินรับฝั่ง AR" fill="#22c55e" radius={[3, 3, 0, 0]} barSize={8} isAnimationActive={false} />
            <Bar dataKey="expense" name="รายจ่ายฝั่ง AP" fill="#ef4444" radius={[3, 3, 0, 0]} barSize={8} isAnimationActive={false} />
            <Line dataKey="net" name="รายรับ–รายจ่าย" stroke="#3b82f6" strokeWidth={2} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </Panel>

      <div className="ex-fin-layout">
        <div className="ex-fin-left">
          <div className="ex-fin-top">
            <div className="ex-outstanding green">
              <div className="ex-outstanding-label">ลูกหนี้คงค้าง (Total AR)</div>
              <div className="ex-outstanding-value">{compactBaht(k.ar_outstanding)}</div>
              <div className="ex-outstanding-sub">{k.ar_outstanding_count} เอกสารที่ยังไม่ปิด</div>
            </div>

            <div className="ex-outstanding red">
              <div className="ex-outstanding-label">เจ้าหนี้คงค้าง (Total AP)</div>
              <div className="ex-outstanding-value">{compactBaht(k.ap_outstanding)}</div>
              <div className="ex-outstanding-sub">{k.ap_outstanding_count} เอกสารที่ยังไม่ปิด</div>
            </div>
          </div>

          <Panel
            title="เปรียบเทียบอายุหนี้คงค้าง"
            sub="AR vs AP Aging Summary"
            actions={(
              <div className="ex-legends">
                <LegendChip color="#22c55e">AR (ลูกหนี้ – ค้างชำระ)</LegendChip>
                <LegendChip color="#ef4444">AP (เจ้าหนี้ – ค้างชำระ)</LegendChip>
              </div>
            )}
          >
            <ResponsiveContainer width="100%" height={270}>
              <BarChart data={agingChart} layout="vertical" margin={{ top: 6, right: 24, left: 0, bottom: 0 }} barGap={4}>
                <CartesianGrid horizontal={false} stroke="#eef2f7" />
                <XAxis type="number" tickFormatter={compact} tick={{ fontSize: 10.5 }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="bucket" width={78} tick={{ fontSize: 10.5 }} tickLine={false} axisLine={false} />
                <Tooltip formatter={(v) => baht(v)} />
                <Bar dataKey="AR" name="AR (ลูกหนี้ – ค้างชำระ)" fill="#22c55e" radius={[0, 3, 3, 0]} barSize={10} isAnimationActive={false} />
                <Bar dataKey="AP" name="AP (เจ้าหนี้ – ค้างชำระ)" fill="#ef4444" radius={[0, 3, 3, 0]} barSize={10} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </Panel>
        </div>

        <div className="ex-fin-right">
          <Panel title="รายรับแยกตามบริษัท" sub="Revenue streams">
            {data.revenue.length === 0
              ? <div className="ex-empty">ยังไม่มีข้อมูลรายได้</div>
              : <CompanyDonut data={data.revenue} centerLabel="รายได้รวม" />}
          </Panel>

          <Panel title="ค่าใช้จ่ายแยกตามบริษัท" sub="Expenses by company">
            {data.expense_by_company.length === 0
              ? <div className="ex-empty">ยังไม่มีข้อมูลรายจ่าย</div>
              : <CompanyDonut data={data.expense_by_company} centerLabel="รายจ่ายรวม" />}
          </Panel>
        </div>
      </div>

      <div className="ex-footnote">
        <IInfo size={14} />
        <span>
          รายรับ/รายจ่ายนับเฉพาะใบแจ้งหนี้ (INV) ที่ชำระแล้ว เพื่อไม่ให้ยอดซ้ำในสายเอกสาร ·
          ยอดคงค้างและ Aging นับทุกเอกสารที่ยังไม่ปิด
        </span>
      </div>
    </div>
  );
}
