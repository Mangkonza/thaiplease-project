const { test, describe, before, after, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { db, startServer, signToken } = require('./helpers');

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const CITIZEN_ID = '22222222-2222-4222-8222-222222222222';
const SHOP_ID = '33333333-3333-4333-8333-333333333333';
const PAYMENT_ID = '44444444-4444-4444-8444-444444444444';
const MERCHANT_ID = '55555555-5555-4555-8555-555555555555';
const COUPON_ID = '66666666-6666-4666-8666-666666666666';
const CASE_ID = '77777777-7777-4777-8777-777777777777';
const OTHER_SHOP_ID = '88888888-8888-4888-8888-888888888888';
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days) => new Date(Date.now() - days * DAY).toISOString();

const citizenToken = signToken({ user_id: CITIZEN_ID, email: 'c@example.com', role: 'CITIZEN', status: 'ACTIVE' });
const merchantToken = signToken({ user_id: MERCHANT_ID, email: 'm@example.com', role: 'MERCHANT', status: 'ACTIVE' });
const adminToken = signToken({ user_id: ADMIN_ID, email: 'a@example.com', role: 'ADMIN', status: 'ACTIVE' });

let api;
before(async () => { api = await startServer(); });
after(async () => { await api.close(); });
afterEach(() => mock.restoreAll());

// auth middleware และ verifyShopOwner ใช้ db.query; ร้าน SHOP_ID เป็นของ MERCHANT_ID
function mockPool() {
  mock.method(db, 'query', async (sql) => {
    if (sql.startsWith('SELECT status FROM users')) return { rows: [{ status: 'ACTIVE' }] };
    if (sql.includes('SELECT owner_id FROM shops')) return { rows: [{ owner_id: MERCHANT_ID }] };
    return { rows: [] };
  });
}

// client ของ transaction: handler(sql, params) คืน rows หรือ undefined (= rows ว่าง)
function mockClient(handler) {
  const statements = [];
  mock.method(db.pool, 'connect', async () => ({
    query: async (sql, params) => {
      statements.push({ sql, params, verb: sql.trim().split(/\s+/)[0] });
      return { rows: handler(sql, params) || [] };
    },
    release() {},
  }));
  return statements;
}

const caseRow = (overrides = {}) => ({
  case_id: CASE_ID, case_type: 'REFUND', user_id: CITIZEN_ID, payment_id: PAYMENT_ID, shop_id: SHOP_ID,
  status: 'PENDING', created_at: daysAgo(1), ...overrides,
});

