export const cfg = {
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret',
  internalKey: process.env.INTERNAL_API_KEY || 'dev-internal',
  n8nUploadWebhook: process.env.N8N_UPLOAD_WEBHOOK,
  n8nWebhookKey: process.env.N8N_WEBHOOK_KEY,
  internalBaseUrl: process.env.INTERNAL_BASE_URL || 'http://backend:4000',
  uploadDir: process.env.UPLOAD_DIR || '/data/uploads',
  company: {
    name: process.env.COMPANY_NAME || 'บริษัทของคุณ',
    address: process.env.COMPANY_ADDRESS || '',
    taxId: process.env.COMPANY_TAX_ID || '',
    bank: process.env.BANK_INFO || '',
  },
  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
  },
};
