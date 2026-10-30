import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { baht, dateTh, timeTh } from '../format.js';
import { Card, Modal, PageHeader } from '../components.jsx';

const RESULT = {
  matched: { label: 'Matched (ตรงกัน)', bg: '#c8f2d2', fg: '#0b5a24' },
  mismatch: { label: 'Mismatch (ไม่ตรง)', bg: '#ffb4b4', fg: '#7a0b0b' },
  no_invoice: { label: 'ไม่มีใบแจ้งหนี้เปรียบเทียบ', bg: '#fff0a6', fg: '#6b5a00' },
};

export default function VerifyPayment() {
  const nav = useNavigate();
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState({ result: '', customer: '' });
  const [customers, setCustomers] = useState([]);
  const [open, setOpen] = useState(null);
  const [docs, setDocs] = useState([]);
  const [docId, setDocId] = useState('');
  const [img, setImg] = useState(null);
  const [error, setError] = useState('');

  const load = () => {
    const p = new URLSearchParams();
    Object.entries(filter).forEach(([k, v]) => v && p.set(k, v));
    api.get('/payment-slips?' + p).then(setRows).catch((e) => setError(e.message));
  };
  useEffect(() => { api.get('/customers').then(setCustomers); }, []);
  useEffect(load, [filter]);

  const openSlip = async (s) => {
    setError(''); setOpen(s); setDocId(s.matched_document_id || ''); setImg(null);
    const [all, blob] = await Promise.all([api.get('/documents?type=INV'), api.blob(`/payment-slips/${s.id}/file`)]);
    setDocs(all.filter((d) => d.status !== 'paid' || d.id === s.matched_document_id));
    if (blob.type.startsWith('image/')) setImg(URL.createObjectURL(blob));
  };
  const act = async (action) => {
    try {
      await api.post(`/payment-slips/${open.id}/verify`, { action, document_id: docId || undefined });
      setOpen(null); load();
    } catch (e) { setError(e.message); }
  };
  const chosen = docs.find((d) => String(d.id) === String(docId));

  return (
    <>
      <PageHeader title="ตรวจสอบหลักฐานการชำระเงิน" sub="Check proof of payment">
        <button className="btn green" onClick={() => nav('/upload')}>+ อัปโหลดสลิป</button>
      </PageHeader>
      {error && !open && <div className="err">{error}</div>}
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
        </div>
        <div className="t-wrap"><table className="t">
          <thead><tr><th>วันที่-เวลาโอน</th><th>ลูกค้า</th><th>เอกสารอ้างอิง</th><th className="r">ยอดที่ควรได้รับ</th><th className="r">ยอดตามสลิป</th><th>ผลเทียบยอด</th><th>การดำเนินการ</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan="7" className="empty">ยังไม่มีสลิป อัปโหลดสลิปเพื่อให้ระบบอ่านและเทียบยอด</td></tr>}
            {rows.map((s) => (
              <tr key={s.id}>
                <td>{dateTh(s.transfer_at || s.created_at)}<small>{timeTh(s.transfer_at || s.created_at)} น.</small></td>
                <td>{s.customer_name || '-'}</td><td>{s.doc_no || '-'}</td>
                <td className="r">{s.expected != null ? baht(s.expected).replace('฿', '') : '-'}</td>
                <td className="r">{baht(s.amount).replace('฿', '')}</td>
                <td><span className="badge" style={{ background: RESULT[s.match_result].bg, color: RESULT[s.match_result].fg }}>{RESULT[s.match_result].label}</span>{s.verified && <small>ตรวจสอบแล้ว</small>}</td>
                <td><button className="btn teal sm" onClick={() => openSlip(s)}>ตรวจสอบ</button></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </Card>

      {open && (
        <Modal title="ตรวจสอบสลิป" onClose={() => setOpen(null)}>
          {error && <div className="err">{error}</div>}
          <div className="two-col" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div>{img ? <img className="slip-img" src={img} alt="สลิป" /> : <p className="muted">ไฟล์ PDF หรือไม่มีตัวอย่างภาพ</p>}</div>
            <div>
              <p>ผู้โอน: <b>{open.sender_name || '-'}</b></p>
              <p>ยอดตามสลิป: <b>{baht(open.amount)}</b></p>
              <div className="field"><label>จับคู่กับใบแจ้งหนี้</label>
                <select value={docId} onChange={(e) => setDocId(e.target.value)}>
                  <option value="">-- เลือกใบแจ้งหนี้ --</option>
                  {docs.map((d) => <option key={d.id} value={d.id}>{d.doc_no} · {d.customer_name} · {baht(d.total)}</option>)}
                </select></div>
              {chosen && Math.abs(chosen.total - open.amount) > 0.01 && (
                <div className="err">ยอดไม่ตรง: เอกสาร {baht(chosen.total)} / สลิป {baht(open.amount)}</div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn green" onClick={() => act('confirm')}>ยืนยันว่าชำระแล้ว</button>
                <button className="btn red-o" onClick={() => act('reject')}>ปฏิเสธ (ไม่ตรง)</button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