describe('POST /users/me/cases', () => {
  const paymentRow = (paidDaysAgo, status = 'SUCCESS') => ({ payment_id: PAYMENT_ID, shop_id: SHOP_ID, status, paid_at: daysAgo(paidDaysAgo) });

  test('creates a refund request within 7 days of payment', async () => {
    mockPool();
    const statements = mockClient((sql) => {
      if (sql.includes('FROM payments WHERE payment_id')) return [paymentRow(6)];
      if (sql.includes('INSERT INTO case_requests')) return [{ case_id: CASE_ID, status: 'PENDING' }];
      return undefined;
    });
    const response = await api.request('POST', '/api/v1/users/me/cases', {
      token: citizenToken, body: { case_type: 'REFUND', payment_id: PAYMENT_ID, reason: '  ได้ของไม่ครบ ' },
    });
    assert.equal(response.status, 201);
    const insert = statements.find((s) => s.sql.includes('INSERT INTO case_requests'));
    assert.deepEqual(insert.params, ['REFUND', CITIZEN_ID, PAYMENT_ID, SHOP_ID, 'ได้ของไม่ครบ']);
  });

  test('refuses a refund more than 7 days after payment', async () => {
    mockPool();
    const statements = mockClient((sql) => (sql.includes('FROM payments') ? [paymentRow(8)] : undefined));
    const response = await api.request('POST', '/api/v1/users/me/cases', {
      token: citizenToken, body: { case_type: 'REFUND', payment_id: PAYMENT_ID, reason: 'ช้าไป' },
    });
    assert.equal(response.status, 409);
    assert.match(response.body.message, /within 7 days/);
    assert.ok(!statements.some((s) => s.verb === 'INSERT'));
  });

  test('allows a complaint on an older payment but not a refund on a refunded one', async () => {
    mockPool();
    mockClient((sql) => {
      if (sql.includes('FROM payments')) return [paymentRow(30, 'REFUNDED')];
      if (sql.includes('INSERT INTO case_requests')) return [{ case_id: CASE_ID }];
      return undefined;
    });
    const complaint = await api.request('POST', '/api/v1/users/me/cases', {
      token: citizenToken, body: { case_type: 'COMPLAINT', payment_id: PAYMENT_ID, reason: 'บริการไม่ดี' },
    });
    assert.equal(complaint.status, 201);
    const refund = await api.request('POST', '/api/v1/users/me/cases', {
      token: citizenToken, body: { case_type: 'REFUND', payment_id: PAYMENT_ID, reason: 'ขอคืน' },
    });
    assert.equal(refund.status, 409);
  });

  test('refuses a second open request of the same type', async () => {
    mockPool();
    mockClient((sql) => {
      if (sql.includes('FROM payments')) return [paymentRow(1)];
      if (sql.includes('INSERT INTO case_requests')) throw Object.assign(new Error('duplicate'), { code: '23505' });
      return undefined;
    });
    const response = await api.request('POST', '/api/v1/users/me/cases', {
      token: citizenToken, body: { case_type: 'REFUND', payment_id: PAYMENT_ID, reason: 'ซ้ำ' },
    });
    assert.equal(response.status, 409);
    assert.match(response.body.message, /already has an open request/);
  });

  test('refuses another citizen\'s payment and validates input', async () => {
    mockPool();
    mockClient(() => undefined);
    const missing = await api.request('POST', '/api/v1/users/me/cases', {
      token: citizenToken, body: { case_type: 'REFUND', payment_id: PAYMENT_ID, reason: 'ขอคืน' },
    });
    assert.equal(missing.status, 404);
    const invalid = await api.request('POST', '/api/v1/users/me/cases', {
      token: citizenToken, body: { case_type: 'OTHER', payment_id: PAYMENT_ID, reason: '' },
    });
    assert.equal(invalid.status, 400);
  });
});

