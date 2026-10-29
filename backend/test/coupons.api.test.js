const { test, describe, before, after, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { db, startServer, signToken, TEST_PIN, paymentAccountRows } = require('./helpers');

const CITIZEN_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_ID = '55555555-5555-4555-8555-555555555555';
const SHOP_ID = '33333333-3333-4333-8333-333333333333';
const PAYMENT_ID = '44444444-4444-4444-8444-444444444444';
const COUPON_ID = '66666666-6666-4666-8666-666666666666';
const POLICY_ROW = {
  policy_version: 1, copay_percent: '60.00', daily_cap: '200.00', monthly_cap: '2000.00', lifetime_cap: '8000.00',
  baht_per_coin: 25, coupon_coin_cost: 100, coupon_value: '20.00', coupon_min_spend: '100.00', coupon_valid_days: 30,
  program_start: '2000-01-01', program_end: '2999-12-31',
};
const FUTURE = new Date(Date.now() + 86400000).toISOString();
const PAST = new Date(Date.now() - 86400000).toISOString();
const couponRow = (overrides = {}) => ({
  coupon_id: COUPON_ID, user_id: CITIZEN_ID, value: '20.00', min_spend: '100.00', status: 'ACTIVE', expires_at: FUTURE, ...overrides,
});
const token = signToken({ user_id: CITIZEN_ID, email: 'citizen@example.com', role: 'CITIZEN', status: 'ACTIVE' });

let api;
before(async () => { api = await startServer(); });
after(async () => { await api.close(); });
afterEach(() => mock.restoreAll());

const activeUserOnly = () => mock.method(db, 'query', async (sql) => (
  sql.startsWith('SELECT status FROM users') ? { rows: [{ status: 'ACTIVE' }] } : { rows: [] }
));

describe('POST /users/me/coupons', () => {
  test('redeems coins for a coupon using the current policy', async () => {
    activeUserOnly();
    const statements = [];
    let ledgerParams;
    let couponParams;
    let lockedUser = false;
    mock.method(db.pool, 'connect', async () => ({
      query: async (sql, params) => {
        const account = paymentAccountRows(sql);
        if (account) return account;
        statements.push(sql.trim().split(/\s+/)[0]);
        if (sql.includes('FROM users WHERE user_id = $1 FOR UPDATE')) { lockedUser = true; return { rows: [] }; }
        if (sql.includes('FROM project_policies')) return { rows: [POLICY_ROW] };
        if (sql.includes('SUM(amount)')) {
          assert.ok(lockedUser, 'balance must be read after the citizen row is locked');
          return { rows: [{ balance: 130 }] };
        }
        if (sql.includes('INSERT INTO coupons')) {
          couponParams = params;
          return { rows: [{ coupon_id: COUPON_ID, value: '20.00', min_spend: '100.00', status: 'ACTIVE', expires_at: FUTURE }] };
        }
        if (sql.includes('INSERT INTO coin_ledger')) ledgerParams = params;
        return { rows: [] };
      },
      release() {},
    }));

    const response = await api.request('POST', '/api/v1/users/me/coupons', { token });

    assert.equal(response.status, 201);
    assert.equal(response.body.coupon.value, 20);
    assert.equal(response.body.balance, 30);
    assert.deepEqual(couponParams, [CITIZEN_ID, 20, 100, 100, 1, 30]);
    assert.deepEqual(ledgerParams, [CITIZEN_ID, -100]);
    assert.equal(statements.at(-1), 'COMMIT');
  });

  test('refuses when the balance is below the coupon cost', async () => {
    activeUserOnly();
    const statements = [];
    mock.method(db.pool, 'connect', async () => ({
      query: async (sql) => {
        const account = paymentAccountRows(sql);
        if (account) return account;
        statements.push(sql.trim().split(/\s+/)[0]);
        if (sql.includes('FROM project_policies')) return { rows: [POLICY_ROW] };
        if (sql.includes('SUM(amount)')) return { rows: [{ balance: 99 }] };
        return { rows: [] };
      },
      release() {},
    }));

    const response = await api.request('POST', '/api/v1/users/me/coupons', { token });

    assert.equal(response.status, 409);
    assert.match(response.body.message, /Not enough coins/);
    assert.ok(!statements.includes('INSERT'));
    assert.equal(statements.at(-1), 'ROLLBACK');
  });
});

describe('POST /payments with a coupon', () => {
  function mockCheckout({ coupon, onSql = () => {} }) {
    activeUserOnly();
    mock.method(db.pool, 'connect', async () => ({
      query: async (sql, params) => {
        const account = paymentAccountRows(sql);
        if (account) return account;
        onSql(sql, params);
        if (sql.includes('SELECT * FROM payments WHERE request_key')) return { rows: [] };
        if (sql.includes('SELECT shop_id, status FROM shops')) return { rows: [{ shop_id: SHOP_ID, status: 'ACTIVE' }] };
        if (sql.includes('FROM project_policies')) return { rows: [POLICY_ROW] };
        if (sql.includes('SUM(government_subsidy)')) return { rows: [{ today: 0, month: 0, total: 0 }] };
        if (sql.includes('FROM coupons WHERE coupon_id')) return { rows: coupon ? [coupon] : [] };
        if (sql.includes('INSERT INTO payments')) return { rows: [{ payment_id: PAYMENT_ID, status: 'SUCCESS' }] };
        return { rows: [] };
      },
      release() {},
    }));
  }

  test('takes the coupon off before the co-pay and marks the coupon used', async () => {
    let insertParams;
    let couponUpdate;
    mockCheckout({
      coupon: couponRow(),
      onSql: (sql, params) => {
        if (sql.includes('INSERT INTO payments')) insertParams = params;
        if (sql.includes('UPDATE coupons')) couponUpdate = params;
      },
    });

    const response = await api.request('POST', '/api/v1/payments', {
      token, body: { shop_id: SHOP_ID, pin: TEST_PIN, request_key: 'coupon-pay-1', gross_amount: 120, coupon_id: COUPON_ID },
    });

    assert.equal(response.status, 201);
    // 120 − คูปอง 20 = 100, รัฐช่วย 60% = 60, ประชาชนจ่าย 40; ร้านยังได้ 120 เต็ม
    assert.deepEqual(insertParams.slice(3, 9), [120, 0, 120, 20, 60, 40]);
    assert.deepEqual(couponUpdate.slice(0, 2), [COUPON_ID, PAYMENT_ID]);
  });

  test('quote previews the coupon without marking it used', async () => {
    const statements = [];
    mockCheckout({ coupon: couponRow(), onSql: (sql) => statements.push(sql.trim().split(/\s+/)[0]) });

    const response = await api.request('POST', '/api/v1/payments/quote', {
      token, body: { shop_id: SHOP_ID, gross_amount: 100, coupon_id: COUPON_ID },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.quote.coupon_discount, 20);
    assert.equal(response.body.quote.government_subsidy, 48);
    assert.equal(response.body.quote.citizen_paid, 32);
    assert.ok(!statements.includes('UPDATE'));
    assert.equal(statements.at(-1), 'ROLLBACK');
  });

  const refusals = [
    ['another citizen\'s coupon', couponRow({ user_id: OTHER_ID }), 100, 404, /Coupon not found/],
    ['a missing coupon', null, 100, 404, /Coupon not found/],
    ['a used coupon', couponRow({ status: 'USED' }), 100, 409, /already been used/],
    ['an expired coupon', couponRow({ expires_at: PAST }), 100, 409, /expired/],
    ['a purchase below the minimum spend', couponRow(), 99.99, 409, /at least 100 baht/],
  ];
  for (const [name, coupon, amount, status, message] of refusals) {
    test(`refuses ${name} without saving the payment`, async () => {
      const statements = [];
      mockCheckout({ coupon, onSql: (sql) => statements.push(sql.trim().split(/\s+/)[0]) });

      const response = await api.request('POST', '/api/v1/payments', {
        token, body: { shop_id: SHOP_ID, pin: TEST_PIN, request_key: `coupon-refuse-${status}-${amount}`, gross_amount: amount, coupon_id: COUPON_ID },
      });

      assert.equal(response.status, status);
      assert.match(response.body.message, message);
      assert.ok(!statements.includes('INSERT'));
      assert.equal(statements.at(-1), 'ROLLBACK');
    });
  }

  test('rejects a coupon_id that is not a UUID before opening a transaction', async () => {
    activeUserOnly();
    mock.method(db.pool, 'connect', async () => { throw new Error('must not connect'); });
    const response = await api.request('POST', '/api/v1/payments', {
      token, body: { shop_id: SHOP_ID, pin: TEST_PIN, request_key: 'coupon-bad-id', gross_amount: 100, coupon_id: 'abc' },
    });
    assert.equal(response.status, 400);
  });
});
