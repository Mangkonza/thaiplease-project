const { test, describe, before, after, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { db, startServer, signToken } = require('./helpers');

const OWNER_ID = '22222222-2222-4222-8222-222222222222';
const SHOP_ID = '33333333-3333-4333-8333-333333333333';
const tokenFor = (role) => signToken({ user_id: OWNER_ID, email: 'o@example.com', role, status: 'ACTIVE' });

let api;
before(async () => { api = await startServer(); });
after(async () => { await api.close(); });
afterEach(() => mock.restoreAll());

describe('POST /shops (C-3)', () => {
  test('new shop is created with PENDING status', async () => {
    let insertSql;
    mock.method(db, 'query', async (sql, params) => {
      if (sql.startsWith('SELECT status FROM users')) return { rows: [{ status: 'ACTIVE' }] };
      insertSql = sql;
      return { rows: [{ shop_id: SHOP_ID, owner_id: params[0], name: params[1], status: 'PENDING' }] };
    });
    const res = await api.request('POST', '/api/v1/shops', { token: tokenFor('MERCHANT'), body: { name: 'ร้านกาแฟ A' } });
    assert.equal(res.status, 201);
    assert.match(insertSql, /'PENDING'/);
    assert.doesNotMatch(insertSql, /'ACTIVE'/);
  });
});

describe('GET /shops/:shopId UUID validation (C-4)', () => {
  for (const role of ['MERCHANT', 'ADMIN']) {
    test(`non-UUID shopId returns 400 for ${role} without querying shops`, async () => {
      const query = mock.method(db, 'query', async () => ({ rows: [{ status: 'ACTIVE' }] }));
      const res = await api.request('GET', '/api/v1/shops/not-a-uuid', { token: tokenFor(role) });
      assert.equal(res.status, 400);
      assert.equal(res.body.message, 'Shop ID must be a valid UUID');
      // มีแค่ query เช็คสถานะ user จาก authenticateToken
      assert.equal(query.mock.callCount(), 1);
    });
  }

  test('valid UUID of another owner still returns 403', async () => {
    mock.method(db, 'query', async (sql) => {
      if (sql.startsWith('SELECT status FROM users')) return { rows: [{ status: 'ACTIVE' }] };
      return { rows: [{ owner_id: '99999999-9999-4999-8999-999999999999' }] };
    });
    const res = await api.request('GET', `/api/v1/shops/${SHOP_ID}`, { token: tokenFor('MERCHANT') });
    assert.equal(res.status, 403);
  });
});
