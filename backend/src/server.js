const express = require('express');
const cors = require('cors');
require('dotenv').config();
const db = require('./config/db');

// โหลด Routes
const authRoutes = require('./modules/auth/auth.routes');
const shopRoutes = require('./modules/shops/shop.routes'); // <-- เพิ่มบรรทัดนี้

const app = express();
const PORT = process.env.PORT || 5000;

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
app.use('/api/v1/shops', shopRoutes); // <-- เพิ่มบรรทัดนี้

// Error Handling กรณีหา Endpoint ไม่เจอ (404)
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'API Endpoint Not Found' });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err);
  res.status(500).json({ success: false, message: 'Internal Server Error' });
});

app.listen(PORT, () => {
  console.log(`🚀 ThaiPlease Backend API is running on http://localhost:${PORT}`);
});