-- ประวัติการแก้ไขเอกสาร (แสดงในแท็บ "ประวัติการแก้ไข")
CREATE TABLE IF NOT EXISTS document_history (
  id SERIAL PRIMARY KEY,
  document_id INT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  action TEXT NOT NULL DEFAULT 'edited',   -- created | edited
  text TEXT NOT NULL,
  by_user INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_document_history_doc ON document_history(document_id, created_at DESC);
