import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, openBlob } from '../api.js';
import { ALL_STATUSES, DOC_TYPES, STATUS, STATUS_BY_TYPE, baht, dateTh } from '../format.js';
import { Card, Modal, PageHeader, StatusBadge } from '../components.jsx';

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
const IClose = () => <Svg size={20}><path d="M18 6L6 18M6 6l12 12" /></Svg>;
const ISend = () => <Svg size={14}><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></Svg>;
const IDoc = () => <Svg size={14}><path d="M14 3H6a1 1 0 00-1 1v16a1 1 0 001 1h12a1 1 0 001-1V8l-5-5zM14 3v5h5M9 13h6M9 17h6" /></Svg>;
const IMoney = () => <Svg size={14}><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="3" /></Svg>;

/* ---------- สิทธิ์การจัดการ: ขึ้นกับ "ประเภทเอกสาร + สถานะ" ----------
   จับคู่จากข้อความสถานะ (label) เพื่อไม่ต้องรู้ key ใน format.js
   ปรับเงื่อนไขได้ที่ฟังก์ชันนี้ที่เดียว
   - ดู / ดาวน์โหลด PDF: ทำได้ทุกเอกสาร
   - เอกสารที่ปิดแล้ว (ชำระแล้ว/อนุมัติแล้ว/ไม่อนุมัติ/ยกเลิก) และ RC: ห้ามแก้/ลบ
   - INV ที่ออกแล้ว (รอชำระ/เกินกำหนด): ห้ามแก้/ลบ
   - QT/OP ที่ยังไม่ปิด: แก้/ลบได้
   - BN: แก้ได้เมื่อยังไม่ครบ/ร่าง/รอตรวจสอบ ลบได้เฉพาะร่าง/ไม่ครบ */
const has = (s, ...words) => words.some((w) => s.includes(w));
const statusLabel = (d) => STATUS[d.status]?.label || '';
function perm(d) {
  const s = statusLabel(d);
  const closed = has(s, 'ชำระแล้ว', 'อนุมัติแล้ว', 'ยกเลิก', 'ไม่ได้รับ');
  const incomplete = has(s, 'ไม่ครบ', 'ร่าง');
  if (['RC', 'TX'].includes(d.doc_type) || closed) return { edit: false, del: false };
  if (d.doc_type === 'INV') return { edit: incomplete || has(s, 'ตรวจสอบ'), del: false };
  if (d.doc_type === 'BN') return { edit: incomplete || has(s, 'ตรวจสอบ'), del: incomplete };
  return { edit: true, del: true }; // QT, OP
}

/* ---------- ค่าตามประเภทเอกสาร (ตามดีไซน์ Figma) ---------- */
const TYPE_COLOR = { QT: '#e5484d', OP: '#d946ef', INV: '#f59e0b', BN: '#eab308', PAY: '#e5484d', RC: '#22c55e' , TX: '#22c55e'};
const TAB_COLOR = { QT: '#f59e0b', OP: '#c026d3', INV: '#f59e0b', BN: '#f59e0b', RC: '#65a30d' ,TX: '#65a30d'};
const TABS_BY_TYPE = {
  QT: ['detail', 'history'],
  OP: ['detail', 'links'],
  INV: ['detail', 'links', 'history'],
  BN: ['detail', 'links', 'history'],
  RC: ['detail', 'links', 'history'],
  TX: ['detail', 'links', 'history']
};
const TAB_LABEL = { detail: 'รายละเอียด', links: 'การเชื่อมต่อเอกสาร', history: 'ประวัติการแก้ไข' };

/* ---------- การเชื่อมต่อเอกสาร ----------
   ใช้ d.chain ที่ backend ส่งมา (สายเอกสารต้นทาง + ปลายทางทั้งหมด เรียงตาม QT > OP > INV > BN > จ่ายเงิน > RC)
   ถ้าไม่มี สร้างแบบง่ายจาก ref_text + ตัวเอกสารเอง */
