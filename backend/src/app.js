const path = require('node:path');
const express = require('express');
const cors = require('cors');
const db = require('./config/db');

// โหลด Routes
const authRoutes = require('./modules/auth/auth.routes');
const shopRoutes = require('./modules/shops/shop.routes');
const analyticsRoutes = require('./modules/analytics/analytics.routes');
const aiReportRoutes = require('./modules/ai-reports/ai-report.routes');
const paymentRoutes = require('./modules/payments/payment.routes');
const coinRoutes = require('./modules/coins/coin.routes');
const adminRoutes = require('./modules/admin/admin.routes');
const campaignRoutes = require('./modules/campaigns/campaign.routes');
const policyRoutes = require('./modules/policies/policy.routes');
const caseRoutes = require('./modules/cases/case.routes');
const paymentRequestRoutes = require('./modules/payment-requests/payment-request.routes');
const { UPLOAD_DIR } = require('./modules/shops/shop-image');

const app = express();

// Middleware พื้นฐาน
app.use(cors());
app.use(express.json());

// Health Check Endpoint
app.get('/health', async (req, res) => {
  try {
    const result = await db.query('SELECT NOW()');
    res.json({
      status: 'UP',
      database: 'Connected',
      timestamp: result.rows[0].now,
    });
  } catch (err) {
    res.status(500).json({ status: 'DOWN', error: err.message });
  }
});

// ผูก Module Routes ตาม Prefix ใน SRS (/api/v1)
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1', paymentRequestRoutes);
app.use('/api/v1/shops', shopRoutes);
app.use('/api/v1/shops', analyticsRoutes);
app.use('/api/v1', aiReportRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/users/me', coinRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/policy', policyRoutes);
app.use('/api/v1', caseRoutes);
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d', index: false }));
app.use('/api/v1', campaignRoutes);

// ใน Docker frontend กับ backend อยู่ container เดียว: backend เสิร์ฟหน้าเว็บที่ build แล้วด้วย
// ตอนพัฒนาไม่ได้ตั้งค่านี้ เพราะ frontend รันแยกด้วย Vite
const frontendDist = process.env.FRONTEND_DIST;
if (frontendDist) {
  app.use(express.static(frontendDist));
  // React Router: path ที่ไม่ใช่ API และไม่ใช่ไฟล์จริง ให้ส่ง index.html แล้วให้ React เลือกหน้าเอง
  app.get(/^(?!\/api\/|\/uploads\/|\/health$).*/, (req, res) => res.sendFile(path.join(frontendDist, 'index.html')));
}

// Error Handling กรณีหา Endpoint ไม่เจอ (404)
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'API Endpoint Not Found' });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err);
  res.status(500).json({ success: false, message: 'Internal Server Error' });
});

module.exports = app;
