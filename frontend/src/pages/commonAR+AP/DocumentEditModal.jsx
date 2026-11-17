import React, { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { DOC_TYPES, STATUS, STATUS_BY_TYPE, num } from '../../format.js';
import { Modal } from '../../components.jsx';

/* ---------- หน้าต่างแก้ไขเอกสาร (ใช้ร่วมกันระหว่างรายการเอกสารและเอกสารที่ชำระแล้ว) ----------
   แก้ได้ทุกช่อง: ลูกค้า/คู่ค้า, วันที่ออก, ครบกำหนด, สถานะ, หมายเหตุ,
   ภาษีมูลค่าเพิ่ม, รายการสินค้า/บริการ, เอกสารอ้างอิง, ใบแจ้งหนี้ของใบวางบิล
   ล็อกเฉพาะเลขที่เอกสาร/ประเภทเอกสาร */
export default function DocumentEditModal({ doc, customers, isAP, onClose, onSaved }) {
  const [edit, setEdit] = useState(() => ({ ...doc, vat_enabled: Number(doc.vat) > 0 }));
  const [invIds, setInvIds] = useState(() => (doc.linked || []).map((x) => String(x.id)));
  const [linkable, setLinkable] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // เอกสารอ้างอิงที่เลือกได้ (INV -> OP, RC -> INV/BN, BN -> INV ของคู่ค้ารายนั้น)
  useEffect(() => {
    if (!['INV', 'RC', 'BN'].includes(edit.doc_type)) { setLinkable([]); return; }
    const qs = new URLSearchParams({ type: edit.doc_type, doc: edit.id });
    if (edit.doc_type === 'BN' && edit.customer_id) qs.set('customer', edit.customer_id);
    api.get('/documents/linkable?' + qs).then(setLinkable).catch(() => setLinkable([]));
  }, [edit.id, edit.doc_type, edit.customer_id]);

  const setItem = (idx, k, v) => setEdit((p) => ({
    ...p, items: (p.items || []).map((it, i) => (i === idx ? { ...it, [k]: v } : it)),
  }));
  const addItem = () => setEdit((p) => ({
    ...p, items: [...(p.items || []), { description: '', qty: 1, unit_price: 0 }],
  }));
  const removeItem = (idx) => setEdit((p) => ({
    ...p, items: (p.items || []).length > 1 ? p.items.filter((_, i) => i !== idx) : p.items,
  }));
  const changeCustomer = (v) => {
    setEdit((p) => ({ ...p, customer_id: v }));
    if (edit.doc_type === 'BN') setInvIds([]); // ใบวางบิลต้องเลือกใบแจ้งหนี้ของคู่ค้ารายใหม่
  };
  const setInvoice = (idx, v) => setInvIds((p) => p.map((x, i) => (i === idx ? v : x)));
  const totals = (edit.items || []).reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.unit_price) || 0), 0);

  const save = async () => {
    setError(''); setBusy(true);
    try {
      const payload = {
        customer_id: edit.customer_id || null,
        issue_date: edit.issue_date || null,
        due_date: edit.due_date || null,
        status: edit.status,
        status_reason: edit.status_reason || '',
      };
      if (edit.doc_type === 'BN') {
        payload.invoice_ids = invIds.filter(Boolean);
      } else {
        payload.vat_enabled = !!edit.vat_enabled;
        payload.items = (edit.items || [])
          .filter((i) => String(i.description || '').trim())
          .map((i) => ({ description: i.description, qty: i.qty, unit_price: i.unit_price }));
        if (['INV', 'RC'].includes(edit.doc_type)) payload.ref_text = edit.ref_text || '';
      }
      await api.put('/documents/' + edit.id, payload);
      onSaved?.();
    } catch (e) { setError(e.message); }
    setBusy(false);
  };

  return (
    <Modal title={`แก้ไข ${edit.doc_no}`} onClose={onClose}>
      {error && <div className="err">{error}</div>}
      <div className="row two">
        <div className="field"><label>เลขที่เอกสาร</label><input value={edit.doc_no} disabled /></div>
        <div className="field"><label>ประเภทเอกสาร</label><input value={DOC_TYPES[edit.doc_type]?.label || ''} disabled /></div>
      </div>

      <div className="row two">
        <div className="field"><label>{isAP ? 'คู่ค้า' : 'ลูกค้า'}</label>
          <select value={edit.customer_id || ''} onChange={(e) => changeCustomer(e.target.value)}>
            <option value="">{isAP ? '-- เลือกคู่ค้า --' : '-- เลือกลูกค้า --'}</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></div>
        <div className="field"><label>สถานะ</label>
          <select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>
            {(STATUS_BY_TYPE[edit.doc_type] || Object.keys(STATUS)).map((s) => <option key={s} value={s}>{STATUS[s]?.label || s}</option>)}
          </select></div>
      </div>

      <div className="row two">
        <div className="field"><label>{edit.doc_type === 'QT' ? 'ยืนยันราคาถึงวันที่' : 'วันที่ออกเอกสาร'}</label>
          <input type="date" value={String(edit.issue_date || '').slice(0, 10)} onChange={(e) => setEdit({ ...edit, issue_date: e.target.value })} /></div>
        <div className="field"><label>วันครบกำหนด</label>
          <input type="date" value={String(edit.due_date || '').slice(0, 10)} onChange={(e) => setEdit({ ...edit, due_date: e.target.value })} /></div>
      </div>

      {['INV', 'RC'].includes(edit.doc_type) && (
        <div className="field"><label>อ้างอิง (ถ้ามี)</label>
          <select value={edit.ref_text || ''} onChange={(e) => setEdit({ ...edit, ref_text: e.target.value })}>
            <option value="">-- ไม่อ้างอิง --</option>
            {edit.ref_text && !linkable.some((d) => d.doc_no === edit.ref_text) && (
              <option value={edit.ref_text}>{edit.ref_text}</option>
            )}
            {linkable.map((d) => (
              <option key={d.id} value={d.doc_no}>{d.doc_no} · {d.customer_name} · {num(d.total)}</option>
            ))}
          </select></div>
      )}

      {edit.doc_type === 'BN' ? (
        <>
          <div className="section-title">ใบแจ้งหนี้ที่วางบิล</div>
          {linkable.length === 0 && <p className="muted" style={{ margin: 0, fontSize: 12 }}>ไม่มีใบแจ้งหนี้ที่เลือกได้สำหรับคู่ค้ารายนี้</p>}
          {invIds.map((id, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) auto', gap: 12, alignItems: 'end', marginBottom: 8 }}>
              <div className="field" style={{ margin: 0 }}><label>เลขที่ใบแจ้งหนี้</label>
                <select value={id} onChange={(e) => setInvoice(i, e.target.value)}>
                  <option value="">-- เลือกใบแจ้งหนี้ --</option>
                  {linkable.filter((d) => !invIds.some((x, j) => j !== i && String(x) === String(d.id))).map((d) => (
                    <option key={d.id} value={d.id}>{d.doc_no} · {num(d.total)}</option>
                  ))}
                </select></div>
              <button className="icon-btn" aria-label="ลบใบแจ้งหนี้" onClick={() => setInvIds((p) => (p.length > 1 ? p.filter((_, j) => j !== i) : ['']))}>✕</button>
            </div>
          ))}
          <button className="btn sm" disabled={!edit.customer_id} onClick={() => setInvIds((p) => [...p, ''])}>+ เพิ่มรายการใบแจ้งหนี้</button>
        </>
      ) : (
        <>
          <div className="section-title">รายการสินค้าและบริการ</div>
          {(edit.items || []).map((it, i) => (
            <div className="row items" key={i} style={{ marginBottom: 8 }}>
              <div className="field" style={{ margin: 0 }}><label>รายการ</label>
                <input value={it.description} onChange={(e) => setItem(i, 'description', e.target.value)} placeholder="ชื่อสินค้าหรือบริการ" /></div>
              <div className="field" style={{ margin: 0 }}><label>จำนวน</label>
                <input type="number" min="0" value={it.qty} onChange={(e) => setItem(i, 'qty', e.target.value)} /></div>
              <div className="field" style={{ margin: 0 }}><label>ราคา/หน่วย</label>
                <input type="number" min="0" value={it.unit_price} onChange={(e) => setItem(i, 'unit_price', e.target.value)} /></div>
              <div className="field" style={{ margin: 0 }}><label>รวม</label>
                <input disabled value={num((Number(it.qty) || 0) * (Number(it.unit_price) || 0))} /></div>
              <button className="icon-btn" aria-label="ลบรายการ" onClick={() => removeItem(i)}>✕</button>
            </div>
          ))}
          <button className="btn sm" onClick={addItem}>+ เพิ่มรายการสินค้า</button>
          <div style={{ marginTop: 12 }} className="row two">
            <label><input type="checkbox" checked={!!edit.vat_enabled} onChange={(e) => setEdit({ ...edit, vat_enabled: e.target.checked })} /> คิดภาษีมูลค่าเพิ่ม 7%</label>
            <div style={{ fontSize: 13, textAlign: 'right' }}>
              ยอดก่อน VAT {num(totals)} · VAT {num(edit.vat_enabled ? totals * 0.07 : 0)} · รวม{' '}
              <b>{num(totals + (edit.vat_enabled ? totals * 0.07 : 0))}</b>
            </div>
          </div>
        </>
      )}

      <div className="field"><label>หมายเหตุ</label>
        <input value={edit.status_reason || ''} onChange={(e) => setEdit({ ...edit, status_reason: e.target.value })} /></div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onClose}>ยกเลิก</button>
        <button className="btn green" disabled={busy} onClick={save}>{busy ? 'กำลังบันทึก...' : 'บันทึก'}</button>
      </div>
    </Modal>
  );
}
