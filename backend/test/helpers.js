// ตั้งค่า env ก่อน require โค้ดจริง เพื่อให้ test รันได้โดยไม่ต้องมี .env หรือ PostgreSQL
process.env.DB_USER = 'test_user';
process.env.DB_PASSWORD = 'test_password';
process.env.DB_NAME = 'test_db';
process.env.JWT_SECRET = 'test_jwt_secret';

const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
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

  return { request, baseUrl, close: () => new Promise((resolve) => server.close(resolve)) };
}

function signToken(payload, options = { expiresIn: '1h' }) {
  return jwt.sign(payload, process.env.JWT_SECRET, options);
}

const TEST_PIN = '123456';
const TEST_PIN_HASH = bcrypt.hashSync(TEST_PIN, 4);

// แถวที่การจ่ายเงินต้องอ่านเพิ่ม: PIN ของผู้จ่ายและยอดในกระเป๋าเงิน; คืน null ถ้าเป็นคำสั่งอื่น
function paymentAccountRows(sql, { balance = 100000, pinHash = TEST_PIN_HASH } = {}) {
  if (sql.includes('SELECT pin_hash, pin_failed_attempts')) {
    return { rows: [{ pin_hash: pinHash, pin_failed_attempts: 0, pin_locked_until: null }] };
  }
  if (sql.includes('FROM wallet_ledger WHERE user_id')) return { rows: [{ balance: String(balance) }] };
  return null;
}

// คำขอรับเงินที่ร้านสร้างไว้ (แบบไทยพลัส): test ขอ id ของคำขอที่มียอดตามต้องการ แล้ว mock ตอบแถวด้วย paymentRequestRows
const paymentRequests = new Map();
function paymentRequestFor(shopId, amount, overrides = {}) {
  const requestId = crypto.randomUUID();
  paymentRequests.set(requestId, {
    request_id: requestId, shop_id: shopId, amount: String(amount), status: 'PENDING',
    expires_at: new Date(Date.now() + 60_000), payment_id: null, ...overrides,
  });
  return requestId;
}
function paymentRequestRows(sql, params = []) {
  if (!sql.includes('FROM payment_requests WHERE request_id')) return null;
  const row = paymentRequests.get(params[0]);
  return { rows: row ? [row] : [] };
}

module.exports = {
  db, startServer, signToken, TEST_PIN, TEST_PIN_HASH, paymentAccountRows, paymentRequestFor, paymentRequestRows,
};