function buildLinks(d) {
  if (Array.isArray(d.chain) && d.chain.length) {
    return d.chain.map((x) => ({
      doc_type: x.doc_type,
      label: x.label || `${DOC_TYPES[x.doc_type]?.label || ''} ${x.doc_no}`,
      at: x.at,
    }));
  }
  const list = [];
  if (d.ref_text) list.push({ doc_type: null, label: d.ref_text, at: null });
  list.push({ doc_type: d.doc_type, label: `${DOC_TYPES[d.doc_type]?.label || ''} ${d.doc_no}`, at: d.issue_date });
  return list;
}

/* ---------- ตารางรายการในเอกสาร (แท็บรายละเอียด) ----------
   QT/OP/INV/RC: รายการสินค้าและบริการ (d.items)
   BN: ใบแจ้งหนี้ที่วางบิล (d.linked) */
const thS = { textAlign: 'left', padding: '6px 4px', color: '#6b7280', fontWeight: 600, borderBottom: '1px solid #e5e7eb' };
const tdS = { padding: '6px 4px', borderBottom: '1px solid #f1f1f1', verticalAlign: 'top' };
const rS = { textAlign: 'right' };
const money = (n) => baht(n).replace('฿', '');

function DocLines({ d }) {
  const isBN = d.doc_type === 'BN';
  const list = isBN ? d.linked : d.items;
  if (!Array.isArray(list) || list.length === 0) return null;
  return (
    <div style={{ margin: '14px 0' }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>{isBN ? 'ใบแจ้งหนี้ที่วางบิล' : 'รายการสินค้าและบริการ'}</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          {isBN ? (
            <tr><th style={thS}>#</th><th style={thS}>เลขที่ใบแจ้งหนี้</th><th style={thS}>วันที่ออก</th><th style={{ ...thS, ...rS }}>จำนวนเงิน</th></tr>
          ) : (
            <tr><th style={thS}>#</th><th style={thS}>รายการ</th><th style={{ ...thS, ...rS }}>จำนวน</th><th style={{ ...thS, ...rS }}>ราคา/หน่วย</th><th style={{ ...thS, ...rS }}>จำนวนเงิน</th></tr>
          )}
        </thead>
        <tbody>
          {list.map((x, i) => (isBN ? (
            <tr key={x.id}><td style={tdS}>{i + 1}</td><td style={tdS}>{x.doc_no}</td><td style={tdS}>{dateTh(x.issue_date)}</td><td style={{ ...tdS, ...rS }}>{money(x.subtotal)}</td></tr>
          ) : (
            <tr key={x.id ?? i}><td style={tdS}>{i + 1}</td><td style={tdS}>{x.description}</td><td style={{ ...tdS, ...rS }}>{Number(x.qty)}</td><td style={{ ...tdS, ...rS }}>{money(x.unit_price)}</td><td style={{ ...tdS, ...rS }}>{money(x.amount)}</td></tr>
          )))}
        </tbody>
      </table>
      <div style={{ marginLeft: 'auto', marginTop: 8, width: 230, fontSize: 13 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>ยอดก่อน VAT</span><span>{money(d.subtotal)}</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>ภาษีมูลค่าเพิ่ม 7%</span><span>{money(d.vat)}</span></div>
      </div>
    </div>
  );
}

/* ---------- Drawer ด้านข้าง ---------- */
function ViewDrawer({ doc, onClose, onEdit, onCreateInvoice, onNotifyCustomer, onConfirmPay }) {
  const tabs = TABS_BY_TYPE[doc.doc_type] || ['detail'];
  const [tab, setTab] = useState('detail');
  const [full, setFull] = useState(null);
  const p = perm(doc);

  useEffect(() => {
    api.get('/documents/' + doc.id).then(setFull).catch(() => setFull(null));
  }, [doc.id]);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const d = { ...doc, ...(full || {}) };
  const t = d.doc_type;
  const history = Array.isArray(d.history) ? d.history : [];
  const links = buildLinks(d);

  const rows = [
    ['ประเภท', DOC_TYPES[t]?.label],
    ['ลูกค้า', d.customer_name || '-'],
    ['อีเมล', d.customer_email || '-'],
    ['วันที่ออก', dateTh(d.issue_date)],
    ['ครบกำหนด', ['INV', 'BN'].includes(t) && d.due_date ? dateTh(d.due_date) : null],
    ['อ้างอิง', ['INV', 'BN', 'RC'].includes(t) ? d.ref_text : null],
    ['สลิป', t === 'RC' ? d.slip_name || d.slip : null],
    ['ตรวจกับเอกสารก่อนหน้า', { matched: 'ตรงกัน', mismatch: 'ไม่ตรงกัน', no_reference: 'ไม่พบเอกสารก่อนหน้า' }[d.check_result] || null],
    ['ยอดรวมสุทธิ', `${baht(d.total).replace('฿', '')} บาท`],
  ].filter(([, v]) => v);

  return (
    <>
      <div className="drawer-bg" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={`รายละเอียด ${doc.doc_no}`}
        style={{ '--tab-color': TAB_COLOR[t] }}>
        <div className="drawer-head">
          <div>
            <h3>{doc.doc_no}</h3>
            <StatusBadge status={doc.status} />
          </div>
          <button className="icon-btn" aria-label="ปิด" onClick={onClose}><IClose /></button>
        </div>

        <div className="drawer-tabs">
          {tabs.map((k) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{TAB_LABEL[k]}</button>
          ))}
        </div>

        <div className="drawer-body">
          {tab === 'detail' && (
            <>
              <dl className="kv">
                {rows.map(([k, v]) => (<React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>))}
              </dl>

              <DocLines d={d} />

              <div className="drawer-actions">
                <div className="act-col">
                  <button className="btn sm" onClick={() => openBlob(`/documents/${doc.id}/pdf`)}><IDownload size={14} /> ดาวน์โหลด PDF</button>
                </div>
                {t === 'OP' && (
                  <>
                    <div className="act-col">
                      <button className="btn sm" onClick={() => onNotifyCustomer?.(d)}><ISend /> แจ้งลูกค้าตรวจสอบ</button>
                      <small className="hint">กรณีข้อมูลคลาดเคลื่อน</small>
                    </div>
                    <div className="act-col">
                      <button className="btn sm" onClick={() => onCreateInvoice?.(d)}><IDoc /> ทำใบแจ้งหนี้</button>
                    </div>
                  </>
                )}
                {p.edit && (
                  <div className="act-col">
                    <button className="btn sm" onClick={() => onEdit(doc)}><IPencil size={14} /> แก้ไข</button>
                  </div>
                )}
                {['INV', 'BN'].includes(t) && !has(statusLabel(d), 'ชำระแล้ว') && (
                  <div className="act-col">
                    <button className="btn sm" onClick={() => onConfirmPay?.(d)}><IMoney /> ยืนยันการจ่าย</button>
                    <small className="hint">กรณีมีจ่ายเกินกำหนด</small>
                  </div>
                )}
              </div>

              {d.status_reason && <p className="note">หมายเหตุ: {d.status_reason}</p>}
              {Array.isArray(d.check_notes) && d.check_notes.map((n, i) => <p key={i} className="note">• {n}</p>)}
            </>
          )}

          {tab === 'links' && (
            <ol className="chain">
              {links.map((l, i) => (
                <li key={i}>
                  <span className="dot" style={{ borderColor: TYPE_COLOR[l.doc_type] || '#9ca3af' }} />
                  <b>{l.label}</b>
                  {l.at && <small>ระบบ · {dateTh(l.at)}</small>}
                </li>
              ))}
            </ol>
          )}

          {tab === 'history' && (
            history.length === 0
              ? <p className="muted">ไม่มีการแก้ไข</p>
              : (
                <ol className="chain single">
                  {history.map((h, i) => (
                    <li key={i}>
                      <span className="dot" style={{ borderColor: '#e5484d' }} />
                      <b>{h.text || h.action}</b>
                      <small>{h.by ? `${h.by} · ` : ''}{dateTh(h.at)}</small>
                    </li>
                  ))}
                </ol>
              )
          )}
        </div>
      </aside>
    </>
  );
}

/* ---------- หน้ารายการ ---------- */
export default function DocumentList() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [rows, setRows] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [filter, setFilter] = useState({ status: params.get('status') || '', type: '', customer: '', q: params.get('q') || '' });
  const [range, setRange] = useState({ from: '', to: '' });
  const [showCal, setShowCal] = useState(false);
  const [edit, setEdit] = useState(null);
  const [view, setView] = useState(null);
  const [error, setError] = useState('');

  const load = () => {
    const p = new URLSearchParams();
    Object.entries(filter).forEach(([k, v]) => v && p.set(k, v));
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
  const saveEdit = async () => {
    try {
      await api.put('/documents/' + edit.id, { status: edit.status, due_date: edit.due_date, status_reason: edit.status_reason });
      setEdit(null); setView(null); load();
    } catch (e) { alert(e.message); }
  };
  const statusOptions = filter.type ? STATUS_BY_TYPE[filter.type] : ALL_STATUSES;

  return (
    <>
      <PageHeader title="รายการเอกสารรายรับ" sub="List of income documents">
        <button className="btn green" onClick={() => nav('/create')}>+ สร้างเอกสาร</button>
      </PageHeader>
      {error && <div className="err">{error}</div>}
      <Card>
        <div className="filters">
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
          <thead><tr><th>เลขที่เอกสาร</th><th>ลูกค้า</th><th>วันที่ออก</th><th>ครบกำหนด</th><th className="r">ยอดเงิน (บาท)</th><th>สถานะ</th><th className="r">จัดการ</th></tr></thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan="7" className="empty">ไม่พบเอกสาร ลองเปลี่ยนตัวกรอง หรือสร้างเอกสารใหม่</td></tr>}
            {shown.map((d) => {
              const p = perm(d);
              return (
                <tr key={d.id} className="clickable" onClick={() => setView(d)}>
                  <td>{d.doc_no}<small>{DOC_TYPES[d.doc_type].sub}</small></td>
                  <td>{d.customer_name}</td><td>{dateTh(d.issue_date)}</td><td>{dateTh(d.due_date)}</td>
                  <td className="r">{baht(d.total).replace('฿', '')}</td>
                  <td><StatusBadge status={d.status} />{d.status_reason && <small title={d.status_reason}>{d.status_reason.slice(0, 40)}</small>}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="act">
                      <button className="act-btn" title="ดูรายละเอียด" aria-label="ดูรายละเอียด" onClick={() => setView(d)}><IEye /></button>
                      <button className="act-btn" title="ดาวน์โหลด PDF" aria-label="ดาวน์โหลด PDF" onClick={() => openBlob(`/documents/${d.id}/pdf`)}><IDownload /></button>
                      {p.edit && <button className="act-btn edit" title="แก้ไขสถานะ" aria-label="แก้ไขสถานะ" onClick={() => setEdit({ ...d })}><IPencil /></button>}
                      {p.del && <button className="act-btn del" title="ลบ" aria-label="ลบ" onClick={() => remove(d)}><ITrash /></button>}
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
          onEdit={(d) => setEdit({ ...d })}
          onConfirmPay={(d) => setEdit({ ...d })}
          onCreateInvoice={(d) => nav(`/create?type=INV&ref=${encodeURIComponent(d.doc_no)}`)}
          onNotifyCustomer={(d) => alert('TODO: ส่งอีเมลแจ้งลูกค้า ' + d.doc_no)}
        />
      )}

      {edit && (
        <Modal title={`แก้ไข ${edit.doc_no}`} onClose={() => setEdit(null)}>
          <div className="field"><label>สถานะ</label>
            <select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>
              {STATUS_BY_TYPE[edit.doc_type].map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}
            </select></div>
          {['INV', 'BN'].includes(edit.doc_type) && (
            <div className="field"><label>วันครบกำหนด</label><input type="date" value={edit.due_date || ''} onChange={(e) => setEdit({ ...edit, due_date: e.target.value })} /></div>
          )}
          <div className="field"><label>หมายเหตุ</label><input value={edit.status_reason || ''} onChange={(e) => setEdit({ ...edit, status_reason: e.target.value })} /></div>
          <button className="btn green" onClick={saveEdit}>บันทึก</button>
        </Modal>
      )}
    </>
  );
}