import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, openBlob } from '../../api.js';
import { ALL_STATUSES, DOC_TYPES, STATUS, STATUS_BY_TYPE, baht, dateTh } from '../../format.js';
import { Card, PageHeader, StatusBadge } from '../../components.jsx';
import DocumentEditModal from './DocumentEditModal.jsx';
import ViewDrawer, { perm } from './DocumentViewDrawer.jsx';

/* ---------- ไอคอน ---------- */
const Svg = ({ children, size = 17 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const IEye = () => <Svg><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></Svg>;
const IDownload = ({ size }) => <Svg size={size}><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></Svg>;
const IPencil = ({ size }) => <Svg size={size}><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" /></Svg>;
const ITrash = () => <Svg><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" /></Svg>;
const ICalendar = () => <Svg size={20}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></Svg>;
const ISearch = () => <Svg size={16}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></Svg>;

/* ---------- หน้ารายการ ---------- */
export default function DocumentList({ user }) {
  const isAP = user?.role === 'AP';
  const isExec = user?.role === 'EXEC';
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [rows, setRows] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [filter, setFilter] = useState({
    status: params.get('status') || '',
    type: '',
    customer: '',
    q: params.get('q') || '',
    side: isExec ? (params.get('side') || '') : '',
  });
  const [range, setRange] = useState({ from: '', to: '' });
  const [showCal, setShowCal] = useState(false);
  const [editDoc, setEditDoc] = useState(null);
  const [view, setView] = useState(null);
  const [error, setError] = useState('');

  const load = () => {
    const p = new URLSearchParams();
    Object.entries(filter).forEach(([k, v]) => v && p.set(k, v));
    // ซ่อนเอกสารที่ชำระแล้วออกจากรายการหลัก (ย้ายไปหน้า "เอกสารที่ชำระแล้ว") ทั้งฝั่งรายรับและรายจ่าย
    p.set('exclude_paid', '1');
    api.get('/documents?' + p).then(setRows).catch((e) => setError(e.message));
  };
  useEffect(() => { api.get('/customers').then(setCustomers); }, []);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [filter]);

  const shown = useMemo(() => rows.filter((d) => {
    const day = String(d.issue_date || '').slice(0, 10);
    return (!range.from || day >= range.from) && (!range.to || day <= range.to);
  }), [rows, range]);

  const remove = async (d) => {
    if (!confirm(`ลบเอกสาร ${d.doc_no} ?`)) return;
    try { await api.del('/documents/' + d.id); load(); } catch (e) { alert(e.message); }
  };
  // เปิดหน้าต่างแก้ไข: ดึงข้อมูลเต็ม (รายการสินค้า/เอกสารอ้างอิง) ก่อนเสมอ
  const openEdit = async (d) => {
    try {
      const full = await api.get('/documents/' + d.id);
      setEditDoc(full);
    } catch (e) { alert(e.message); }
  };

  const statusOptions = filter.type ? STATUS_BY_TYPE[filter.type] : ALL_STATUSES;

  return (
    <>
      <PageHeader
        title={isAP ? 'รายการเอกสารรายจ่าย' : isExec ? 'รายการเอกสารทั้งหมด' : 'รายการเอกสารรายรับ'}
        sub={isAP ? 'List of expense documents' : isExec ? 'All documents · AR / AP (read-only)' : 'List of income documents'}>
        {!isExec && <button className="btn green" onClick={() => nav('/create')}>+ สร้างเอกสาร</button>}
      </PageHeader>
      {error && <div className="err">{error}</div>}
      <Card>
        <div className="filters">
          {isExec && (
            <select value={filter.side} onChange={(e) => setFilter({ ...filter, side: e.target.value })}>
              <option value="">--ทั้งสองฝั่ง--</option>
              <option value="AR">รายรับ (AR)</option>
              <option value="AP">รายจ่าย (AP)</option>
            </select>
          )}
          <select value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}>
            <option value="">--เลือกสถานะ--</option>
            {statusOptions.map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}
          </select>
          <select value={filter.type} onChange={(e) => setFilter({ ...filter, type: e.target.value, status: '' })}>
            <option value="">--เลือกเอกสาร--</option>
            {Object.entries(DOC_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={filter.customer} onChange={(e) => setFilter({ ...filter, customer: e.target.value })}>
            <option value="">--เลือกบริษัท--</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="search-box">
            <ISearch />
            <input placeholder="ค้นหาเลขที่เอกสารหรือชื่อบริษัท" value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} style={{ minWidth: 280 }} />
          </div>
          <button className={'cal-btn' + (showCal || range.from || range.to ? ' on' : '')} aria-label="กรองตามวันที่" title="กรองตามวันที่" onClick={() => setShowCal((v) => !v)}><ICalendar /></button>
        </div>

        {showCal && (
          <div className="filters range">
            <label>ตั้งแต่ <input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></label>
            <label>ถึง <input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></label>
            {(range.from || range.to) && <button className="btn sm" onClick={() => setRange({ from: '', to: '' })}>ล้างวันที่</button>}
          </div>
        )}

        <div className="t-wrap"><table className="t">
          <thead><tr><th>เลขที่เอกสาร</th>{isExec && <th>ฝั่ง</th>}<th>{isAP || isExec ? 'คู่ค้า' : 'ลูกค้า'}</th><th>วันที่ออก</th><th>ครบกำหนด</th><th className="r">ยอดเงิน (บาท)</th><th>สถานะ</th><th className="r">จัดการ</th></tr></thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={isExec ? 8 : 7} className="empty">ไม่พบเอกสาร ลองเปลี่ยนตัวกรอง หรือสร้างเอกสารใหม่</td></tr>}
            {shown.map((d) => {
              const p = perm(d);
              return (
                <tr key={d.id} className="clickable" onClick={() => setView(d)}>
                  <td>{d.doc_no}<small>{DOC_TYPES[d.doc_type].sub}</small></td>
                  {isExec && <td><span className={'exec-side-badge ' + String(d.side).toLowerCase()}>{d.side}</span></td>}
                  <td>{d.customer_name}</td><td>{dateTh(d.issue_date)}</td><td>{dateTh(d.due_date)}</td>
                  <td className="r">{baht(d.total).replace('฿', '')}</td>
                  <td><StatusBadge status={d.status} />{d.status_reason && <small title={d.status_reason}>{d.status_reason.slice(0, 40)}</small>}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="act">
                      <button className="act-btn" title="ดูรายละเอียด" aria-label="ดูรายละเอียด" onClick={() => setView(d)}><IEye /></button>
                      <button className="act-btn" title="ดาวน์โหลด PDF" aria-label="ดาวน์โหลด PDF" onClick={() => openBlob(`/documents/${d.id}/pdf`)}><IDownload /></button>
                      {!isExec && p.edit && <button className="act-btn edit" title="แก้ไขเอกสาร" aria-label="แก้ไขเอกสาร" onClick={() => openEdit(d)}><IPencil /></button>}
                      {!isExec && p.del && <button className="act-btn del" title="ลบ" aria-label="ลบ" onClick={() => remove(d)}><ITrash /></button>}
                    </div>
                  </td>
                </tr>
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
          onEdit={(d) => openEdit(d)}
          onConfirmPay={(d) => openEdit(d)}
          isAP={isAP}
          readOnly={isExec}
          onCreateInvoice={(d) => nav(`/create?type=INV&ref=${encodeURIComponent(d.doc_no)}`)}
          onNotifyCustomer={(d) => alert('TODO: ส่งอีเมลแจ้งลูกค้า ' + d.doc_no)}
        />
      )}

      {editDoc && (
        <DocumentEditModal
          key={editDoc.id}
          doc={editDoc}
          customers={customers}
          isAP={isAP}
          onClose={() => setEditDoc(null)}
          onSaved={() => { setEditDoc(null); setView(null); load(); }}
        />
      )}
    </>
  );
}
