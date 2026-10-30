import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { baht } from '../format.js';
import { Card, PageHeader } from '../components.jsx';

const TYPES = { SLIP: 'สลิปโอนเงิน', OP: 'ใบสั่งซื้อ', INV: 'ใบแจ้งหนี้', BN: 'ใบวางบิล', RC: 'ใบเสร็จรับเงิน', TX: 'ใบกำกับภาษี' };
const MATCH = { matched: 'ยอดตรงกับเอกสาร', mismatch: 'ยอดไม่ตรงกับเอกสาร', no_invoice: 'ไม่พบใบแจ้งหนี้ที่ตรงกัน' };
const CHECK = { matched: '✔ ตรงกับเอกสารก่อนหน้า', mismatch: '✖ ไม่ตรงกับเอกสารก่อนหน้า', no_reference: '⚠ ไม่พบเอกสารก่อนหน้าให้เทียบ' };
const DOC_FIELDS = [['doc_no', 'เลขที่เอกสาร'], ['ref_no', 'อ้างอิงเอกสารก่อนหน้า'], ['customer_name', 'ลูกค้า'],
  ['tax_id', 'เลขผู้เสียภาษี'], ['issue_date', 'วันที่ออก (YYYY-MM-DD)'], ['due_date', 'ครบกำหนด (YYYY-MM-DD)'],
  ['subtotal', 'ยอดก่อน VAT'], ['vat', 'VAT'], ['total', 'ยอดรวมสุทธิ']];
const SLIP_FIELDS = [['amount', 'ยอดเงิน'], ['sender_name', 'ผู้โอน'], ['receiver_name', 'ผู้รับ'], ['bank', 'ธนาคาร'],
  ['transfer_datetime', 'วันเวลาโอน'], ['ref_no', 'รหัสอ้างอิง'], ['memo', 'บันทึกช่วยจำ']];

