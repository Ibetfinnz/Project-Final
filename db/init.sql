-- SQLBook: Code
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('AR','AP','EXEC')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE customers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  tax_id TEXT UNIQUE,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE documents (
  id SERIAL PRIMARY KEY,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('QT','OP','INV','BN','RC')),
  doc_no TEXT NOT NULL,
  ref_doc_id INT REFERENCES documents(id) ON DELETE SET NULL,
  ref_text TEXT,
  customer_po TEXT,
  customer_id INT REFERENCES customers(id),
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  vat NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  status_reason TEXT,
  source TEXT NOT NULL DEFAULT 'manual',   -- manual | gmail | upload
  source_ref TEXT UNIQUE,                  -- กันเอกสารซ้ำ เช่น gmailMessageId:idx
  file_path TEXT,
  paid_at TIMESTAMPTZ,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (doc_type, doc_no)
);
CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_documents_customer ON documents(customer_id);
CREATE INDEX idx_documents_due ON documents(due_date);

CREATE TABLE document_items (
  id SERIAL PRIMARY KEY,
  document_id INT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  qty NUMERIC(14,2) NOT NULL,
  unit_price NUMERIC(14,2) NOT NULL,
  amount NUMERIC(14,2) NOT NULL
);

-- running number แยกตามประเภท + ปี พ.ศ.
CREATE TABLE doc_counters (
  doc_type TEXT NOT NULL,
  year INT NOT NULL,
  last_no INT NOT NULL DEFAULT 0,
  PRIMARY KEY (doc_type, year)
);

CREATE TABLE uploads (
  id SERIAL PRIMARY KEY,
  file_path TEXT NOT NULL,
  original_name TEXT,
  mime TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','done','error')),
  error TEXT,
  slip_id INT,
  uploaded_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE payment_slips (
  id SERIAL PRIMARY KEY,
  upload_id INT REFERENCES uploads(id),
  transfer_at TIMESTAMPTZ,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  sender_name TEXT,
  ref_no TEXT,
  matched_document_id INT REFERENCES documents(id) ON DELETE SET NULL,
  match_result TEXT NOT NULL CHECK (match_result IN ('matched','mismatch','no_invoice')),
  verified BOOLEAN NOT NULL DEFAULT false,
  file_path TEXT,
  ocr_raw JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE ocr_logs (
  id SERIAL PRIMARY KEY,
  source TEXT,
  source_ref TEXT,
  raw JSONB,
  confidence NUMERIC(4,3),
  ok BOOLEAN,
  errors JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE notifications (
  id SERIAL PRIMARY KEY,
  message TEXT NOT NULL,
  link TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
-- ตารางเชื่อมเอกสาร: ใบวางบิล 1 ใบ อ้างอิงใบแจ้งหนี้ได้หลายใบ
-- รันกับฐานข้อมูลที่มีอยู่ 1 ครั้ง และเพิ่มชุดเดียวกันนี้ต่อท้าย db/init.sql
-- (init.sql ทำงานเฉพาะตอนสร้างฐานข้อมูลครั้งแรก)

CREATE TABLE IF NOT EXISTS document_refs (
  document_id     INT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  ref_document_id INT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  PRIMARY KEY (document_id, ref_document_id)
);
CREATE INDEX IF NOT EXISTS idx_document_refs_ref ON document_refs(ref_document_id);

-- ย้ายการอ้างอิงเดิม (ref_doc_id) เข้าตารางใหม่ด้วย
INSERT INTO document_refs (document_id, ref_document_id)
SELECT id, ref_doc_id FROM documents WHERE ref_doc_id IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_doc_type_check;
ALTER TABLE documents ADD CONSTRAINT documents_doc_type_check
  CHECK (doc_type IN ('QT','OP','INV','BN','RC','TX'));
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS check_result TEXT,      -- matched | mismatch | no_reference
  ADD COLUMN IF NOT EXISTS check_notes  JSONB;

ALTER TABLE uploads DROP CONSTRAINT IF EXISTS uploads_status_check;
ALTER TABLE uploads ADD CONSTRAINT uploads_status_check
  CHECK (status IN ('processing','review','done','error'));
ALTER TABLE uploads
  ADD COLUMN IF NOT EXISTS doc_type      TEXT,
  ADD COLUMN IF NOT EXISTS ocr_data      JSONB,
  ADD COLUMN IF NOT EXISTS check_preview JSONB,
  ADD COLUMN IF NOT EXISTS source_ref    TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS document_id   INT REFERENCES documents(id) ON DELETE SET NULL;

ALTER TABLE payment_slips ADD COLUMN IF NOT EXISTS source_ref TEXT UNIQUE;