describe('refund decisions', () => {
  function refundHandler(caseOverrides = {}) {
    return (sql) => {
      if (sql.includes('FROM case_requests WHERE case_id')) return [caseRow(caseOverrides)];
      if (sql.startsWith('UPDATE payments')) return [{ payment_id: PAYMENT_ID, user_id: CITIZEN_ID }];
      if (sql.includes('UPDATE coupons')) return [{ coupon_id: COUPON_ID }];
      if (sql.includes('SUM(amount)')) return [{ coins: 10 }];
      if (sql.includes('UPDATE case_requests')) return [{ case_id: CASE_ID, status: 'APPROVED' }];
      return undefined;
    };
  }

  test('shop approval refunds the payment, restores the coupon and reverses the coins', async () => {
    mockPool();
    const statements = mockClient(refundHandler());
    const response = await api.request('POST', `/api/v1/shops/${SHOP_ID}/refund-requests/${CASE_ID}/decision`, {
      token: merchantToken, body: { decision: 'APPROVE' },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.refund, { payment_id: PAYMENT_ID, coins_reversed: 10, coupons_restored: [COUPON_ID] });
    const ledger = statements.find((s) => s.sql.includes('INSERT INTO coin_ledger'));
    assert.deepEqual(ledger.params, [CITIZEN_ID, PAYMENT_ID, -10]);
    assert.ok(statements.some((s) => s.sql.includes("status = 'REFUNDED'")));
    const reopened = statements.find((s) => s.sql.includes('UPDATE mission_enrollments'));
    assert.deepEqual(reopened.params, [PAYMENT_ID]);
    const audit = statements.find((s) => s.sql.includes('INSERT INTO audit_logs'));
    assert.equal(audit.params[1], 'REFUND_APPROVED');
    assert.equal(statements.at(-1).verb, 'COMMIT');
  });

  test('rejection needs a note and does not touch the payment', async () => {
    mockPool();
    const statements = mockClient(refundHandler());
    const noNote = await api.request('POST', `/api/v1/shops/${SHOP_ID}/refund-requests/${CASE_ID}/decision`, {
      token: merchantToken, body: { decision: 'REJECT' },
    });
    assert.equal(noNote.status, 400);
    const response = await api.request('POST', `/api/v1/shops/${SHOP_ID}/refund-requests/${CASE_ID}/decision`, {
      token: merchantToken, body: { decision: 'REJECT', note: 'ลูกค้ารับของครบแล้ว' },
    });
    assert.equal(response.status, 200);
    assert.ok(!statements.some((s) => s.sql.startsWith('UPDATE payments')));
  });

  test('a shop cannot decide a request that belongs to another shop', async () => {
    mockPool();
    mockClient(refundHandler({ shop_id: OTHER_SHOP_ID }));
    const response = await api.request('POST', `/api/v1/shops/${SHOP_ID}/refund-requests/${CASE_ID}/decision`, {
      token: merchantToken, body: { decision: 'APPROVE' },
    });
    assert.equal(response.status, 404);
  });

  test('a merchant who does not own the shop is refused', async () => {
    mock.method(db, 'query', async (sql) => {
      if (sql.startsWith('SELECT status FROM users')) return { rows: [{ status: 'ACTIVE' }] };
      if (sql.includes('SELECT owner_id FROM shops')) return { rows: [{ owner_id: ADMIN_ID }] };
      return { rows: [] };
    });
    const response = await api.request('POST', `/api/v1/shops/${SHOP_ID}/refund-requests/${CASE_ID}/decision`, {
      token: merchantToken, body: { decision: 'APPROVE' },
    });
    assert.equal(response.status, 403);
  });

  test('a decided request cannot be decided again', async () => {
    mockPool();
    mockClient(refundHandler({ status: 'REJECTED' }));
    const response = await api.request('POST', `/api/v1/shops/${SHOP_ID}/refund-requests/${CASE_ID}/decision`, {
      token: merchantToken, body: { decision: 'APPROVE' },
    });
    assert.equal(response.status, 409);
  });

  test('admin can decide a refund only after the shop has had 3 days', async () => {
    mockPool();
    mockClient(refundHandler({ created_at: daysAgo(2) }));
    const early = await api.request('POST', `/api/v1/admin/cases/${CASE_ID}/decision`, {
      token: adminToken, body: { decision: 'APPROVE' },
    });
    assert.equal(early.status, 409);
    assert.match(early.body.message, /3 days/);

    mock.restoreAll();
    mockPool();
    const statements = mockClient(refundHandler({ created_at: daysAgo(4) }));
    const late = await api.request('POST', `/api/v1/admin/cases/${CASE_ID}/decision`, {
      token: adminToken, body: { decision: 'APPROVE' },
    });
    assert.equal(late.status, 200);
    assert.ok(statements.some((s) => s.sql.startsWith('UPDATE payments')));
  });

  test('admin resolves complaints right away and cannot approve them as refunds', async () => {
    mockPool();
    mockClient(refundHandler({ case_type: 'COMPLAINT', created_at: daysAgo(0) }));
    const wrong = await api.request('POST', `/api/v1/admin/cases/${CASE_ID}/decision`, {
      token: adminToken, body: { decision: 'APPROVE' },
    });
    assert.equal(wrong.status, 400);
    const resolved = await api.request('POST', `/api/v1/admin/cases/${CASE_ID}/decision`, {
      token: adminToken, body: { decision: 'RESOLVE', note: 'ตักเตือนร้านแล้ว' },
    });
    assert.equal(resolved.status, 200);
  });
});
