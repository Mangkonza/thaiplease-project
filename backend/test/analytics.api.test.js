const { test, describe, before, after, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { db, startServer, signToken } = require('./helpers');
const { deriveMetrics, percentChanges } = require('../src/modules/analytics/analytics.service');

const OWNER_ID = '22222222-2222-4222-8222-222222222222';
const SHOP_ID = '33333333-3333-4333-8333-333333333333';
const tokenFor = (role) => signToken({ user_id: OWNER_ID, email: 'o@example.com', role, status: 'ACTIVE' });

let api;
before(async () => { api = await startServer(); });
after(async () => { await api.close(); });
afterEach(() => mock.restoreAll());

// จำลองฐานข้อมูล: owner ถูกต้อง, ร้านมีอยู่, metrics ตาม rowsByStart, และเก็บ upsert ที่ถูกเรียก
function mockDatabase({ owner = OWNER_ID, shopExists = true, rowsByStart = {} } = {}) {
  const upserts = [];
  const query = mock.method(db, 'query', async (sql, params) => {
    if (sql.startsWith('SELECT status FROM users')) return { rows: [{ status: 'ACTIVE' }] };
    if (sql.startsWith('SELECT owner_id FROM shops')) return { rows: [{ owner_id: owner }] };
    if (sql.startsWith('SELECT 1 FROM shops')) return { rows: shopExists ? [{ '?column?': 1 }] : [] };
    if (sql.includes('WITH bounds')) {
      return { rows: [rowsByStart[params[1]] || { revenue: '0', orders: 0, unique_buyers: 0, new_customers: 0, repeat_customers: 0 }] };
    }
    if (sql.includes('INSERT INTO shop_metrics')) {
      upserts.push(params);
      return { rows: [{ metric_id: '44444444-4444-4444-8444-444444444444', created_at: '2026-10-22T10:00:00.000Z' }] };
    }
    throw new Error(`Unexpected query in test: ${sql.slice(0, 60)}`);
  });
  return { query, upserts };
}

describe('deriveMetrics', () => {
  test('computes AOV, frequency and repeat rate from the query row', () => {
    const metrics = deriveMetrics({ revenue: '1925.00', orders: 12, unique_buyers: 10, new_customers: 1, repeat_customers: 9 });
    assert.deepEqual(metrics, {
      revenue: 1925, orders: 12, unique_buyers: 10, new_customers: 1, repeat_customers: 9,
      aov: 160.42, purchase_frequency: 1.2, repeat_rate: 0.9,
    });
  });

  test('AOV and rates are null, not 0, when there are no orders (SRS 2.7)', () => {
    const metrics = deriveMetrics({ revenue: '0', orders: 0, unique_buyers: 0, new_customers: 0, repeat_customers: 0 });
    assert.equal(metrics.aov, null);
    assert.equal(metrics.purchase_frequency, null);
    assert.equal(metrics.repeat_rate, null);
  });

  test('percentChanges is null when the previous value is 0 or missing', () => {
    assert.deepEqual(percentChanges({ revenue: 1925, orders: 3, aov: null }, { revenue: 2780, orders: 0, aov: 154.44 }), { revenue: -30.76, orders: null, aov: null });
  });
});

describe('GET /shops/:shopId/metrics', () => {
  test('returns metrics for the requested week and saves them to shop_metrics', async () => {
    const { upserts } = mockDatabase({ rowsByStart: { '2026-10-12': { revenue: '1925.00', orders: 12, unique_buyers: 10, new_customers: 1, repeat_customers: 9 } } });
    const res = await api.request('GET', `/api/v1/shops/${SHOP_ID}/metrics?period=week&date=2026-10-15`, { token: tokenFor('MERCHANT') });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.period, { type: 'WEEK', start: '2026-10-12', end: '2026-10-18' });
    assert.equal(res.body.metrics.new_customers, 1);
    assert.equal(upserts.length, 1);
    assert.deepEqual(upserts[0].slice(0, 6), [SHOP_ID, 'WEEK', '2026-10-12', '2026-10-18', 1925, 12]);
  });

  test('passes an exclusive end date (end + 1 day) to the SQL', async () => {
    const { query } = mockDatabase();
    await api.request('GET', `/api/v1/shops/${SHOP_ID}/metrics?period=month&date=2026-09-10`, { token: tokenFor('MERCHANT') });
    const metricsCall = query.mock.calls.find((call) => call.arguments[0].includes('WITH bounds'));
    assert.deepEqual(metricsCall.arguments[1], [SHOP_ID, '2026-09-01', '2026-10-01']);
  });

  test('invalid period or date returns 400 without querying metrics', async () => {
    const { query } = mockDatabase();
    for (const qs of ['period=year', 'date=2026-13-01']) {
      const res = await api.request('GET', `/api/v1/shops/${SHOP_ID}/metrics?${qs}`, { token: tokenFor('MERCHANT') });
      assert.equal(res.status, 400, qs);
    }
    assert.ok(query.mock.calls.every((call) => !call.arguments[0].includes('WITH bounds')));
  });

  test('merchant cannot read another owner\'s shop (AT-03)', async () => {
    mockDatabase({ owner: '99999999-9999-4999-8999-999999999999' });
    const res = await api.request('GET', `/api/v1/shops/${SHOP_ID}/metrics`, { token: tokenFor('MERCHANT') });
    assert.equal(res.status, 403);
  });

  test('citizen is rejected by role', async () => {
    mockDatabase();
    const res = await api.request('GET', `/api/v1/shops/${SHOP_ID}/metrics`, { token: tokenFor('CITIZEN') });
    assert.equal(res.status, 403);
  });

  test('admin asking for a shop that does not exist gets 404, not 500', async () => {
    const { upserts } = mockDatabase({ shopExists: false });
    const res = await api.request('GET', `/api/v1/shops/${SHOP_ID}/metrics`, { token: tokenFor('ADMIN') });
    assert.equal(res.status, 404);
    assert.equal(upserts.length, 0);
  });
});

describe('GET /shops/:shopId/dashboard', () => {
  test('compares the selected week with the previous week', async () => {
    mockDatabase({
      rowsByStart: {
        '2026-10-12': { revenue: '1925.00', orders: 12, unique_buyers: 10, new_customers: 1, repeat_customers: 9 },
        '2026-10-05': { revenue: '2780.00', orders: 18, unique_buyers: 15, new_customers: 4, repeat_customers: 11 },
      },
    });
    const res = await api.request('GET', `/api/v1/shops/${SHOP_ID}/dashboard?period=week&date=2026-10-18`, { token: tokenFor('MERCHANT') });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.comparison.period, { type: 'WEEK', start: '2026-10-05', end: '2026-10-11' });
    assert.equal(res.body.comparison.metrics.new_customers, 4);
    assert.equal(res.body.change_percent.new_customers, -75);
    assert.equal(res.body.change_percent.revenue, -30.76);
  });
});
