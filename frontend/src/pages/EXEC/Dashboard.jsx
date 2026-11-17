import React, { useEffect, useState } from 'react';
import {
  Bar, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie,
  PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { api } from '../../api.js';
import { baht, num, timeTh } from '../../format.js';
import { PageHeader } from '../../components.jsx';
import {
  IWallet, IArrowUp, IArrowDown, IScale, IRefresh, IInfo,
  Kpi, Panel, Progress, compact, signedBaht, shortDate,
} from './ui.jsx';

function CompanyDonut({ data, palette, label }) {
  const total = data.reduce((s, x) => s + Number(x.amount || 0), 0);
  return (
    <div className="exec-overview-grid">
      <div className="exec-donut">
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie data={data} dataKey="amount" nameKey="name" innerRadius={56} outerRadius={84}
              paddingAngle={2} stroke="#fff" strokeWidth={2} isAnimationActive={false}>
              {data.map((x, i) => <Cell key={x.name} fill={palette[i % palette.length]} />)}
            </Pie>
            <Tooltip formatter={(v) => baht(v)} />
          </PieChart>
        </ResponsiveContainer>
        <div className="exec-donut-center">
          <b style={{ fontSize: 18 }}>{compact(total)}</b>
          <small>{label}</small>
        </div>
      </div>

      <div className="exec-legend">
        {data.map((x, i) => (
          <div className="exec-legend-row" key={x.name}>
            <span className="exec-dot" style={{ background: palette[i % palette.length] }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={x.name}>{x.name}</span>
            <b>{compact(x.amount)}</b>
            <small>{total ? Math.round((Number(x.amount) / total) * 100) : 0}%</small>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ExecDashboard() {
  const [data, setData] = useState(null);
  const [range, setRange] = useState(30);
  const [updated, setUpdated] = useState(null);
  const [error, setError] = useState('');

  const load = () => api.get('/exec/finance')
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
        <PageHeader title="แดชบอร์ดข้อมูลทางการเงินแบบรวมศูนย์" sub="Master financial dashboard" />
        {error ? <div className="err">{error}</div> : <div className="empty">กำลังโหลดข้อมูล…</div>}
      </>
    );
  }

  const k = data.kpis;
  const net = Number(k.net || 0);
  const ratio = k.ratio == null ? null : Number(k.ratio);

  const cash = data.cashflow.slice(-range);
  const totalIn = cash.reduce((s, x) => s + Number(x.income || 0), 0);
  const totalOut = cash.reduce((s, x) => s + Number(x.expense || 0), 0);

  const composition = [
    { name: 'รายรับ', value: Number(k.income || 0), color: '#22c55e' },
    { name: 'รายจ่าย', value: Number(k.expense || 0), color: '#ef4444' },
  ].filter((x) => x.value > 0);
  const compTotal = Number(k.income || 0) + Number(k.expense || 0);
  const incomePct = compTotal ? Math.round((Number(k.income) / compTotal) * 100) : 0;

  const arTotal = Number(k.income || 0) + Number(k.ar_outstanding || 0);
  const apTotal = Number(k.expense || 0) + Number(k.ap_outstanding || 0);
  const arPct = arTotal ? Math.round((Number(k.income) / arTotal) * 100) : 0;
  const apPct = apTotal ? Math.round((Number(k.expense) / apTotal) * 100) : 0;

  const agingChart = ['0-30', '31-60', '61-90', '90+'].map((bucket) => ({
    bucket,
    AR: Number((data.aging.AR.find((x) => x.bucket === bucket) || {}).amount || 0),
    AP: Number((data.aging.AP.find((x) => x.bucket === bucket) || {}).amount || 0),
  }));

  return (
    <>
      <PageHeader
        title="แดชบอร์ดข้อมูลทางการเงินแบบรวมศูนย์"
        sub="Master financial dashboard · ภาพรวมรายรับ–รายจ่ายทั้งระบบ"
      >
        {updated && <span className="exec-updated">อัปเดต {timeTh(updated)}</span>}
        <button className="btn exec-refresh" onClick={load}><IRefresh size={15} /> รีเฟรช</button>
      </PageHeader>

      {error && <div className="err">{error}</div>}

      <div className="kpis four">
        <Kpi
          tone={net >= 0 ? 'green' : 'red'}
          label="กระแสเงินสดสุทธิ"
          value={signedBaht(net)}
          hint="รายรับรวม − รายจ่ายรวม (INV ที่ชำระแล้ว)"
          icon={<IWallet />}
        />
        <Kpi
          tone="green"
          label="รายรับรวม"
          value={baht(k.income)}
          hint={`${k.income_count} ใบ · เดือนนี้ ${compact(k.month_income)} บาท`}
          icon={<IArrowUp />}
        />
        <Kpi
          tone="red"
          label="รายจ่ายรวม"
          value={baht(k.expense)}
          hint={`${k.expense_count} ใบ · เดือนนี้ ${compact(k.month_expense)} บาท`}
          icon={<IArrowDown />}
        />
        <Kpi
          tone="navy"
          label="อัตรารายรับ : รายจ่าย"
          value={ratio == null ? '—' : `${ratio.toFixed(2)} เท่า`}
          hint="รายรับต่อรายจ่าย 1 บาท"
          icon={<IScale />}
        />
      </div>

      <div className="exec-note">
        <IInfo size={16} />
        <span>
          รายรับ/รายจ่ายในหน้านี้นับเฉพาะ <b>ใบแจ้งหนี้ (INV)</b> ที่ชำระแล้ว
          เพื่อไม่ให้ยอดซ้ำกับใบสั่งซื้อ/ใบวางบิล/ใบเสร็จในสายเอกสารเดียวกัน
          ส่วนยอดคงค้างและ Aging นับทุกเอกสารที่ยังไม่ปิด
        </span>
      </div>

      <div className="exec-grid two">
        <Panel
          title="วิเคราะห์กระแสเงินสด"
          sub="Cash flow analysis · รายรับและรายจ่ายที่ชำระแล้ว"
          actions={(
            <div className="exec-seg">
              <button className={range === 7 ? 'on' : ''} onClick={() => setRange(7)}>7 วัน</button>
              <button className={range === 30 ? 'on' : ''} onClick={() => setRange(30)}>30 วัน</button>
            </div>
          )}
        >
          <ResponsiveContainer width="100%" height={320}>
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

        <Panel title="สัดส่วนรายรับ–รายจ่าย" sub="Income / expense composition">
          <div className="exec-overview-grid">
            <div className="exec-donut">
              {composition.length === 0 ? (
                <div className="empty" style={{ padding: 40 }}>ยังไม่มีการชำระเงิน</div>
              ) : (
                <ResponsiveContainer width="100%" height={190}>
                  <PieChart>
                    <Pie data={composition} dataKey="value" nameKey="name" innerRadius={56} outerRadius={82}
                      paddingAngle={2} stroke="#fff" strokeWidth={2} isAnimationActive={false}>
                      {composition.map((g) => <Cell key={g.name} fill={g.color} />)}
                    </Pie>
                    <Tooltip formatter={(v) => baht(v)} />
                  </PieChart>
                </ResponsiveContainer>
              )}
              <div className="exec-donut-center">
                <b style={{ fontSize: 19 }}>{compact(net)}</b>
                <small>สุทธิ (บาท)</small>
              </div>
            </div>

            <div className="exec-legend">
              <div className="exec-legend-row">
                <span className="exec-dot ar" /><span>รายรับ</span>
                <b>{compact(k.income)}</b><small>{incomePct}%</small>
              </div>
              <div className="exec-legend-row">
                <span className="exec-dot ap" /><span>รายจ่าย</span>
                <b>{compact(k.expense)}</b><small>{compTotal ? 100 - incomePct : 0}%</small>
              </div>
              <div className="exec-legend-row">
                <span className="exec-dot" style={{ background: '#94a3b8' }} /><span>ส่วนต่าง</span>
                <b>{compact(Math.abs(net))}</b><small>{net < 0 ? 'จ่ายเกิน' : 'เหลือ'}</small>
              </div>
            </div>
          </div>

          <div className="exec-progress-row">
            <div className="exec-progress-head"><span>ลูกหนี้ (AR)</span><b>เก็บแล้ว {arPct}%</b></div>
            <Progress value={k.income} max={arTotal} color="#22c55e" />
            <div className="exec-progress-foot">
              <span>รับแล้ว {compact(k.income)}</span>
              <span>คงค้าง {compact(k.ar_outstanding)}</span>
            </div>
          </div>

          <div className="exec-progress-row">
            <div className="exec-progress-head"><span>เจ้าหนี้ (AP)</span><b>จ่ายแล้ว {apPct}%</b></div>
            <Progress value={k.expense} max={apTotal} color="#ef4444" />
            <div className="exec-progress-foot">
              <span>จ่ายแล้ว {compact(k.expense)}</span>
              <span>คงค้าง {compact(k.ap_outstanding)}</span>
            </div>
          </div>
        </Panel>
      </div>

      <Panel title="อายุเอกสารคงค้าง (Aging)" sub="AR / AP aging · เอกสารที่ยังไม่ปิด">
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={agingChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#eef2f7" />
            <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={compact} tick={{ fontSize: 11 }} width={54} />
            <Tooltip formatter={(v) => baht(v)} labelFormatter={(l) => `อายุ ${l} วัน`} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="AR" name="ลูกหนี้ (AR)" fill="#22c55e" radius={[4, 4, 0, 0]} barSize={22} isAnimationActive={false} />
            <Bar dataKey="AP" name="เจ้าหนี้ (AP)" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={22} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>

        <div className="exec-aging-grid" style={{ marginTop: 18 }}>
          {['AR', 'AP'].map((side) => {
            const rows = data.aging[side] || [];
            const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
            const max = Math.max(...rows.map((r) => Number(r.amount || 0)), 1);
            return (
              <div className="exec-aging" key={side}>
                <div className="exec-aging-head">
                  <span className={'exec-dot ' + side.toLowerCase()} />
                  {side === 'AR' ? 'AR Aging · ลูกหนี้คงค้าง' : 'AP Aging · เจ้าหนี้คงค้าง'}
                  <b>{baht(total)}</b>
                </div>
                <div className="t-wrap">
                  <table className="t">
                    <thead>
                      <tr><th>ช่วงอายุ</th><th className="r">จำนวน</th><th className="r">ยอดเงิน (บาท)</th><th style={{ width: '30%' }}>สัดส่วน</th></tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.bucket}>
                          <td>{r.bucket === '90+' ? 'มากกว่า 90 วัน' : `${r.bucket} วัน`}</td>
                          <td className="r">{r.count}</td>
                          <td className="r">{num(r.amount)}</td>
                          <td><Progress value={r.amount} max={max} color={side === 'AR' ? '#22c55e' : '#ef4444'} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      <div className="exec-grid even">
        <Panel title="รายได้ตามบริษัท" sub="Revenue by company · Top 6 (INV ที่ชำระแล้ว)">
          {data.revenue.length === 0
            ? <div className="empty">ยังไม่มีข้อมูลรายได้</div>
            : (
              <CompanyDonut
                data={data.revenue}
                label="รายได้รวม"
                palette={['#15803d', '#22c55e', '#4ade80', '#86efac', '#bbf7d0', '#dcfce7']}
              />
            )}
        </Panel>
        <Panel title="รายจ่ายตามบริษัท" sub="Expenses by company · Top 6 (INV ที่ชำระแล้ว)">
          {data.expense_by_company.length === 0
            ? <div className="empty">ยังไม่มีข้อมูลรายจ่าย</div>
            : (
              <CompanyDonut
                data={data.expense_by_company}
                label="รายจ่ายรวม"
                palette={['#b91c1c', '#ef4444', '#f87171', '#fca5a5', '#fecaca', '#fee2e2']}
              />
            )}
        </Panel>
      </div>
    </>
  );
}
