// ตั้งค่า env ก่อน require โค้ดจริง เพื่อให้ test รันได้โดยไม่ต้องมี .env หรือ PostgreSQL
process.env.DB_USER = 'test_user';
process.env.DB_PASSWORD = 'test_password';
process.env.DB_NAME = 'test_db';
process.env.JWT_SECRET = 'test_jwt_secret';

const jwt = require('jsonwebtoken');
const db = require('../src/config/db');
const app = require('../src/app');

// db.js โหลด backend/.env ด้วย dotenv จึงต้องล้างค่า AI จริงออก ไม่ให้ test ใช้ key จริงหรือยิง AI จริง
for (const key of Object.keys(process.env)) {
  if (key.startsWith('AI_')) delete process.env[key];
}

// เปิด server ชั่วคราวบน port สุ่ม แล้วคืนฟังก์ชันสำหรับยิง request
async function startServer() {
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const request = async (method, path, { token, body } = {}) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(baseUrl + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };

  return { request, close: () => new Promise((resolve) => server.close(resolve)) };
}

function signToken(payload, options = { expiresIn: '1h' }) {
  return jwt.sign(payload, process.env.JWT_SECRET, options);
}

module.exports = { db, startServer, signToken };
