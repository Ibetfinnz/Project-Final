-- ============================================================
-- 004: เปลี่ยนชื่อตารางให้ตรงกับ schema กลาง (dbdiagram)
--   document_items -> document_line_items
--   uploads        -> source_files
--   payment_slips  -> payments
-- ใช้กับฐานข้อมูลที่มีข้อมูลอยู่แล้ว (init.sql มีผลเฉพาะสร้างใหม่)
-- ============================================================

ALTER TABLE document_items RENAME TO document_line_items;
ALTER TABLE uploads RENAME TO source_files;
ALTER TABLE payment_slips RENAME TO payments;

-- sequence ให้ชื่อสอดคล้องกับตารางใหม่
ALTER SEQUENCE document_items_id_seq RENAME TO document_line_items_id_seq;
ALTER SEQUENCE uploads_id_seq RENAME TO source_files_id_seq;
ALTER SEQUENCE payment_slips_id_seq RENAME TO payments_id_seq;

-- constraint/index ที่มีชื่อตามตารางเดิม
ALTER TABLE document_line_items RENAME CONSTRAINT document_items_pkey TO document_line_items_pkey;
ALTER TABLE document_line_items RENAME CONSTRAINT document_items_document_id_fkey TO document_line_items_document_id_fkey;

ALTER TABLE source_files RENAME CONSTRAINT uploads_pkey TO source_files_pkey;
ALTER TABLE source_files RENAME CONSTRAINT uploads_status_check TO source_files_status_check;
ALTER TABLE source_files RENAME CONSTRAINT uploads_source_ref_key TO source_files_source_ref_key;
ALTER TABLE source_files RENAME CONSTRAINT uploads_uploaded_by_fkey TO source_files_uploaded_by_fkey;
ALTER TABLE source_files RENAME CONSTRAINT uploads_document_id_fkey TO source_files_document_id_fkey;

ALTER TABLE payments RENAME CONSTRAINT payment_slips_pkey TO payments_pkey;
ALTER TABLE payments RENAME CONSTRAINT payment_slips_match_result_check TO payments_match_result_check;
ALTER TABLE payments RENAME CONSTRAINT payment_slips_source_ref_key TO payments_source_ref_key;
ALTER TABLE payments RENAME CONSTRAINT payment_slips_upload_id_fkey TO payments_upload_id_fkey;
ALTER TABLE payments RENAME CONSTRAINT payment_slips_matched_document_id_fkey TO payments_matched_document_id_fkey;
