import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { dateTh, num, timeTh } from '../../format.js';
import { Card, Modal, PageHeader } from '../../components.jsx';

const RESULT = {
  matched: { label: 'Matched (ตรงกัน)', bg: '#c8f2d2', fg: '#0b5a24' },
  mismatch: { label: 'Mismatch (ไม่ตรง)', bg: '#ffb4b4', fg: '#7a0b0b' },
  no_reference: { label: 'ไม่มีใบสั่งซื้อเปรียบเทียบ', bg: '#fff0a6', fg: '#6b5a00' },
};

const th = { textAlign: 'left', padding: '6px 6px', color: '#6b7280', fontWeight: 600, borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' };
const td = { padding: '6px', borderBottom: '1px solid #f1f1f1', whiteSpace: 'nowrap' };
const r = { textAlign: 'right' };

export default function VerifyMatching() {
  const nav = useNavigate();
  const [rows, setRows] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [filter, setFilter] = useState({ result: '', customer: '' });
  const [range, setRange] = useState({ from: '', to: '' });
  const [sel, setSel] = useState(null);
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = () => api.get('/ap/matching').then(setRows).catch((e) => setError(e.message));
  useEffect(() => { load(); api.get('/customers').then(setCustomers).catch(() => {}); }, []);

  const shown = useMemo(() => rows.filter((x) => {
    const day = String(x.issue_date || '').slice(0, 10);
    if (filter.result && x.result !== filter.result) return false;
    if (filter.customer && String(x.customer_id) !== String(filter.customer)) return false;
    return (!range.from || day >= range.from) && (!range.to || day <= range.to);
  }), [rows, filter, customers, range]);

  const open = async (x) => {
    setError(''); setSel(x); setDetail(null);
    try { setDetail(await api.get('/ap/matching/' + x.id)); }
    catch (e) { setError(e.message); }
  };

  const approve = async () => {
    if (!confirm(`อนุมัติการจ่าย ${sel.doc_no} ยอด ${num(sel.inv_total)} บาท ?`)) return;
    setBusy(true); setError('');
    try {
      await api.post(`/ap/matching/${sel.id}/approve`);
      setSel(null); setDetail(null); load();
      alert('อนุมัติการจ่ายแล้ว สถานะเปลี่ยนเป็น "รอชำระ"');
    } catch (e) { setError(e.message); }
    setBusy(false);
  };

  const requestFix = async () => {
    const reason = prompt('ระบุสิ่งที่ต้องแก้ไข / เหตุผลที่ยอดไม่ตรง', detail?.notes?.join('; ') || '');
    if (reason === null) return;
    setBusy(true); setError('');
    try {
      await api.post(`/ap/matching/${sel.id}/request-fix`, { reason });
      setSel(null); setDetail(null); load();
    } catch (e) { setError(e.message); }
    setBusy(false);
  };

  const inv = detail?.invoice;
  const po = detail?.po;

  return (
    <>
      <PageHeader title="ตรวจสอบ 2-Way Matching และการอนุมัติการจ่าย" sub="Invoice 2-Way Matching and Payment Approval">
        <button className="btn green" onClick={() => nav('/create')}>+ สร้างเอกสาร</button>
      </PageHeader>
      {error && !sel && <div className="err">{error}</div>}

      <Card>
        <div className="filters">
          <select value={filter.result} onChange={(e) => setFilter({ ...filter, result: e.target.value })}>
            <option value="">--เลือกสถานะ--</option>
            {Object.entries(RESULT).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={filter.customer} onChange={(e) => setFilter({ ...filter, customer: e.target.value })}>
            <option value="">--เลือกบริษัท--</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            ตั้งแต่ <input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
            ถึง <input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
          </label>
        </div>

        <div className="t-wrap"><table className="t">
          <thead><tr>
            <th>วันที่-เวลา</th><th>คู่ค้า</th><th>เอกสารอ้างอิง</th>
            <th className="r">ยอดตามใบสั่งซื้อ</th><th className="r">ยอดตามใบแจ้งหนี้</th>
            <th>ผลเทียบยอด</th><th>การดำเนินการ</th>
          </tr></thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan="7" className="empty">ยังไม่มีใบแจ้งหนี้ฝั่งรายจ่ายให้ตรวจสอบ อัปโหลดใบแจ้งหนี้เพื่อให้ระบบเทียบกับใบสั่งซื้อ</td></tr>}
            {shown.map((x) => {
              const b = RESULT[x.result];
              return (
                <tr key={x.id}>
                  <td>{dateTh(x.created_at)}<small>{timeTh(x.created_at)} น.</small></td>
                  <td>{x.customer_name || '-'}</td>
                  <td>{x.doc_no}<small>{x.po_no ? `อ้างอิง ${x.po_no}` : 'ไม่มีใบสั่งซื้อ'}</small></td>
                  <td className="r">{x.po_total != null ? num(x.po_total) : '-'}</td>
                  <td className="r">{num(x.inv_total)}</td>
                  <td><span className="badge" style={{ background: b.bg, color: b.fg }}>{b.label}</span></td>
                  <td><button className="btn teal sm" onClick={() => open(x)}>ตรวจสอบ</button></td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </Card>

      {sel && (
        <Modal title={detail ? `ตรวจสอบ เอกสาร ${inv.doc_no} เทียบกับ ${po?.doc_no || '-'}` : `ตรวจสอบ ${sel.doc_no}`} onClose={() => { setSel(null); setDetail(null); }}>
          {error && <div className="err">{error}</div>}
          {!detail ? <p className="muted">กำลังโหลด...</p> : (
            <>
              <p className="muted" style={{ marginTop: 0 }}>
                คู่ค้า {inv.customer_name || '-'}
                <span className="badge" style={{ background: RESULT[detail.result].bg, color: RESULT[detail.result].fg, marginLeft: 10 }}>
                  {RESULT[detail.result].label}
                </span>
              </p>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th rowSpan="2" style={th}>รายการ</th>
                      <th colSpan="2" style={{ ...th, textAlign: 'center' }}>จำนวน</th>
                      <th colSpan="2" style={{ ...th, textAlign: 'center' }}>ราคา/หน่วย</th>
                      <th colSpan="3" style={{ ...th, textAlign: 'center' }}>จำนวนเงิน</th>
                    </tr>
                    <tr>
                      <th style={{ ...th, ...r }}>PO</th><th style={{ ...th, ...r }}>ใบแจ้งหนี้</th>
                      <th style={{ ...th, ...r }}>PO</th><th style={{ ...th, ...r }}>ใบแจ้งหนี้</th>
                      <th style={{ ...th, ...r }}>PO</th><th style={{ ...th, ...r }}>ใบแจ้งหนี้</th>
                      <th style={th}>ผล</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.lines.length === 0 && <tr><td colSpan="8" className="empty">ไม่มีรายการให้เปรียบเทียบ</td></tr>}
                    {detail.lines.map((l, i) => (
                      <tr key={i}>
                        <td style={td}>{l.description || '-'}</td>
                        <td style={{ ...td, ...r }}>{l.qty_po ?? '-'}</td>
                        <td style={{ ...td, ...r, color: l.ok ? undefined : l.qty_po != null && l.qty_inv != null ? '#c62828' : undefined, fontWeight: l.ok ? undefined : 600 }}>{l.qty_inv ?? '-'}</td>
                        <td style={{ ...td, ...r }}>{l.price_po != null ? num(l.price_po) : '-'}</td>
                        <td style={{ ...td, ...r, color: l.ok ? undefined : l.price_po != null && l.price_inv != null ? '#c62828' : undefined, fontWeight: l.ok ? undefined : 600 }}>{l.price_inv != null ? num(l.price_inv) : '-'}</td>
                        <td style={{ ...td, ...r }}>{l.amount_po != null ? num(l.amount_po) : '-'}</td>
                        <td style={{ ...td, ...r }}>{l.amount_inv != null ? num(l.amount_inv) : '-'}</td>
                        <td style={td}>
                          <span className="badge" style={{ background: l.ok ? '#c8f2d2' : '#ffb4b4', color: l.ok ? '#0b5a24' : '#7a0b0b' }}>
                            {l.ok ? 'ตรงกัน' : 'ไม่ตรง'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                <table style={{ borderCollapse: 'collapse', minWidth: 340, fontSize: 13 }}>
                  <thead><tr>
                    <th style={th}></th><th style={{ ...th, ...r }}>PO</th><th style={{ ...th, ...r }}>ใบแจ้งหนี้</th>
                  </tr></thead>
                  <tbody>
                    {[
                      ['ยอดก่อน VAT', po?.subtotal, inv.subtotal],
                      ['ภาษีมูลค่าเพิ่ม 7%', po?.vat, inv.vat],
                      ['ยอดรวมสุทธิ', po?.total, inv.total],
                    ].map(([label, a, b], i) => {
                      const diff = a != null && b != null && Math.abs(Number(a) - Number(b)) > 0.01;
                      return (
                        <tr key={label} style={i === 2 ? { fontWeight: 700, borderTop: '1px solid #222' } : undefined}>
                          <td style={{ ...td, borderBottom: '1px solid #eee' }}>{label}</td>
                          <td style={{ ...td, ...r, borderBottom: '1px solid #eee' }}>{a != null ? num(a) : '-'}</td>
                          <td style={{ ...td, ...r, borderBottom: '1px solid #eee', color: diff ? '#c62828' : undefined, fontWeight: diff ? 700 : undefined }}>{num(b)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {(detail.notes || []).length > 0 && detail.result !== 'matched' && (
                <div className="err" style={{ marginTop: 12 }}>
                  {detail.notes.map((n, i) => <div key={i}>• {n}</div>)}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                {detail.result === 'matched' ? (
                  <button className="btn green" disabled={busy} onClick={approve}>อนุมัติการจ่ายเงิน</button>
                ) : (
                  <button className="btn red-o" disabled={busy} onClick={requestFix}>แจ้งแก้ไขการตรวจสอบ</button>
                )}
              </div>
            </>
          )}
        </Modal>
      )}
    </>
  );
}
