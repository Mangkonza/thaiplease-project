const { test, describe, before, after, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { db, startServer, signToken } = require('./helpers');

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const SHOP_ID = '33333333-3333-4333-8333-333333333333';
const token = signToken({ user_id: ADMIN_ID, email: 'admin@example.com', role: 'ADMIN', status: 'ACTIVE' });
let api;

before(async () => { api = await startServer(); });
after(async () => { await api.close(); });
afterEach(() => mock.restoreAll());

describe('admin shop approval', () => {
  test('approves a pending shop and records the decision in audit logs', async () => {
    const statements = [];
    mock.method(db, 'query', async (sql) => {
      if (sql.startsWith('SELECT status FROM users')) return { rows: [{ status: 'ACTIVE' }] };
      throw new Error(`Unexpected pool query: ${sql}`);
    });
    mock.method(db.pool, 'connect', async () => ({
      query: async (sql, params) => {
        statements.push({ sql, params });
        if (sql.includes("WHERE shop_id = $1 AND status = 'PENDING'")) {
          return { rows: [{ shop_id: SHOP_ID, status: params[1] }] };
        }
        return { rows: [] };
      },
      release() {},
    }));

    const response = await api.request('PATCH', `/api/v1/admin/shops/${SHOP_ID}/status`, {
      token,
      body: { status: 'ACTIVE' },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.shop.status, 'ACTIVE');
    assert.ok(statements.some(({ sql }) => sql.includes('INSERT INTO audit_logs')));
    assert.ok(statements.some(({ sql }) => sql.includes('COMMIT')));
  });

  test('requires a reason when a shop is rejected', async () => {
    mock.method(db, 'query', async (sql) => (
      sql.startsWith('SELECT status FROM users') ? { rows: [{ status: 'ACTIVE' }] } : { rows: [] }
    ));
    const connect = mock.method(db.pool, 'connect', async () => { throw new Error('must not connect'); });
    const response = await api.request('PATCH', `/api/v1/admin/shops/${SHOP_ID}/status`, {
      token, body: { status: 'SUSPENDED' },
    });
    assert.equal(response.status, 400);
    assert.equal(connect.mock.callCount(), 0);
  });

  test('returns recent audit entries to administrators', async () => {
    const entry = { audit_id: 'log-1', action: 'SHOP_APPROVED', entity_type: 'shop' };
    mock.method(db, 'query', async (sql) => {
      if (sql.startsWith('SELECT status FROM users')) return { rows: [{ status: 'ACTIVE' }] };
      if (sql.includes('FROM audit_logs')) return { rows: [entry] };
      throw new Error(`Unexpected pool query: ${sql}`);
    });
    const response = await api.request('GET', '/api/v1/admin/audit-logs', { token });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.audit_logs, [entry]);
  });
});
