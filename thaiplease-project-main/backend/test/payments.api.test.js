const { test, describe, before, after, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { db, startServer, signToken } = require('./helpers');

const CITIZEN_ID = '22222222-2222-4222-8222-222222222222';
const SHOP_ID = '33333333-3333-4333-8333-333333333333';
const PAYMENT_ID = '44444444-4444-4444-8444-444444444444';
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
