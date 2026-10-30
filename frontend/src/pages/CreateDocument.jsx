import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { DOC_TYPES, dateTh, num } from '../format.js';
import { Card, Modal, PageHeader } from '../components.jsx';

const CREATABLE = ['QT', 'INV', 'BN', 'RC'];
const emptyItem = () => ({ description: '', qty: 1, unit_price: 0 });

// ประเภทที่มีช่องอ้างอิง (กติกาว่าอ้างอิงอะไรได้ อยู่ที่ backend: GET /documents/linkable)
// BN ไม่ใช้ช่องนี้ แต่ใช้ส่วน "ใบแจ้งหนี้ที่วางบิล" แทน
const REF_SOURCES = { INV: ['OP'], BN: ['INV'], RC: ['INV', 'BN'] };

const shortDate = (s) =>
  s ? new Date(s + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) : '-';

const billRow = { display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr) auto', gap: 12, alignItems: 'end', marginBottom: 8 };

export default function CreateDocument() {
  const [sp] = useSearchParams();
  const initType = CREATABLE.includes(sp.get('type')) ? sp.get('type') : '';

  const [customers, setCustomers] = useState([]);
  const [linkable, setLinkable] = useState([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [f, setF] = useState({
    doc_type: initType, doc_no: '', ref_text: '', issue_date: new Date().toISOString().slice(0, 10), due_date: '',
    customer_id: '', vat_enabled: false, send_email: false, email: '',
  });
  const [items, setItems] = useState([emptyItem()]);
  const [invIds, setInvIds] = useState(['']); // ใบวางบิล: ใบแจ้งหนี้ที่เลือก (แถวละ 1 ใบ)
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [newCust, setNewCust] = useState(null);

  const loadCustomers = () => api.get('/customers').then(setCustomers);
  useEffect(() => { loadCustomers(); }, []);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const customer = customers.find((c) => String(c.id) === String(f.customer_id));

  // เลือกลูกค้าแล้วเติมอีเมลให้อัตโนมัติ
  useEffect(() => { if (customer?.email) set('email', customer.email); }, [f.customer_id]);

  const isBN = f.doc_type === 'BN';
  const sources = REF_SOURCES[f.doc_type];
  const locked = !isBN && !!f.ref_text; // INV/RC ที่เลือกเอกสารอ้างอิงแล้ว -> ล็อกข้อมูลที่ดึงมา

  // โหลดเอกสารที่เลือกอ้างอิงได้จาก backend (กรองที่ยังไม่ถูกจับคู่ให้แล้ว)
  // ใบวางบิล: ต้องเลือกลูกค้าก่อน จึงจะเห็นเฉพาะใบแจ้งหนี้ของลูกค้ารายนั้น
  useEffect(() => {
    if (!sources || (isBN && !f.customer_id)) { setLinkable([]); return; }
    const qs = new URLSearchParams({ type: f.doc_type });
    if (isBN) qs.set('customer', f.customer_id);
    api.get('/documents/linkable?' + qs).then(setLinkable).catch(() => setLinkable([]));
  }, [f.doc_type, isBN ? f.customer_id : '', reloadKey]);

  const findDoc = (id) => linkable.find((d) => String(d.id) === String(id));
  const chosen = invIds.filter(Boolean);
  const chosenDocs = chosen.map(findDoc).filter(Boolean);

  const resetAll = (extra = {}) => {
    setItems([emptyItem()]);
    setInvIds(['']);
    setF((p) => ({ ...p, ref_text: '', customer_id: '', vat_enabled: false, due_date: '', ...extra }));
  };
  const changeType = (type) => resetAll({ doc_type: type });

  /* ----- INV / RC: เลือกเอกสารอ้างอิงเดียว แล้วดึงข้อมูลมาเติม ----- */
  const applyRef = async (docNo, type = f.doc_type) => {
    if (!docNo) { resetAll(); return; }
    const src = linkable.find((d) => d.doc_no === docNo);
    if (!src) return;
    try {
      const full = await api.get('/documents/' + src.id);
      setF((p) => ({
        ...p,
        ref_text: docNo,
        customer_id: String(full.customer_id ?? src.customer_id ?? ''),
        vat_enabled: Number(full.vat) > 0,
        due_date: ['INV', 'BN'].includes(type) && full.due_date ? String(full.due_date).slice(0, 10) : p.due_date,
      }));
      const its = (full.items || []).map((i) => ({ description: i.description, qty: i.qty, unit_price: i.unit_price }));
      setItems(its.length ? its : [emptyItem()]);
    } catch (e) { setMsg({ ok: false, text: 'ดึงข้อมูลเอกสารอ้างอิงไม่สำเร็จ: ' + e.message }); }
  };

  // เปิดมาจากปุ่ม "ทำใบแจ้งหนี้" (?type=INV&ref=OP-...)
  const applied = useRef(false);
  useEffect(() => {
    const ref = sp.get('ref');
    if (!applied.current && ref && initType && linkable.length) {
      applied.current = true;
      applyRef(ref, initType);
    }
  }, [linkable]);

  /* ----- ใบวางบิล: เลือกใบแจ้งหนี้หลายใบ ----- */
  const applyInvIds = (next) => {
    setInvIds(next);
    // วันครบกำหนดเริ่มต้น = ใบที่ใกล้ครบกำหนดที่สุด (แก้เองได้)
    const dues = next.filter(Boolean).map(findDoc).filter(Boolean).map((d) => d.due_date).filter(Boolean).sort();
    set('due_date', dues[0] ? String(dues[0]).slice(0, 10) : '');
  };
  const setInvoice = (idx, val) => applyInvIds(invIds.map((x, i) => (i === idx ? val : x)));
  const removeInvoice = (idx) => applyInvIds(invIds.length > 1 ? invIds.filter((_, i) => i !== idx) : ['']);
  const optionsFor = (idx) => linkable.filter((d) => !invIds.some((x, i) => i !== idx && String(x) === String(d.id)));
  const canAddInvoice = !!f.customer_id && invIds.every(Boolean) && chosen.length < linkable.length;

  const changeCustomer = (v) => {
    set('customer_id', v);
    if (isBN) { setInvIds(['']); set('due_date', ''); }
  };

  const totals = useMemo(() => {
    if (isBN) {
      const sum = (k) => chosenDocs.reduce((s, d) => s + (Number(d[k]) || 0), 0);
      return { subtotal: sum('subtotal'), vat: sum('vat'), total: sum('total') };
    }
    const subtotal = items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.unit_price) || 0), 0);
    const vat = f.vat_enabled ? Math.round(subtotal * 7) / 100 : 0;
    return { subtotal, vat, total: subtotal + vat };
  }, [items, f.vat_enabled, isBN, chosenDocs]);

  const setItem = (idx, k, v) => setItems((p) => p.map((it, i) => (i === idx ? { ...it, [k]: v } : it)));

  const save = async () => {
    setMsg(null); setBusy(true);
    try {
      const payload = { ...f, items };
      if (!String(payload.doc_no || '').trim()) delete payload.doc_no; // ว่าง = ให้ระบบรันเลขให้
      if (isBN) { payload.invoice_ids = chosen; payload.items = []; delete payload.ref_text; }
      const doc = await api.post('/documents', payload);
      setMsg({ ok: true, text: `บันทึกเอกสาร ${doc.doc_no} แล้ว` + (doc.emailed ? ' และส่งอีเมลเรียบร้อย' : '') + (doc.emailError ? ` (ส่งอีเมลไม่สำเร็จ: ${doc.emailError})` : '') });
      setItems([emptyItem()]);
      setInvIds(['']);
      setF((p) => ({ ...p, doc_no: '', ref_text: '', ...(locked || isBN ? { due_date: '' } : {}), ...(locked ? { customer_id: '', vat_enabled: false } : {}) }));
      setReloadKey((k) => k + 1); // เอกสารที่เพิ่งถูกอ้างอิงจะหายจากรายการที่เลือกได้
    } catch (e) { setMsg({ ok: false, text: e.message }); }
    setBusy(false);
  };

  const saveCustomer = async () => {
    try {
      const c = await api.post('/customers', newCust);
      await loadCustomers(); changeCustomer(c.id); setNewCust(null);
    } catch (e) { alert(e.message); }
  };

  const refPlaceholder = !f.doc_type ? '-- เลือกประเภทเอกสารก่อน --'
    : !sources ? 'ประเภทนี้ไม่มีเอกสารอ้างอิง'
      : linkable.length ? '-- ไม่อ้างอิง / เลือกเอกสาร --' : '-- ไม่มีเอกสารที่รอจับคู่ --';

  const saveDisabled = busy || !f.doc_type || !f.customer_id || (isBN && chosen.length === 0);

  return (
    <>
      <PageHeader title="สร้างและส่งเอกสาร" sub="Create and send documents" />
      <div className="two-col">
        <Card>
          <h2>ข้อมูลเอกสาร</h2>
          {msg && <div className={msg.ok ? 'ok' : 'err'} style={{ marginTop: 10 }}>{msg.text}</div>}
          <div className="row two" style={{ marginTop: 12 }}>
            <div className="field"><label>ประเภทเอกสาร</label>
              <select value={f.doc_type} onChange={(e) => changeType(e.target.value)}>
                <option value="">-- เลือกประเภท --</option>
                {CREATABLE.map((k) => <option key={k} value={k}>{DOC_TYPES[k].label}</option>)}
              </select></div>
            <div className="field"><label>เลขที่เอกสาร</label>
              <input value={f.doc_no} onChange={(e) => set('doc_no', e.target.value)} placeholder="ว่างไว้ = ระบบสร้างให้อัตโนมัติ" /></div>

            {/* ช่องอ้างอิงเดี่ยว: ไม่ใช้กับใบเสนอราคา (QT) และใบวางบิล (BN) */}
            {f.doc_type !== 'QT' && !isBN && (
              <div className="field"><label>อ้างอิง (ถ้ามี)</label>
                <select value={f.ref_text} disabled={!sources || linkable.length === 0} onChange={(e) => applyRef(e.target.value)}>
                  <option value="">{refPlaceholder}</option>
                  {linkable.map((d) => (
                    <option key={d.id} value={d.doc_no}>{d.doc_no} · {d.customer_name} · {num(d.total)}</option>
                  ))}
                </select></div>
            )}

            <div className="field"><label>{f.doc_type === 'QT' ? 'ยืนยันราคาถึงวันที่' : 'วันที่ออกเอกสาร'}</label>
              <input type="date" value={f.issue_date} onChange={(e) => set('issue_date', e.target.value)} /></div>
            {['INV', 'BN'].includes(f.doc_type) && (
              <div className="field"><label>วันครบกำหนดชำระ</label><input type="date" value={f.due_date} onChange={(e) => set('due_date', e.target.value)} /></div>
            )}
          </div>
          {locked && <p className="muted" style={{ margin: '0 0 6px', fontSize: 12 }}>ข้อมูลลูกค้าและรายการดึงมาจาก {f.ref_text} แก้ได้เฉพาะเลขที่เอกสาร วันที่ออก และวันครบกำหนดชำระ</p>}

          <div className="section-title">ลูกค้า</div>
          <div className="field"><label>ชื่อลูกค้า</label>
            <select value={f.customer_id} disabled={locked} onChange={(e) => changeCustomer(e.target.value)}>
              <option value="">-- เลือกลูกค้า --</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></div>
          <button className="btn sm" disabled={locked} onClick={() => setNewCust({ name: '', address: '', tax_id: '', email: '' })}>+ เพิ่มลูกค้าใหม่</button>

          {isBN ? (
            <>
              <div className="section-title">ใบแจ้งหนี้ที่วางบิล</div>
              {!f.customer_id && <p className="muted" style={{ margin: 0, fontSize: 12 }}>เลือกลูกค้าก่อน ระบบจะแสดงใบแจ้งหนี้ที่ค้างชำระและยังไม่ถูกวางบิลของลูกค้ารายนั้น</p>}
              {f.customer_id && linkable.length === 0 && <p className="muted" style={{ margin: 0, fontSize: 12 }}>ลูกค้ารายนี้ไม่มีใบแจ้งหนี้ที่รอวางบิล</p>}
              {f.customer_id && linkable.length > 0 && invIds.map((id, i) => (
                <div key={i} style={billRow}>
                  <div className="field" style={{ margin: 0 }}><label>เลขที่ใบแจ้งหนี้</label>
                    <select value={id} onChange={(e) => setInvoice(i, e.target.value)}>
                      <option value="">-- เลือกใบแจ้งหนี้ --</option>
                      {optionsFor(i).map((d) => <option key={d.id} value={d.id}>{d.doc_no}</option>)}
                    </select></div>
                  <div className="field" style={{ margin: 0 }}><label>รวม</label>
                    <input disabled value={findDoc(id) ? num(findDoc(id).total) : ''} placeholder="0.00" /></div>
                  <button className="icon-btn" aria-label="ลบใบแจ้งหนี้" onClick={() => removeInvoice(i)}>✕</button>
                </div>
              ))}
              <button className="btn sm" disabled={!canAddInvoice} onClick={() => setInvIds((p) => [...p, ''])}>+ เพิ่มรายการใบแจ้งหนี้</button>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, marginTop: 12 }}>
                <label><input type="checkbox" disabled checked={totals.vat > 0} /> คิดภาษีมูลค่าเพิ่ม 7%</label>
                <div style={{ minWidth: 220, fontSize: 13 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>ยอดก่อน VAT</span><span>{num(totals.subtotal)}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>ภาษีมูลค่าเพิ่ม 7%</span><span>{num(totals.vat)}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, borderTop: '1px solid #222', marginTop: 3, paddingTop: 3 }}><span>ยอดรวมสุทธิ</span><span>{num(totals.total)}</span></div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="section-title">รายการสินค้าและบริการ</div>
              {items.map((it, i) => (
                <div className="row items" key={i} style={{ marginBottom: 8 }}>
                  <div className="field" style={{ margin: 0 }}><label>รายการ</label><input disabled={locked} value={it.description} onChange={(e) => setItem(i, 'description', e.target.value)} placeholder="ชื่อสินค้าหรือบริการ" /></div>
                  <div className="field" style={{ margin: 0 }}><label>จำนวน</label><input disabled={locked} type="number" min="0" value={it.qty} onChange={(e) => setItem(i, 'qty', e.target.value)} /></div>
                  <div className="field" style={{ margin: 0 }}><label>ราคา/หน่วย</label><input disabled={locked} type="number" min="0" value={it.unit_price} onChange={(e) => setItem(i, 'unit_price', e.target.value)} /></div>
                  <div className="field" style={{ margin: 0 }}><label>รวม</label><input disabled value={num(it.qty * it.unit_price)} /></div>
                  <button className="icon-btn" disabled={locked} aria-label="ลบรายการ" onClick={() => setItems((p) => (p.length > 1 ? p.filter((_, x) => x !== i) : p))}>✕</button>
                </div>
              ))}
              <button className="btn sm" disabled={locked} onClick={() => setItems((p) => [...p, emptyItem()])}>+ เพิ่มรายการสินค้า</button>
              <div style={{ marginTop: 12 }}>
                <label><input type="checkbox" disabled={locked} checked={f.vat_enabled} onChange={(e) => set('vat_enabled', e.target.checked)} /> คิดภาษีมูลค่าเพิ่ม 7%</label>
              </div>
            </>
          )}

          <div className="section-title">การจัดส่ง</div>
          <label><input type="checkbox" checked={f.send_email} onChange={(e) => set('send_email', e.target.checked)} /> ส่งอีเมลถึงลูกค้าอัตโนมัติพร้อมแนบไฟล์ PDF</label>
          <div className="field" style={{ marginTop: 10 }}><label>อีเมลลูกค้า</label><input value={f.email} onChange={(e) => set('email', e.target.value)} placeholder="อีเมลลูกค้า" /></div>
          <div style={{ textAlign: 'right' }}>
            <button className="btn green" disabled={saveDisabled} onClick={save}>
              {busy ? 'กำลังบันทึก...' : f.send_email ? 'บันทึกเอกสารและส่งอีเมล' : 'บันทึกเอกสาร'}
            </button>
          </div>
        </Card>

        <Card>
          <h2>ตัวอย่างเอกสาร</h2>
          <div className="preview" style={{ marginTop: 12 }}>
            <h3>{DOC_TYPES[f.doc_type]?.label || 'เลือกประเภทเอกสาร'}</h3>
            <p>ลูกค้า: <b>{customer?.name || '-'}</b><br />เลขผู้เสียภาษี {customer?.tax_id || '-'}</p>
            <p>{f.doc_no && <>เลขที่ <b>{f.doc_no}</b> · </>}วันที่ {dateTh(f.issue_date)}{f.due_date && ` · ครบกำหนด ${dateTh(f.due_date)}`}{f.ref_text && !isBN && ` · อ้างอิง ${f.ref_text}`}</p>
            {isBN ? (
              <table>
                <thead><tr><th>#</th><th>เลขที่ใบแจ้งหนี้</th><th style={{ width: '24%' }}>วันที่</th><th style={{ width: '24%' }}>จำนวนเงิน</th></tr></thead>
                <tbody>
                  {chosenDocs.length === 0 && <tr><td>1</td><td>-</td><td>-</td><td>0.00</td></tr>}
                  {chosenDocs.map((d, i) => (
                    <tr key={d.id}><td>{i + 1}</td><td>{d.doc_no}</td><td>{shortDate(d.issue_date)}</td><td>{num(d.subtotal)}</td></tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table>
                <thead><tr><th>#</th><th>รายการ</th><th>จำนวน</th><th>ราคา/หน่วย</th><th>จำนวนเงิน</th></tr></thead>
                <tbody>{items.map((it, i) => (
                  <tr key={i}><td>{i + 1}</td><td>{it.description || '-'}</td><td>{it.qty}</td><td>{num(it.unit_price)}</td><td>{num(it.qty * it.unit_price)}</td></tr>
                ))}</tbody>
              </table>
            )}
            <div className="tot">
              <div><span>ยอดก่อน VAT</span><span>{num(totals.subtotal)}</span></div>
              <div><span>ภาษีมูลค่าเพิ่ม 7%</span><span>{num(totals.vat)}</span></div>
              <div className="g"><span>ยอดรวมสุทธิ</span><span>{num(totals.total)}</span></div>
            </div>
          </div>
        </Card>
      </div>

      {newCust && (
        <Modal title="เพิ่มลูกค้าใหม่" onClose={() => setNewCust(null)}>
          {[['name', 'ชื่อบริษัท/ลูกค้า'], ['address', 'ที่อยู่'], ['tax_id', 'เลขประจำตัวผู้เสียภาษี (13 หลัก)'], ['email', 'อีเมล']].map(([k, label]) => (
            <div className="field" key={k}><label>{label}</label><input value={newCust[k]} onChange={(e) => setNewCust({ ...newCust, [k]: e.target.value })} /></div>
          ))}
          <button className="btn green" onClick={saveCustomer}>บันทึกลูกค้า</button>
        </Modal>
      )}
    </>
  );
}