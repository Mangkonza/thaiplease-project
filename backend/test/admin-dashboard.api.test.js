const { test, before, after, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { db, startServer, signToken } = require('./helpers');

const adminToken = signToken({ user_id: '11111111-1111-4111-8111-111111111111', email: 'a@example.com', role: 'ADMIN', status: 'ACTIVE' });
const merchantToken = signToken({ user_id: '22222222-2222-4222-8222-222222222222', email: 'm@example.com', role: 'MERCHANT', status: 'ACTIVE' });
let api;

before(async () => { api = await startServer(); });
after(async () => { await api.close(); });
afterEach(() => mock.restoreAll());

test('admin dashboard combines counts, money, pending work and the daily trend', async () => {
  mock.method(db, 'query', async (sql) => {
    if (sql.startsWith('SELECT status FROM users')) return { rows: [{ status: 'ACTIVE' }] };
    if (sql.includes('GROUP BY status')) return { rows: [{ status: 'ACTIVE', count: 10 }, { status: 'PENDING', count: 1 }] };
    if (sql.includes("role = 'CITIZEN'")) return { rows: [{ total: 81, active: 80 }] };
    if (sql.includes('today_orders')) {
      return { rows: [{ today_orders: '2', today_gross: '300.00', today_subsidy: '180.00', month_orders: '372', month_gross: '37545.00', month_subsidy: '22405.00', month_buyers: '79' }] };
    }
    if (sql.includes('AS cases')) return { rows: [{ shops: 1, cases: 2 }] };
    if (sql.includes('AS paid_out')) return { rows: [{ owed: '22405.00', paid_out: '610.00' }] };
    if (sql.includes('generate_series')) return { rows: [{ day: '2026-10-30', orders: 2, gross: '300.00', subsidy: '180.00' }] };
    if (sql.includes('ORDER BY gross DESC')) return { rows: [{ shop_id: 's1', name: 'ร้าน', category: 'คาเฟ่', orders: 5, gross: '900.00' }] };
    throw new Error(`Unexpected query: ${sql}`);
  });

  const response = await api.request('GET', '/api/v1/admin/dashboard', { token: adminToken });
  assert.equal(response.status, 200);
  const { dashboard } = response.body;
  assert.deepEqual(dashboard.shops, { ACTIVE: 10, PENDING: 1, SUSPENDED: 0, CLOSED: 0 });
  assert.deepEqual(dashboard.month, { orders: 372, gross: 37545, subsidy: 22405, buyers: 79 });
  assert.deepEqual(dashboard.payouts, { owed: 22405, paid_out: 610, outstanding: 21795 });
  assert.deepEqual(dashboard.pending, { shops: 1, cases: 2 });
  assert.equal(dashboard.trend[0].gross, 300);
  assert.equal(dashboard.top_shops[0].gross, 900);
});

test('only admins can open the dashboard', async () => {
  mock.method(db, 'query', async (sql) => (sql.startsWith('SELECT status FROM users') ? { rows: [{ status: 'ACTIVE' }] } : { rows: [] }));
  const response = await api.request('GET', '/api/v1/admin/dashboard', { token: merchantToken });
  assert.equal(response.status, 403);
});
