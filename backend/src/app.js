const express = require('express');
const cors = require('cors');
const db = require('./config/db');

// โหลด Routes
const authRoutes = require('./modules/auth/auth.routes');
const shopRoutes = require('./modules/shops/shop.routes');
const analyticsRoutes = require('./modules/analytics/analytics.routes');
const aiReportRoutes = require('./modules/ai-reports/ai-report.routes');

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
app.use('/api/v1/shops', shopRoutes);
app.use('/api/v1/shops', analyticsRoutes);
app.use('/api/v1', aiReportRoutes);

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
