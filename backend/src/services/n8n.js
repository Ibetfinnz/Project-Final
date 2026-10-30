import { cfg } from '../config.js';

// ส่งงาน OCR สลิปให้ n8n (Workflow B) — n8n จะตอบกลับมาที่ /api/internal/slips/ingest
export async function triggerSlipOcr({ upload_id, file_name, mime, note }) {
  const res = await fetch(cfg.n8nUploadWebhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-webhook-key': cfg.n8nWebhookKey || '' },
    body: JSON.stringify({
      upload_id,
      mime,
      note,
      file_url: `${cfg.internalBaseUrl}/api/internal/files/${encodeURIComponent(file_name)}`,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error('n8n ปฏิเสธคีย์ (403): N8N_WEBHOOK_KEY ใน .env ต้องตรงกับค่าใน credential ของ node Webhook (Name = x-webhook-key)');
  }
  if (res.status === 404) throw new Error('ไม่พบ webhook (404): ตรวจว่า workflow B เปิด Active แล้ว และ path คือ ar-upload');
  if (!res.ok) throw new Error(`n8n webhook ตอบ ${res.status}`);
}