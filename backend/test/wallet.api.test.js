const { test, describe, before, after, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { db, startServer, signToken, TEST_PIN, TEST_PIN_HASH, paymentAccountRows, paymentRequestFor, paymentRequestRows } = require('./helpers');
const { refundPayment } = require('../src/modules/cases/case.service');

const CITIZEN_ID = '22222222-2222-4222-8222-222222222222';
const SHOP_ID = '33333333-3333-4333-8333-333333333333';
const PAYMENT_ID = '44444444-4444-4444-8444-444444444444';
const token = signToken({ user_id: CITIZEN_ID, email: 'citizen@example.com', role: 'CITIZEN', status: 'ACTIVE' });
let api;

before(async () => { api = await startServer(); });
after(async () => { await api.close(); });
afterEach(() => mock.restoreAll());

const activeUser = (sql) => (sql.startsWith('SELECT status FROM users') ? { rows: [{ status: 'ACTIVE' }] } : null);

// การจ่ายเงินที่ทุกอย่างผ่าน ยกเว้นส่วนที่ test กำหนดผ่าน overrides
function mockPayment(overrides = () => null) {
  mock.method(db, 'query', async (sql) => activeUser(sql) || { rows: [] });
  const statements = [];
  mock.method(db.pool, 'connect', async () => ({
    query: async (sql, params) => {
      statements.push({ sql, params });
      const custom = overrides(sql, params);
      if (custom) return custom;
      const account = paymentAccountRows(sql);
      if (account) return account;
      const payable = paymentRequestRows(sql, params);
      if (payable) return payable;
      if (sql.includes('SELECT shop_id, status FROM shops')) return { rows: [{ shop_id: SHOP_ID, status: 'ACTIVE' }] };
      if (sql.includes('INSERT INTO payments')) return { rows: [{ payment_id: PAYMENT_ID, status: 'SUCCESS' }] };
      return { rows: [] };
    },
    release() {},
  }));
  return statements;
}

const pay = (body = {}) => api.request('POST', '/api/v1/payments', {
  token, body: { payment_request_id: paymentRequestFor(SHOP_ID, 100), request_key: crypto.randomUUID(), pin: TEST_PIN, ...body },
});
const has = (statements, text) => statements.some((s) => s.sql.includes(text));

describe('paying from the wallet with a PIN', () => {
  test('debits only what the citizen pays and returns the new balance', async () => {
    const statements = mockPayment((sql) => (sql.includes('FROM wallet_ledger WHERE user_id') ? { rows: [{ balance: '500.00' }] } : null));
    const response = await pay();
    assert.equal(response.status, 201);
    const debit = statements.find((s) => s.sql.includes('INSERT INTO wallet_ledger'));
    // ไม่มีนโยบายรัฐช่วยจ่ายใน mock จึงจ่ายเต็ม 100
    assert.deepEqual(debit.params, [CITIZEN_ID, PAYMENT_ID, -100]);
    assert.equal(response.body.wallet_balance, 400);
  });

  test('requires a 6-digit PIN before opening a transaction', async () => {
    const connect = mock.method(db.pool, 'connect', async () => { throw new Error('must not connect'); });
    mock.method(db, 'query', async (sql) => activeUser(sql) || { rows: [] });
    for (const pin of [undefined, '12345', '12345a', 123456]) {
      const response = await pay({ pin });
      assert.equal(response.status, 400);
      assert.equal(response.body.code, 'PIN_REQUIRED');
    }
    assert.equal(connect.mock.callCount(), 0);
  });

  test('asks the citizen to set a PIN first', async () => {
    const statements = mockPayment((sql) => (sql.includes('SELECT pin_hash') ? { rows: [{ pin_hash: null, pin_failed_attempts: 0 }] } : null));
    const response = await pay();
    assert.equal(response.status, 409);
    assert.equal(response.body.code, 'PIN_NOT_SET');
    assert.ok(!has(statements, 'INSERT INTO payments'));
  });

  test('a wrong PIN saves nothing but keeps the failed attempt', async () => {
    const statements = mockPayment();
    const response = await pay({ pin: '654321' });
    assert.equal(response.status, 403);
    assert.equal(response.body.code, 'PIN_INCORRECT');
    assert.equal(response.body.attempts_left, 4);
    const counter = statements.find((s) => s.sql.includes('SET pin_failed_attempts = $2'));
    assert.deepEqual(counter.params, [CITIZEN_ID, 1]);
    assert.ok(!has(statements, 'INSERT INTO payments'));
    assert.equal(statements.at(-1).sql, 'COMMIT');
  });

  test('locks the PIN for 15 minutes on the fifth wrong attempt', async () => {
    const statements = mockPayment((sql) => (sql.includes('SELECT pin_hash')
      ? { rows: [{ pin_hash: TEST_PIN_HASH, pin_failed_attempts: 4, pin_locked_until: null }] } : null));
    const before = Date.now();
    const response = await pay({ pin: '000000' });
    assert.equal(response.status, 423);
    assert.equal(response.body.code, 'PIN_LOCKED');
    const lock = statements.find((s) => s.sql.includes('pin_locked_until = $2'));
    const minutes = (lock.params[1].getTime() - before) / 60000;
    assert.ok(minutes > 14.9 && minutes <= 15.1);
  });

  test('a locked PIN is refused even when it is correct', async () => {
    const statements = mockPayment((sql) => (sql.includes('SELECT pin_hash')
      ? { rows: [{ pin_hash: TEST_PIN_HASH, pin_failed_attempts: 0, pin_locked_until: new Date(Date.now() + 60000) }] } : null));
    const response = await pay();
    assert.equal(response.status, 423);
    assert.ok(!has(statements, 'INSERT INTO payments'));
  });

  test('refuses when the wallet cannot cover the citizen share', async () => {
    const statements = mockPayment((sql) => (sql.includes('FROM wallet_ledger WHERE user_id') ? { rows: [{ balance: '99.99' }] } : null));
    const response = await pay();
    assert.equal(response.status, 409);
    assert.equal(response.body.code, 'INSUFFICIENT_BALANCE');
    assert.equal(response.body.required, 100);
    assert.ok(!has(statements, 'INSERT INTO payments'));
    assert.equal(statements.at(-1).sql, 'ROLLBACK');
  });

  test('quote shows the wallet balance', async () => {
    mockPayment((sql) => (sql.includes('FROM wallet_ledger WHERE user_id') ? { rows: [{ balance: '250.50' }] } : null));
    const response = await api.request('POST', '/api/v1/payments/quote', { token, body: { payment_request_id: paymentRequestFor(SHOP_ID, 100) } });
    assert.equal(response.status, 200);
    assert.equal(response.body.quote.wallet_balance, 250.5);
  });
});

describe('wallet top-up and PIN setup', () => {
  test('tops up a valid amount', async () => {
    let insertParams;
    mock.method(db, 'query', async (sql, params) => {
      const user = activeUser(sql);
      if (user) return user;
      if (sql.includes('INSERT INTO wallet_ledger')) { insertParams = params; return { rows: [] }; }
      if (sql.includes('FROM wallet_ledger WHERE user_id')) return { rows: [{ balance: '1500.00' }] };
      return { rows: [] };
    });
    const response = await api.request('POST', '/api/v1/users/me/wallet/topups', { token, body: { amount: 500 } });
    assert.equal(response.status, 201);
    assert.deepEqual(insertParams, [CITIZEN_ID, 500]);
    assert.equal(response.body.balance, 1500);
  });

  test('rejects top-ups outside 0.01–10,000 baht', async () => {
    const query = mock.method(db, 'query', async (sql) => activeUser(sql) || { rows: [] });
    for (const amount of [0, -5, 10000.01, 1.005, 'abc']) {
      const response = await api.request('POST', '/api/v1/users/me/wallet/topups', { token, body: { amount } });
      assert.equal(response.status, 400, `amount ${amount}`);
    }
    assert.ok(!query.mock.calls.some((call) => call.arguments[0].includes('INSERT')));
  });

  function mockPinUser(pinHash) {
    mock.method(db, 'query', async (sql) => activeUser(sql) || { rows: [] });
    const statements = [];
    mock.method(db.pool, 'connect', async () => ({
      query: async (sql, params) => {
        statements.push({ sql, params });
        if (sql.includes('SELECT pin_hash FROM users')) return { rows: [{ pin_hash: pinHash }] };
        if (sql.includes('SELECT pin_hash, pin_failed_attempts')) return { rows: [{ pin_hash: pinHash, pin_failed_attempts: 0 }] };
        return { rows: [] };
      },
      release() {},
    }));
    return statements;
  }

  test('sets the first PIN as a bcrypt hash, never the PIN itself', async () => {
    const statements = mockPinUser(null);
    const response = await api.request('PUT', '/api/v1/users/me/pin', { token, body: { pin: '246810' } });
    assert.equal(response.status, 200);
    const update = statements.find((s) => s.sql.includes('SET pin_hash = $2'));
    assert.match(update.params[1], /^\$2[aby]\$/);
    assert.notEqual(update.params[1], '246810');
  });

  test('changing the PIN needs the current PIN', async () => {
    mockPinUser(TEST_PIN_HASH);
    const missing = await api.request('PUT', '/api/v1/users/me/pin', { token, body: { pin: '246810' } });
    assert.equal(missing.status, 400);
    assert.equal(missing.body.code, 'CURRENT_PIN_REQUIRED');

    const wrong = await api.request('PUT', '/api/v1/users/me/pin', { token, body: { pin: '246810', current_pin: '000000' } });
    assert.equal(wrong.status, 403);

    const ok = await api.request('PUT', '/api/v1/users/me/pin', { token, body: { pin: '246810', current_pin: TEST_PIN } });
    assert.equal(ok.status, 200);
  });

  test('rejects a PIN that is not 6 digits', async () => {
    mock.method(db, 'query', async (sql) => activeUser(sql) || { rows: [] });
    const response = await api.request('PUT', '/api/v1/users/me/pin', { token, body: { pin: '12ab56' } });
    assert.equal(response.status, 400);
  });
});

describe('payment slip', () => {
  test('only the payer can open the slip', async () => {
    let params;
    mock.method(db, 'query', async (sql, values) => {
      const user = activeUser(sql);
      if (user) return user;
      params = values;
      return { rows: [] };
    });
    const response = await api.request('GET', `/api/v1/users/me/payments/${PAYMENT_ID}`, { token });
    assert.equal(response.status, 404);
    assert.deepEqual(params, [PAYMENT_ID, CITIZEN_ID]);
  });

  test('returns the slip of the payer', async () => {
    mock.method(db, 'query', async (sql) => activeUser(sql) || { rows: [{ payment_id: PAYMENT_ID, shop_name: 'ร้านทดสอบ', citizen_paid: '40.00' }] });
    const response = await api.request('GET', `/api/v1/users/me/payments/${PAYMENT_ID}`, { token });
    assert.equal(response.status, 200);
    assert.equal(response.body.slip.shop_name, 'ร้านทดสอบ');
  });

  test('merchants cannot use citizen wallet routes', async () => {
    mock.method(db, 'query', async (sql) => activeUser(sql) || { rows: [] });
    const merchant = signToken({ user_id: CITIZEN_ID, email: 'm@example.com', role: 'MERCHANT', status: 'ACTIVE' });
    const response = await api.request('GET', '/api/v1/users/me/wallet', { token: merchant });
    assert.equal(response.status, 403);
  });
});

describe('refunds return money to the wallet', () => {
  test('credits back exactly the amount that was debited', async () => {
    const statements = [];
    const client = {
      query: async (sql, params) => {
        statements.push({ sql, params });
        if (sql.includes("SET status = 'REFUNDED'")) return { rows: [{ payment_id: PAYMENT_ID, user_id: CITIZEN_ID }] };
        if (sql.includes('INSERT INTO wallet_ledger')) return { rows: [{ amount: '40.00' }] };
        if (sql.includes('FROM coin_ledger')) return { rows: [{ coins: 0 }] };
        return { rows: [] };
      },
    };
    const result = await refundPayment(client, PAYMENT_ID);
    assert.equal(result.refund.wallet_refunded, 40);
    const credit = statements.find((s) => s.sql.includes('INSERT INTO wallet_ledger'));
    assert.match(credit.sql, /-amount, 'REFUND' FROM wallet_ledger\s+WHERE payment_id = \$1 AND reason = 'PAYMENT'/);
  });
});
