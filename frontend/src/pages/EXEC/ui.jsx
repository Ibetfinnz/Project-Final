import React from 'react';
import { baht } from '../../format.js';

/* ---------- ไอคอน ---------- */
const Svg = ({ children, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const IRefresh = (p) => (
  <Svg {...p}><path d="M20 11a8 8 0 10-2.3 5.7" /><path d="M20 4v7h-7" /></Svg>
);
export const IInfo = (p) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></Svg>
);
export const IChevron = (p) => (
  <Svg {...p}><path d="M9 6l6 6-6 6" /></Svg>
);

/* ---------- ตัวเลข/วันที่ ---------- */
export const compact = (n) => {
  const v = Number(n || 0);
  const a = Math.abs(v);
  if (a >= 1e9) return (v / 1e9).toLocaleString('th-TH', { maximumFractionDigits: 1 }) + 'B';
  if (a >= 1e6) return (v / 1e6).toLocaleString('th-TH', { maximumFractionDigits: 1 }) + 'M';
  if (a >= 1e3) return (v / 1e3).toLocaleString('th-TH', { maximumFractionDigits: 1 }) + 'K';
  return v.toLocaleString('th-TH', { maximumFractionDigits: 0 });
};

export const compactBaht = (n) => {
  const v = Number(n || 0);
  return (v < 0 ? '-฿' : '฿') + compact(Math.abs(v));
};

export const signedBaht = (n) => (Number(n || 0) < 0 ? '-' : '') + baht(Math.abs(Number(n || 0)));

export const shortDate = (s) => {
  if (!s) return '-';
  const d = new Date(String(s).length === 10 ? s + 'T00:00:00' : s);
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
};

export const pct = (part, total) =>
  Number(total) > 0 ? Math.round((Number(part) / Number(total)) * 100) : 0;

/**
 * เปรียบเทียบช่วงปัจจุบันกับช่วงก่อน (30 วัน)
 * goodWhenUp = false ใช้กับรายจ่าย (เพิ่มขึ้น = แย่)
 */
export function deltaInfo(current, previous, goodWhenUp = true) {
  const cur = Number(current || 0);
  const prev = Number(previous || 0);
  if (prev > 0) {
    const change = ((cur - prev) / prev) * 100;
    const up = change >= 0;
    const good = up === goodWhenUp;
    return {
      text: `${up ? '▲' : '▼'} ${Math.abs(change).toFixed(0)}% เทียบ 30 วันก่อน`,
      tone: good ? 'good' : 'bad',
    };
  }
  if (cur !== 0) {
    const up = cur > 0;
    const good = up === goodWhenUp;
    return {
      text: `${up ? '▲' : '▼'} เริ่มมีรายการในช่วงนี้`,
      tone: good ? 'good' : 'bad',
    };
  }
  return { text: '— ยังไม่มีข้อมูล', tone: 'flat' };
}

/* ---------- ระดับความเร่งด่วนของกำหนดชำระ ---------- */
export function dueLevel(daysLeft) {
  const n = Number(daysLeft);
  if (n <= 0) return { level: 'danger', label: 'ด่วน' };
  if (n <= 3) return { level: 'warning', label: 'ใกล้ครบ' };
  if (n <= 7) return { level: 'soon', label: 'ใกล้ชำระ' };
  return { level: 'info', label: 'รอดำเนินการ' };
}

/* ---------- การ์ด KPI ---------- */
export function Kpi({
  tone = 'blue', label, value, unit, delta, deltaTone = 'flat', sub, footer, className = '',
}) {
  return (
    <div className={`ex-kpi tone-${tone} ${className}`}>
      <div className="ex-kpi-label">{label}</div>
      <div className="ex-kpi-value">
        {value}
        {unit && <span>{unit}</span>}
      </div>
      {delta && <div className={`ex-kpi-delta ${deltaTone}`}>{delta}</div>}
      {sub && <div className="ex-kpi-sub">{sub}</div>}
      {footer && (
        <>
          <div className="ex-kpi-line" />
          <div className="ex-kpi-footer">{footer}</div>
        </>
      )}
    </div>
  );
}

/* ---------- การ์ดทั่วไป ---------- */
export function Panel({ title, sub, actions, children, className = '', style }) {
  return (
    <section className={`ex-card ${className}`} style={style}>
      <div className="ex-card-head">
        <div className="ex-card-title">
          <h2>{title}</h2>
          {sub && <p>{sub}</p>}
        </div>
        {actions && <div className="ex-card-actions">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/* ---------- Legend แบบชิป ---------- */
export function LegendChip({ color, children }) {
  return (
    <span className="ex-legend-chip">
      <i style={{ background: color }} />
      {children}
    </span>
  );
}
