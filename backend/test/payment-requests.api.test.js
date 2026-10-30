const { test, describe, before, after, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { db, startServer, signToken } = require('./helpers');
const { requestState } = require('../src/modules/payment-requests/payment-request.service');

const MERCHANT_ID = '11111111-1111-4111-8111-111111111111';
const CITIZEN_ID = '22222222-2222-4222-8222-222222222222';
const SHOP_ID = '33333333-3333-4333-8333-333333333333';
const REQUEST_ID = '55555555-5555-4555-8555-555555555555';
const merchantToken = signToken({ user_id: MERCHANT_ID, email: 'm@example.com', role: 'MERCHANT', status: 'ACTIVE' });
const citizenToken = signToken({ user_id: CITIZEN_ID, email: 'c@example.com', role: 'CITIZEN', status: 'ACTIVE' });
let api;

before(async () => { api = await startServer(); });
after(async () => { await api.close(); });
afterEach(() => mock.restoreAll());

// mock db.query: ผู้ใช้ active, ร้านเป็นของ MERCHANT_ID แล้วส่งที่เหลือให้ handler ของแต่ละ test
function mockDb(handler) {
  const calls = [];
  mock.method(db, 'query', async (sql, params) => {
    if (sql.startsWith('SELECT status FROM users')) return { rows: [{ status: 'ACTIVE' }] };
    if (sql.startsWith('SELECT owner_id FROM shops')) return { rows: [{ owner_id: MERCHANT_ID }] };
    calls.push({ sql, params });
    return handler(sql, params) || { rows: [] };
  });
  return calls;
}

describe('POST /shops/:shopId/payment-requests', () => {
  test('creates a request for the amount the shop entered that expires in 5 minutes', async () => {
    const calls = mockDb((sql, params) => {
      if (sql.startsWith('SELECT status FROM shops')) return { rows: [{ status: 'ACTIVE' }] };
      if (sql.includes('INSERT INTO payment_requests')) {
        return { rows: [{ request_id: REQUEST_ID, shop_id: params[0], amount: '85.50', status: 'PENDING', expires_at: params[3], created_at: new Date(), payment_id: null }] };
      }
      return null;
    });
    const before = Date.now();
    const response = await api.request('POST', `/api/v1/shops/${SHOP_ID}/payment-requests`, { token: merchantToken, body: { amount: 85.5 } });

    assert.equal(response.status, 201);
    assert.equal(response.body.request.amount, 85.5);
    assert.equal(response.body.request.status, 'PENDING');
    const insert = calls.find((c) => c.sql.includes('INSERT INTO payment_requests'));
    assert.deepEqual(insert.params.slice(0, 3), [SHOP_ID, 85.5, MERCHANT_ID]);
    const ttl = insert.params[3].getTime() - before;
    assert.ok(ttl >= 5 * 60 * 1000 - 50 && ttl <= 5 * 60 * 1000 + 1000, `expected about 5 minutes, got ${ttl} ms`);
  });

  test('rejects amounts that are not positive with at most 2 decimals', async () => {
    const calls = mockDb(() => null);
    for (const amount of [0, -5, 'abc', 10.005, undefined]) {
      const response = await api.request('POST', `/api/v1/shops/${SHOP_ID}/payment-requests`, { token: merchantToken, body: { amount } });
      assert.equal(response.status, 400, `amount ${amount}`);
    }
    assert.equal(calls.length, 0);
  });

  test('refuses a shop that is not active', async () => {
    mockDb((sql) => (sql.startsWith('SELECT status FROM shops') ? { rows: [{ status: 'SUSPENDED' }] } : null));
    const response = await api.request('POST', `/api/v1/shops/${SHOP_ID}/payment-requests`, { token: merchantToken, body: { amount: 50 } });
    assert.equal(response.status, 409);
  });

  test('citizens cannot create payment requests', async () => {
    mockDb(() => null);
    const response = await api.request('POST', `/api/v1/shops/${SHOP_ID}/payment-requests`, { token: citizenToken, body: { amount: 50 } });
    assert.equal(response.status, 403);
  });
});

describe('payment request status', () => {
  test('a pending request past its expiry is reported as expired', () => {
    const now = new Date('2026-10-30T10:05:00Z');
    assert.equal(requestState({ status: 'PENDING', expires_at: '2026-10-30T10:05:00Z' }, now), 'EXPIRED');
    assert.equal(requestState({ status: 'PENDING', expires_at: '2026-10-30T10:05:01Z' }, now), 'PENDING');
    assert.equal(requestState({ status: 'PAID', expires_at: '2026-10-30T10:00:00Z' }, now), 'PAID');
  });

  test('the citizen sees the shop and the locked amount', async () => {
    mockDb((sql) => (sql.includes('FROM payment_requests r JOIN shops s') ? { rows: [{
      request_id: REQUEST_ID, shop_id: SHOP_ID, amount: '120.00', status: 'PENDING', expires_at: new Date(Date.now() + 60_000),
      created_at: new Date(), payment_id: null, shop_name: 'ร้านทดสอบ', shop_category: 'คาเฟ่', shop_area: 'บางเขน', shop_image_path: null,
    }] } : null));
    const response = await api.request('GET', `/api/v1/payment-requests/${REQUEST_ID}`, { token: citizenToken });
    assert.equal(response.status, 200);
    assert.equal(response.body.request.amount, 120);
    assert.equal(response.body.request.shop.name, 'ร้านทดสอบ');
    assert.ok(response.body.request.server_time);
  });

  test('the shop can cancel only an unpaid request', async () => {
    const calls = mockDb(() => ({ rows: [] }));
    const response = await api.request('POST', `/api/v1/shops/${SHOP_ID}/payment-requests/${REQUEST_ID}/cancel`, { token: merchantToken });
    assert.equal(response.status, 409);
    assert.match(calls[0].sql, /status = 'PENDING'/);
  });
});
