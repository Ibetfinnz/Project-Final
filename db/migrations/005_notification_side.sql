-- แยกการแจ้งเตือนว่าเป็นของฝั่ง AR หรือ AP
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS side TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notifications_side_check'
  ) THEN
    ALTER TABLE notifications
      ADD CONSTRAINT notifications_side_check CHECK (side IN ('AR','AP'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS notifications_side_idx ON notifications(side, is_read);

-- เติม side ให้รายการเก่าที่อ้างอิงเลขที่เอกสารได้
UPDATE notifications n
SET side = d.side
FROM documents d
WHERE n.side IS NULL
  AND n.link LIKE '/documents?q=%'
  AND d.doc_no = substring(n.link FROM 'q=([^&]+)');

-- รายการที่เกิดจากฝั่ง AP โดยตรง
UPDATE notifications
SET side = 'AP'
WHERE side IS NULL
  AND (message LIKE 'อนุมัติจ่าย %' OR message LIKE 'แจ้งแก้ไข %');

-- รายการรอเลือกประเภทจาก Gmail ถือเป็นงานฝั่ง AR
UPDATE notifications
SET side = 'AR'
WHERE side IS NULL
  AND link LIKE '/upload?job=%';