export default function UploadFile() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [file, setFile] = useState(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [job, setJob] = useState(null);
  const [type, setType] = useState('');
  const [data, setData] = useState({});
  const [saved, setSaved] = useState(null);
  const [saving, setSaving] = useState(false);
  const timer = useRef();

  const onDrop = useCallback((accepted, rejected) => {
    setError('');
    if (rejected.length) {
      const code = rejected[0].errors[0].code;
      setError(code === 'file-too-large' ? 'ไฟล์ต้องมีขนาดไม่เกิน 8 MB' : 'รองรับเฉพาะรูปภาพและไฟล์ PDF');
      return;
    }
    setFile(accepted[0]);
  }, []);
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop, multiple: false, noClick: true, maxSize: 8 * 1024 * 1024,
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp'], 'application/pdf': ['.pdf'] },
  });

  const poll = (id) => {
    clearInterval(timer.current);
    timer.current = setInterval(async () => {
      try {
        const s = await api.get('/upload/' + id);
        setJob(s);
        if (s.status !== 'processing') {
          clearInterval(timer.current);
          if (s.status === 'review') { setType(s.doc_type || ''); setData(s.ocr_data || {}); }
        }
      } catch (e) { clearInterval(timer.current); setError(e.message); }
    }, 2000);
  };
  useEffect(() => () => clearInterval(timer.current), []);
  useEffect(() => { // เปิดจากแจ้งเตือน เช่น /upload?job=12
    const id = params.get('job');
    if (id) { setJob({ id, status: 'processing' }); poll(id); }
  }, []); // eslint-disable-line

  const submit = async () => {
    setError(''); setSaved(null);
    const fd = new FormData();
    fd.append('file', file); fd.append('note', note);
    try {
      const { id } = await api.post('/upload', fd);
      setJob({ id, status: 'processing' });
      poll(id);
    } catch (e) { setError(e.message); }
  };

  const set = (k, v) => setData((d) => ({ ...d, [k]: v }));
  const setItem = (i, k, v) => set('items', (data.items || []).map((x, n) => (n === i ? { ...x, [k]: v } : x)));
  const setRef = (i, k, v) => set('invoice_refs', (data.invoice_refs || []).map((x, n) => (n === i ? { ...x, [k]: v } : x)));

  const save = async () => {
    setError(''); setSaving(true);
    try {
      const r = await api.post(`/upload/${job.id}/confirm`, { doc_type: type, data });
      setSaved(r); setJob({ ...job, status: 'done' });
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  const fields = type === 'SLIP' ? SLIP_FIELDS : DOC_FIELDS;
  const chk = job?.check_preview;

  return (
    <>
      <PageHeader title="อัปโหลดเอกสาร" sub="Upload file" />
      {error && <div className="err">{error}</div>}
      <div {...getRootProps({ className: 'drop' + (isDragActive ? ' active' : '') })}>
        <input {...getInputProps()} />
        <div style={{ fontSize: 28 }}>⬆</div>
        <p><b>{file ? file.name : 'ลากไฟล์มาวางที่นี่'}</b><br />รองรับรูปภาพและ PDF ขนาดไม่เกิน 8 MB</p>
        <button className="btn" onClick={open}>เลือกไฟล์จากเครื่อง</button>
      </div>

      <div className="field" style={{ marginTop: 18 }}>
        <label>หมายเหตุ</label>
        <textarea rows="3" value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="ใส่เลขเอกสารที่เกี่ยวข้อง เช่น INV-2569-0153 เพื่อให้ระบบจับคู่สลิปได้แม่นขึ้น" />
      </div>
      <div style={{ textAlign: 'right' }}>
        <button className="btn green" disabled={!file || job?.status === 'processing'} onClick={submit}>⬆ อัปโหลด</button>
      </div>

      {job?.status === 'processing' && <Card><p>กำลังอ่านเอกสารด้วย OCR... (ปกติใช้เวลาไม่เกิน 1 นาที)</p></Card>}
      {job?.status === 'error' && <Card><div className="err">อ่านเอกสารไม่สำเร็จ: {job.error}</div></Card>}

      {job?.status === 'review' && (
        <Card>
          {job.error && <div className="err">{job.error}</div>}
          <div className="field">
            <label>ประเภทเอกสารที่ระบบอ่านได้ (แก้ไขได้)</label>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">-- เลือกประเภทเอกสาร --</option>
              {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>

          {type && (
            <div className="two-col" style={{ gridTemplateColumns: '1fr 1fr', gap: 18 }}>
              <div>
                <h3>ข้อมูลเอกสาร</h3>
                {fields.map(([k, label]) => (
                  <div className="field" key={k}><label>{label}</label>
                    <input value={data[k] ?? ''} onChange={(e) => set(k, e.target.value)} /></div>
                ))}
              </div>
              <div>
                {type === 'SLIP' ? null : type === 'BN' ? (
                  <>
                    <h3>ใบแจ้งหนี้ที่วางบิล</h3>
                    <table className="t"><thead><tr><th>เลขที่เอกสาร</th><th className="r">จำนวนเงิน</th></tr></thead>
                      <tbody>{(data.invoice_refs || []).map((x, i) => (
                        <tr key={i}>
                          <td><input value={x.doc_no ?? ''} onChange={(e) => setRef(i, 'doc_no', e.target.value)} /></td>
                          <td><input value={x.amount ?? ''} onChange={(e) => setRef(i, 'amount', e.target.value)} /></td>
                        </tr>))}</tbody></table>
                  </>
                ) : (
                  <>
                    <h3>รายการเอกสาร</h3>
                    <table className="t"><thead><tr><th>รายการ</th><th>จำนวน</th><th>ราคา/หน่วย</th><th /></tr></thead>
                      <tbody>{(data.items || []).map((x, i) => (
                        <tr key={i}>
                          <td><input value={x.description ?? ''} onChange={(e) => setItem(i, 'description', e.target.value)} /></td>
                          <td><input style={{ width: 60 }} value={x.qty ?? ''} onChange={(e) => setItem(i, 'qty', e.target.value)} /></td>
                          <td><input style={{ width: 90 }} value={x.unit_price ?? ''} onChange={(e) => setItem(i, 'unit_price', e.target.value)} /></td>
                          <td><button className="btn sm" onClick={() => set('items', data.items.filter((_, n) => n !== i))}>✕</button></td>
                        </tr>))}</tbody></table>
                    <button className="btn sm" onClick={() => set('items', [...(data.items || []), { description: '', qty: 1, unit_price: 0 }])}>+ เพิ่มรายการ</button>
                  </>
                )}

                {chk && type !== 'SLIP' && (
                  <div style={{ marginTop: 14 }} className={chk.result === 'matched' ? 'ok' : chk.result === 'mismatch' ? 'err' : 'muted'}>
                    <b>{CHECK[chk.result]}</b>{chk.ref_doc_no && <> ({chk.ref_doc_no})</>}
                    {(chk.notes || []).map((n, i) => <div key={i}>{n}</div>)}
                  </div>
                )}
              </div>
            </div>
          )}
          <div style={{ textAlign: 'right', marginTop: 14 }}>
            <button className="btn green" disabled={!type || saving} onClick={save}>บันทึกลงฐานข้อมูล</button>
          </div>
        </Card>
      )}

      {job?.status === 'done' && saved && (
        <Card>
          {saved.kind === 'slip' ? (
            <>
              <div className="ok">บันทึกสลิปสำเร็จ</div>
              <p>ผู้โอน: <b>{data.sender_name || '-'}</b> · ยอด: <b>{baht(Number(data.amount) || 0)}</b></p>
              <p>ผลจับคู่: <b>{MATCH[saved.match_result]}</b>{saved.doc_no && <> ({saved.doc_no})</>}</p>
              <button className="btn teal" onClick={() => nav('/verify')}>ไปตรวจสอบสลิป</button>
            </>
          ) : (
            <>
              <div className={saved.status === 'invalid' ? 'err' : 'ok'}>
                บันทึก{saved.label} {saved.doc_no} แล้ว{saved.status === 'invalid' ? ' (ต้องตรวจสอบ)' : ''}
              </div>
              {saved.check && <p><b>{CHECK[saved.check.result]}</b></p>}
              {(saved.errors || []).map((e, i) => <p key={i} className="muted">• {e}</p>)}
              <button className="btn teal" onClick={() => nav('/documents?q=' + saved.doc_no)}>ไปที่รายการเอกสาร</button>
            </>
          )}
        </Card>
      )}
    </>
  );
}