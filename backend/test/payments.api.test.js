const { test, describe, before, after, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { db, startServer, signToken } = require('./helpers');

const CITIZEN_ID = '22222222-2222-4222-8222-222222222222';
const SHOP_ID = '33333333-3333-4333-8333-333333333333';
const PAYMENT_ID = '44444444-4444-4444-8444-444444444444';
const POLICY_ROW = {
  policy_version: 1, copay_percent: '60.00', daily_cap: '200.00', monthly_cap: '2000.00', lifetime_cap: '8000.00',
  baht_per_coin: 25, program_start: '2000-01-01', program_end: '2999-12-31',
};
const token = signToken({ user_id: CITIZEN_ID, email: 'citizen@example.com', role: 'CITIZEN', status: 'ACTIVE' });
let api;

before(async () => { api = await startServer(); });
after(async () => { await api.close(); });
afterEach(() => mock.restoreAll());

describe('POST /payments', () => {
  test('records a successful payment and earns one coin per 25 baht', async () => {
    const statements = [];
    mock.method(db, 'query', async (sql) => {
      if (sql.startsWith('SELECT status FROM users')) return { rows: [{ status: 'ACTIVE' }] };
      throw new Error(`Unexpected pool query: ${sql}`);
    });
    mock.method(db.pool, 'connect', async () => ({
      query: async (sql, params) => {
        statements.push(sql.trim().split(/\s+/).slice(0, 4).join(' '));
        if (sql.includes('SELECT * FROM payments WHERE request_key')) return { rows: [] };
        if (sql.includes('SELECT shop_id, status FROM shops')) return { rows: [{ shop_id: SHOP_ID, status: 'ACTIVE' }] };
        if (sql.includes('FROM campaigns c')) return { rows: [] };
        if (sql.includes('INSERT INTO payments')) {
          return { rows: [{
            payment_id: PAYMENT_ID, user_id: CITIZEN_ID, shop_id: SHOP_ID,
            gross_amount: '100.00', discount_amount: '0.00', net_amount: '100.00', status: 'SUCCESS',
          }] };
        }
        return { rows: [] };
      },
      release() {},
    }));

    const response = await api.request('POST', '/api/v1/payments', {
      token,
      body: { shop_id: SHOP_ID, request_key: 'payment-test-1', gross_amount: 100 },
    });

    assert.equal(response.status, 201);
    assert.equal(response.body.payment.status, 'SUCCESS');
    assert.equal(response.body.coins_earned, 4);
    assert.ok(statements.some((item) => item.startsWith('INSERT INTO coin_ledger')));
    assert.ok(statements.includes('COMMIT'));
  });

  test('applies the 60% government co-pay, locks the citizen and stores every amount', async () => {
    mock.method(db, 'query', async (sql) => (
      sql.startsWith('SELECT status FROM users') ? { rows: [{ status: 'ACTIVE' }] } : { rows: [] }
    ));
    let insertParams;
    let lockedUser = false;
    let coinParams;
    mock.method(db.pool, 'connect', async () => ({
      query: async (sql, params) => {
        if (sql.includes('SELECT * FROM payments WHERE request_key')) return { rows: [] };
        if (sql.includes('SELECT shop_id, status FROM shops')) return { rows: [{ shop_id: SHOP_ID, status: 'ACTIVE' }] };
        if (sql.includes('FROM users WHERE user_id = $1 FOR UPDATE')) { lockedUser = true; return { rows: [] }; }
        if (sql.includes('FROM project_policies')) return { rows: [POLICY_ROW] };
        if (sql.includes('SUM(government_subsidy)')) {
          assert.ok(lockedUser, 'usage must be read after the citizen row is locked');
          return { rows: [{ today: '180.00', month: '180.00', total: '180.00' }] };
        }
        if (sql.includes('INSERT INTO payments')) {
          insertParams = params;
          return { rows: [{ payment_id: PAYMENT_ID, status: 'SUCCESS' }] };
        }
        if (sql.includes('INSERT INTO coin_ledger')) coinParams = params;
        return { rows: [] };
      },
      release() {},
    }));

    const response = await api.request('POST', '/api/v1/payments', {
      token, body: { shop_id: SHOP_ID, request_key: 'payment-test-copay', gross_amount: 100 },
    });

    assert.equal(response.status, 201);
    // เหลือสิทธิ์วันนี้ 20 บาท จึงได้รัฐช่วย 20 ไม่ใช่ 60
    assert.deepEqual(insertParams.slice(3, 10), [100, 0, 100, 0, 20, 80, 1]);
    assert.equal(response.body.breakdown.subsidy_status, 'CAP_REACHED');
    assert.equal(coinParams[2], 4);
  });

  test('quote shows the breakdown without saving anything', async () => {
    mock.method(db, 'query', async (sql) => (
      sql.startsWith('SELECT status FROM users') ? { rows: [{ status: 'ACTIVE' }] } : { rows: [] }
    ));
    const statements = [];
    mock.method(db.pool, 'connect', async () => ({
      query: async (sql) => {
        statements.push(sql.trim().split(/\s+/).slice(0, 3).join(' '));
        if (sql.includes('SELECT shop_id, status FROM shops')) return { rows: [{ shop_id: SHOP_ID, status: 'ACTIVE' }] };
        if (sql.includes('FROM project_policies')) return { rows: [POLICY_ROW] };
        if (sql.includes('SUM(government_subsidy)')) return { rows: [{ today: 0, month: 0, total: 0 }] };
        return { rows: [] };
      },
      release() {},
    }));

    const response = await api.request('POST', '/api/v1/payments/quote', {
      token, body: { shop_id: SHOP_ID, gross_amount: 250 },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.quote.government_subsidy, 150);
    assert.equal(response.body.quote.citizen_paid, 100);
    assert.equal(response.body.quote.coins_estimate, 10);
    assert.ok(!statements.some((item) => item.startsWith('INSERT')));
    assert.equal(statements.at(-1), 'ROLLBACK');
  });

  test('quote refuses shops that are not active', async () => {
    mock.method(db, 'query', async (sql) => (
      sql.startsWith('SELECT status FROM users') ? { rows: [{ status: 'ACTIVE' }] } : { rows: [] }
    ));
    mock.method(db.pool, 'connect', async () => ({
      query: async (sql) => (sql.includes('FROM shops') ? { rows: [{ shop_id: SHOP_ID, status: 'SUSPENDED' }] } : { rows: [] }),
      release() {},
    }));
    const response = await api.request('POST', '/api/v1/payments/quote', {
      token, body: { shop_id: SHOP_ID, gross_amount: 100 },
    });
    assert.equal(response.status, 409);
  });

  test('rejects invalid amounts before opening a transaction', async () => {
    const connect = mock.method(db.pool, 'connect', async () => { throw new Error('must not connect'); });
    mock.method(db, 'query', async (sql) => (
      sql.startsWith('SELECT status FROM users') ? { rows: [{ status: 'ACTIVE' }] } : { rows: [] }
    ));
    const response = await api.request('POST', '/api/v1/payments', {
      token, body: { shop_id: SHOP_ID, request_key: 'invalid', gross_amount: -1 },
    });
    assert.equal(response.status, 400);
    assert.equal(connect.mock.callCount(), 0);
  });
});
