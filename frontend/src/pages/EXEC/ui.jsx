import React from 'react';
import { baht } from '../../format.js';

/* ---------- ไอคอน ---------- */
const Svg = ({ children, size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const IDocs = (p) => (
  <Svg {...p}><path d="M8 3h9l4 4v14H8z" /><path d="M17 3v4h4" /><path d="M4 7v14h11" /><path d="M12 12h5M12 16h5" /></Svg>
);
export const ICheck = (p) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" /></Svg>
);
export const IClock = (p) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Svg>
);
export const IAlert = (p) => (
  <Svg {...p}><path d="M12 3l9 17H3z" /><path d="M12 9v5M12 17h.01" /></Svg>
);
export const IWallet = (p) => (
  <Svg {...p}><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18" /><circle cx="17" cy="15" r="1.2" /></Svg>
);
export const IArrowUp = (p) => (
  <Svg {...p}><path d="M12 20V5M6 11l6-6 6 6" /></Svg>
);
export const IArrowDown = (p) => (
  <Svg {...p}><path d="M12 4v15M6 13l6 6 6-6" /></Svg>
);
export const IScale = (p) => (
  <Svg {...p}><path d="M12 4v16M6 20h12M4 8h16" /><path d="M4 8l-2 5h4zM20 8l-2 5h4z" /></Svg>
);
export const IRefresh = (p) => (
  <Svg {...p}><path d="M20 11a8 8 0 10-2.3 5.7" /><path d="M20 4v7h-7" /></Svg>
);
export const IInfo = (p) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></Svg>
);
export const IBuilding = (p) => (
  <Svg {...p}><path d="M4 21V5a2 2 0 012-2h7a2 2 0 012 2v16" /><path d="M15 9h3a2 2 0 012 2v10M8 7h3M8 11h3M8 15h3M2 21h20" /></Svg>
);

/* ---------- สีประจำโทน ---------- */
export const TONES = {
  blue: { fg: '#1d4ed8', bg: '#eff6ff', line: '#3b82f6' },
  green: { fg: '#15803d', bg: '#ecfdf5', line: '#22c55e' },
  red: { fg: '#b91c1c', bg: '#fef2f2', line: '#ef4444' },
  amber: { fg: '#b45309', bg: '#fffbeb', line: '#f59e0b' },
  violet: { fg: '#6d28d9', bg: '#f5f3ff', line: '#8b5cf6' },
  navy: { fg: '#1e3a8a', bg: '#eef2ff', line: '#6366f1' },
  slate: { fg: '#334155', bg: '#f8fafc', line: '#94a3b8' },
};

/* ---------- ตัวเลข/วันที่ ---------- */
export const compact = (n) => {
  const v = Number(n || 0);
  const a = Math.abs(v);
  if (a >= 1e9) return (v / 1e9).toLocaleString('th-TH', { maximumFractionDigits: 1 }) + 'B';
  if (a >= 1e6) return (v / 1e6).toLocaleString('th-TH', { maximumFractionDigits: 1 }) + 'M';
  if (a >= 1e3) return (v / 1e3).toLocaleString('th-TH', { maximumFractionDigits: 0 }) + 'K';
  return v.toLocaleString('th-TH', { maximumFractionDigits: 0 });
};

export const signedBaht = (n) => (Number(n || 0) < 0 ? '-' : '') + baht(Math.abs(Number(n || 0)));

export const shortDate = (s) => {
  if (!s) return '-';
  const d = new Date(String(s).length === 10 ? s + 'T00:00:00' : s);
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
};

export const daysBadge = (days) => {
  if (days == null) return { label: 'ไม่มีกำหนด', bg: '#e5e7eb', fg: '#374151' };
  const n = Number(days);
  if (n < 0) return { label: `เกิน ${Math.abs(n)} วัน`, bg: '#fecaca', fg: '#7f1d1d' };
  if (n === 0) return { label: 'ครบกำหนดวันนี้', bg: '#fecaca', fg: '#7f1d1d' };
  if (n <= 3) return { label: `อีก ${n} วัน`, bg: '#fed7aa', fg: '#7c2d12' };
  if (n <= 7) return { label: `อีก ${n} วัน`, bg: '#fef3c7', fg: '#92400e' };
  return { label: `อีก ${n} วัน`, bg: '#e0f2fe', fg: '#075985' };
};

/* ---------- การ์ด KPI ---------- */
export function Kpi({ tone = 'blue', label, value, hint, icon, children }) {
  const t = TONES[tone] || TONES.blue;
  return (
    <div className="exec-kpi" style={{ borderTopColor: t.line }}>
      <span className="ico" style={{ background: t.bg, color: t.fg }}>{icon}</span>
      <div className="body">
        <small>{label}</small>
        <div className="v" style={{ color: t.fg }}>{value}</div>
        {hint && <small className="hint">{hint}</small>}
        {children}
      </div>
    </div>
  );
}

/* ---------- การ์ดทั่วไป ---------- */
export function Panel({ title, sub, actions, children, style, className = '' }) {
  return (
    <section className={'card exec-panel ' + className} style={style}>
      <div className="exec-panel-head">
        <div>
          <h2>{title}</h2>
          {sub && <p className="sub">{sub}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

/* ---------- แถบเปรียบเทียบแบบซ้อน ---------- */
export function StackBar({ parts = [], total = 0, height }) {
  const n = Number(total || 0);
  return (
    <div className="exec-stack" style={height ? { height } : undefined}>
      {n <= 0
        ? <i style={{ width: '100%', background: '#eef2f7' }} />
        : parts.filter((p) => Number(p.value) > 0).map((p) => (
          <i
            key={p.key}
            title={`${p.label || p.key}: ${p.value}`}
            style={{ width: `${(Number(p.value) / n) * 100}%`, background: p.color }}
          />
        ))}
    </div>
  );
}

/* ---------- แถบความคืบหน้า ---------- */
export function Progress({ value, max, color = '#3b82f6' }) {
  const pct = Number(max) > 0 ? Math.min(100, (Number(value) / Number(max)) * 100) : 0;
  return (
    <div className="exec-progress">
      <i style={{ width: pct + '%', background: color }} />
    </div>
  );
}
