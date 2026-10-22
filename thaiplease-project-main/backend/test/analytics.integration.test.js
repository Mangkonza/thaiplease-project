// ทดสอบ SQL จริงกับ PostgreSQL ที่ใส่ seed แล้ว (backend/seed/README.md)
// ถ้าไม่มีฐานข้อมูลหรือไม่มี seed จะ skip พร้อมบอกเหตุผล เพื่อให้ npm test รันได้ทุกเครื่อง
// ไฟล์นี้อ่านค่าจาก backend/.env และไม่เขียนข้อมูลลงฐานข้อมูล
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { buildSeedData, summarizeShopWeeks, ID } = require('../scripts/generate-seed');

let db;
let skipReason = null;
let seed;

before(async () => {
  try {
    db = require('../src/config/db');
    await db.query('SELECT 1');
  } catch (error) {
    skipReason = `PostgreSQL not available (${error.code || error.message.split('.')[0]})`;
    return;
  }
  // หา --end ที่ใช้สร้าง seed จาก payment ล่าสุดของ seed แล้วสร้างค่าที่คาดหวังจาก generator ตัวเดียวกัน
  const result = await db.query(
    `SELECT to_char(MAX(paid_at) AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD') AS last_day
     FROM payments WHERE request_key LIKE 'seed-%'`
  );
  const lastDay = result.rows[0].last_day;
  if (!lastDay) {
    skipReason = 'seed data not loaded';
    return;
  }
  const date = new Date(`${lastDay}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + ((7 - date.getUTCDay()) % 7)); // อาทิตย์ของสัปดาห์นั้น
  seed = buildSeedData({ endDate: date.toISOString().slice(0, 10) });
});

after(async () => {
  if (db) await db.pool.end();
});

describe('analytics SQL against seeded PostgreSQL', () => {
  test('weekly metrics of shop A match the seed generator for all 8 weeks', async (t) => {
    if (skipReason) return t.skip(skipReason);
    const { computeShopMetrics } = require('../src/modules/analytics/analytics.service');

    for (const expected of summarizeShopWeeks(seed, ID.shopA)) {
      const actual = await computeShopMetrics(ID.shopA, { type: 'WEEK', start: expected.start, end: expected.end });
      assert.deepEqual(
        { orders: actual.orders, newCustomers: actual.new_customers, revenue: actual.revenue },
        { orders: expected.orders, newCustomers: expected.newCustomers, revenue: expected.revenue },
        `week ${expected.week} (${expected.start})`
      );
      assert.equal(actual.new_customers + actual.repeat_customers, actual.unique_buyers);
    }
  });

  test('refunded and failed payments are excluded from revenue (SRS 2.7)', async (t) => {
    if (skipReason) return t.skip(skipReason);
    const { computeShopMetrics } = require('../src/modules/analytics/analytics.service');
    const first = seed.weeks[0].start;
    const last = seed.weeks.at(-1).end;

    const actual = await computeShopMetrics(ID.shopA, { type: 'WEEK', start: first, end: last });
    const successOnly = seed.payments
      .filter((p) => p.shop_id === ID.shopA && p.status === 'SUCCESS')
      .reduce((sum, p) => sum + p.net_amount, 0);
    assert.equal(actual.revenue, successOnly);
  });
});
