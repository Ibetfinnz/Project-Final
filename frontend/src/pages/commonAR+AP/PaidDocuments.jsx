import React, { useEffect, useMemo, useState } from 'react';
import { api, openBlob } from '../../api.js';
import { DOC_TYPES, baht, dateTh } from '../../format.js';
import { Card, PageHeader, StatusBadge } from '../../components.jsx';
import ViewDrawer from './DocumentViewDrawer.jsx';

/* ---------- ไอคอน ---------- */
const Svg = ({ children, size = 17 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const IChevron = ({ open }) => (
  <Svg size={14}>
    <path d={open ? 'M6 9l6 6 6-6' : 'M9 6l6 6-6 6'} />
  </Svg>
);
const ISearch = () => <Svg size={16}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></Svg>;
const ICalendar = () => <Svg size={20}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></Svg>;
const IDownload = ({ size = 16 }) => <Svg size={size}><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></Svg>;
const IEye = ({ size = 16 }) => <Svg size={size}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></Svg>;

const money = (n) => baht(n).replace('฿', '');
const inRange = (day, range) =>
  (!range.from || day >= range.from) && (!range.to || day <= range.to);

export default function PaidDocuments({ user }) {
  const isAP = user?.role === 'AP';
  const [groups, setGroups] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [filter, setFilter] = useState({ type: '', customer: '', q: '' });
  const [range, setRange] = useState({ from: '', to: '' });
  const [showCal, setShowCal] = useState(false);
  const [open, setOpen] = useState({});
  const [view, setView] = useState(null);
  const [error, setError] = useState('');

  const load = () => {
    api.get('/documents/paid-groups').then(setGroups).catch((e) => setError(e.message));
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { api.get('/customers').then(setCustomers).catch(() => setCustomers([])); }, []);

  const shown = useMemo(() => {
    const kw = filter.q.trim().toLowerCase();
    return groups.filter((g) => {
      const docs = g.docs || [];
      if (filter.type && !docs.some((d) => d.doc_type === filter.type)) return false;
      if (filter.customer && String(g.anchor.customer_id) !== String(filter.customer)) return false;
      if ((range.from || range.to) && !docs.some((d) => inRange(String(d.issue_date || '').slice(0, 10), range))) return false;
      if (kw) {
        const hay = [g.anchor.doc_no, g.anchor.customer_name, ...docs.map((d) => d.doc_no)]
          .filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }, [groups, filter, range]);

  const totalAmount = shown.reduce((s, g) => s + Number(g.total || 0), 0);
  const toggle = (id) => setOpen((p) => ({ ...p, [id]: !p[id] }));

  // เปิดหน้าต่างดูเอกสาร (อ่านอย่างเดียว) แบบเดียวกับหน้ารายการเอกสาร
  const openView = (d) => setView(d);

  const actions = (d) => (
    <div className="act" style={{ justifyContent: 'flex-end' }}>
      <button className="act-btn" title="ดูรายละเอียด" aria-label="ดูรายละเอียด"
        onClick={(e) => { e.stopPropagation(); openView(d); }}><IEye /></button>
      <button className="act-btn" title="ดาวน์โหลด PDF" aria-label="ดาวน์โหลด PDF"
        onClick={(e) => { e.stopPropagation(); openBlob(`/documents/${d.id}/pdf`); }}><IDownload /></button>
    </div>
  );

  return (
    <>
      <PageHeader
        title={isAP ? 'เอกสารรายจ่ายที่ชำระแล้ว' : 'เอกสารที่ชำระแล้ว'}
        sub="Paid documents — grouped by connected document chain" />
      {error && <div className="err">{error}</div>}

      <Card>
        <div className="filters">
          <select value={filter.type} onChange={(e) => setFilter({ ...filter, type: e.target.value })}>
            <option value="">--เลือกเอกสาร--</option>
            {Object.entries(DOC_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={filter.customer} onChange={(e) => setFilter({ ...filter, customer: e.target.value })}>
            <option value="">--เลือกบริษัท--</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="search-box">
            <ISearch />
            <input
              placeholder="ค้นหาเลขที่เอกสารหรือชื่อบริษัท"
              value={filter.q}
              onChange={(e) => setFilter({ ...filter, q: e.target.value })}
              style={{ minWidth: 260 }} />
          </div>
          <button className={'cal-btn' + (showCal || range.from || range.to ? ' on' : '')}
            aria-label="กรองตามวันที่" title="กรองตามวันที่" onClick={() => setShowCal((v) => !v)}><ICalendar /></button>
          <div style={{ marginLeft: 'auto', fontSize: 13, color: '#374151' }}>
            {shown.length} ชุด · รวม {money(totalAmount)} บาท
          </div>
        </div>

        {showCal && (
          <div className="filters range">
            <label>ตั้งแต่ <input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></label>
            <label>ถึง <input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></label>
            {(range.from || range.to) && <button className="btn sm" onClick={() => setRange({ from: '', to: '' })}>ล้างวันที่</button>}
          </div>
        )}

        <div className="t-wrap"><table className="t">
          <thead>
            <tr>
              <th style={{ width: 34 }} />
              <th>เลขที่เอกสาร</th>
              <th>{isAP ? 'คู่ค้า' : 'ลูกค้า'}</th>
              <th>วันที่ออก</th>
              <th>ครบกำหนด</th>
              <th className="r">ยอดเงิน (บาท)</th>
              <th>สถานะ</th>
              <th className="r">ในชุด</th>
              <th className="r">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr><td colSpan="9" className="empty">ยังไม่มีเอกสารที่ชำระแล้ว</td></tr>
            )}
            {shown.map((g) => {
              const isOpen = !!open[g.id];
              return (
                <React.Fragment key={g.id}>
                  <tr className="clickable" onClick={() => toggle(g.id)}>
                    <td style={{ color: '#6b7280' }}><IChevron open={isOpen} /></td>
                    <td>
                      {g.anchor.doc_no}
                      <small>{DOC_TYPES[g.anchor.doc_type]?.sub || g.anchor.doc_type}</small>
                    </td>
                    <td>{g.anchor.customer_name || '-'}</td>
                    <td>{dateTh(g.anchor.issue_date)}</td>
                    <td>{dateTh(g.anchor.due_date)}</td>
                    <td className="r">{money(g.total)}</td>
                    <td><StatusBadge status={g.anchor.status} /></td>
                    <td className="r">{g.count} ใบ</td>
                    <td className="r">{actions(g.anchor)}</td>
                  </tr>

                  {isOpen && (
                    <tr>
                      <td colSpan="9" style={{ background: '#fafafa', padding: '4px 12px 10px 44px' }}>
                        <div style={{ fontSize: 12, color: '#6b7280', padding: '6px 0' }}>
                          เอกสารที่เชื่อมต่อกันในชุดนี้
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: '#fff' }}>
                          <thead>
                            <tr style={{ color: '#6b7280' }}>
                              <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #eee' }}>ประเภท</th>
                              <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #eee' }}>เลขที่เอกสาร</th>
                              <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #eee' }}>วันที่ออก</th>
                              <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #eee' }}>ครบกำหนด</th>
                              <th style={{ textAlign: 'right', padding: '6px 8px', borderBottom: '1px solid #eee' }}>ยอดเงิน</th>
                              <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #eee' }}>สถานะ</th>
                              <th style={{ textAlign: 'right', padding: '6px 8px', borderBottom: '1px solid #eee', width: 90 }}>จัดการ</th>
                            </tr>
                          </thead>
                          <tbody>
                            {g.docs.map((d) => (
                              <tr key={d.id}>
                                <td style={{ padding: '5px 8px', borderBottom: '1px solid #f3f3f3' }}>
                                  <span className="dot" style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 8, marginRight: 6, background: '#93c5fd' }} />
                                  {DOC_TYPES[d.doc_type]?.label || d.doc_type}
                                </td>
                                <td style={{ padding: '5px 8px', borderBottom: '1px solid #f3f3f3' }}>{d.doc_no}</td>
                                <td style={{ padding: '5px 8px', borderBottom: '1px solid #f3f3f3' }}>{dateTh(d.issue_date)}</td>
                                <td style={{ padding: '5px 8px', borderBottom: '1px solid #f3f3f3' }}>{dateTh(d.due_date)}</td>
                                <td style={{ padding: '5px 8px', borderBottom: '1px solid #f3f3f3', textAlign: 'right' }}>{money(d.total)}</td>
                                <td style={{ padding: '5px 8px', borderBottom: '1px solid #f3f3f3' }}><StatusBadge status={d.status} /></td>
                                <td style={{ padding: '5px 8px', borderBottom: '1px solid #f3f3f3', textAlign: 'right' }}>{actions(d)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table></div>
      </Card>

      {view && (
        <ViewDrawer
          key={view.id}
          doc={view}
          onClose={() => setView(null)}
          isAP={isAP}
          readOnly
        />
      )}
    </>
  );
}
