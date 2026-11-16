-- Migration: เพิ่ม role AP (พนักงานบัญชีรายจ่าย)
-- รันกับฐานข้อมูลเดิมที่สร้างไปแล้ว (init.sql ทำงานเฉพาะตอนสร้างฐานข้อมูลครั้งแรก)
--   docker compose exec -T db psql -U app -d accounting < db/migrations/002_ap_role.sql

ALTER TABLE documents ADD COLUMN IF NOT EXISTS side TEXT NOT NULL DEFAULT 'AR';
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_side_check;
ALTER TABLE documents ADD CONSTRAINT documents_side_check CHECK (side IN ('AR','AP'));
ALTER TABLE documents ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS approved_by INT REFERENCES users(id);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS payment_terms TEXT;
CREATE INDEX IF NOT EXISTS idx_documents_side ON documents(side);

-- ผู้ใช้ AP (รหัสผ่านเดียวกับ seed: ChangeMe123!)
INSERT INTO users(name,email,password_hash,role)
SELECT 'พนักงานบัญชีรายจ่าย (AP)', 'ap@example.com', password_hash, 'AP'
FROM users WHERE email = 'ar@example.com'
ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role;
