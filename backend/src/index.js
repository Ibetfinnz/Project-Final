import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import { cfg } from './config.js';
import { requireAuth, requireInternal } from './auth.js';
import { startJobs } from './jobs/overdue.js';
import authRoutes from './routes/auth.js';
import customerRoutes from './routes/customers.js';
import documentRoutes from './routes/documents.js';
import slipRoutes from './routes/slips.js';
import uploadRoutes from './routes/upload.js';
import dashboardRoutes from './routes/dashboard.js';
import notificationRoutes from './routes/notifications.js';
import internalRoutes from './routes/internal.js';

const app = express();
app.set('etag', false); // ปิด ETag กัน 304 ที่ทำให้ polling ค้าง
app.use(cors());
app.use(express.json({ limit: '25mb' })); // n8n ส่งไฟล์เป็น base64

// API ทุกตัวห้ามแคช
app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/internal', requireInternal, internalRoutes);

app.use('/api/customers', requireAuth, customerRoutes);
app.use('/api/documents', requireAuth, documentRoutes);
app.use('/api/payment-slips', requireAuth, slipRoutes);
app.use('/api/upload', requireAuth, uploadRoutes);
app.use('/api/dashboard', requireAuth, dashboardRoutes);
app.use('/api/notifications', requireAuth, notificationRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'เกิดข้อผิดพลาดในระบบ' });
});

app.listen(cfg.port, () => {
  console.log(`backend listening on :${cfg.port}`);
  startJobs();
});