const { test, describe, before, after, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { db, startServer, signToken } = require('./helpers');
const { periodKey, periodStart } = require('../src/modules/admin/admin-analytics');

const ADMIN_ID = '99999999-9999-4999-8999-999999999999';
const adminToken = signToken({ user_id: ADMIN_ID, email: 'admin@example.com', role: 'ADMIN', status: 'ACTIVE' });
const citizenToken = signToken({ user_id: ADMIN_ID, email: 'c@example.com', role: 'CITIZEN', status: 'ACTIVE' });
let api;

before(async () => { api = await startServer(); });
after(async () => { await api.close(); });
afterEach(() => mock.restoreAll());

const day = (offset) => new Date(Date.UTC(2026, 9, 1 + offset)).toISOString().slice(0, 10);

function mockAnalyticsDb() {
  const calls = [];
  mock.method(db, 'query', async (sql, params) => {
    if (sql.startsWith('SELECT status FROM users')) return { rows: [{ status: 'ACTIVE' }] };
    calls.push({ sql, params });
    if (sql.includes('WITH buckets')) {
      // 60 วัน: 30 วันแรกคือช่วงก่อนหน้า ยอดขายวันละ (ลำดับวัน) บาท
      return { rows: Array.from({ length: 60 }, (_, i) => ({
        bucket_start: day(i - 30), orders: 1, rights_uses: i >= 30 ? 1 : 0, active_users: 1,
        gross: String(i), subsidy: '0', new_participants: 1, total_participants: i + 1, new_shops: 0,
      })) };
    }
    if (sql.includes('AS new_participants,') && sql.includes('AS new_shops')) return { rows: [{ new_participants: 2, new_shops: 1 }] };
    if (sql.includes('current_users')) return { rows: [{ current_users: 25, previous_users: 4 }] };
    if (sql.includes('GROUP BY 1 ORDER BY gross DESC')) return { rows: [{ label: 'คาเฟ่', shops: 2, orders: 3, rights_uses: 3, active_users: 3, gross: '300', subsidy: '180' }] };
    return { rows: [] };
  });
  return calls;
}

describe('GET /admin/analytics', () => {
  test('returns the current period with the previous period aligned for comparison', async () => {
    const calls = mockAnalyticsDb();
    const response = await api.request('GET', '/api/v1/admin/analytics?granularity=day', { token: adminToken });
    assert.equal(response.status, 200);
    const { series, totals, by_category: byCategory } = response.body.analytics;
    assert.equal(series.length, 30);
    assert.equal(series[0].gross, 30);
    assert.equal(series[0].previous.gross, 0);
    assert.equal(series[0].previous.period, day(-30));
    assert.equal(totals.current.rights_uses, 30);
    assert.equal(totals.previous.rights_uses, 0);
    // ผู้ใช้สิทธิ์ไม่ซ้ำคนต้องนับใหม่ ไม่ใช่เอาผลรวมรายวัน (30) มาบวกกัน
    assert.equal(totals.current.active_users, 25);
    assert.equal(totals.current.total_participants, 60);
    assert.equal(byCategory[0].subsidy, 180);
    assert.deepEqual(calls[0].params, ['day', 30, '1 day']);
  });

  test('rejects an unknown granularity and non-admin users', async () => {
    mockAnalyticsDb();
    assert.equal((await api.request('GET', '/api/v1/admin/analytics?granularity=week', { token: adminToken })).status, 400);
    assert.equal((await api.request('GET', '/api/v1/admin/analytics', { token: citizenToken })).status, 403);
  });
});

describe('GET /admin/analytics/detail', () => {
  test('requires a period that matches the granularity', async () => {
    const calls = mockAnalyticsDb();
    for (const query of ['granularity=day&period=2026-10', 'granularity=month&period=2026-10-01', 'granularity=year&period=26', 'granularity=day&period=2026-13-45']) {
      const response = await api.request('GET', `/api/v1/admin/analytics/detail?${query}`, { token: adminToken });
      assert.equal(response.status, 400, query);
    }
    assert.equal(calls.length, 0);
  });

  test('breaks a month down by day and lists its shops', async () => {
    const calls = mockAnalyticsDb();
    const response = await api.request('GET', '/api/v1/admin/analytics/detail?granularity=month&period=2026-10', { token: adminToken });
    assert.equal(response.status, 200);
    assert.equal(response.body.detail.sub_granularity, 'day');
    const breakdown = calls.find((c) => c.sql.includes('generate_series'));
    assert.deepEqual(breakdown.params, ['2026-10-01', '1 month', 'YYYY-MM-DD', 'day']);
  });

  test('period keys and starts round-trip for every granularity', () => {
    assert.equal(periodKey('day', '2026-10-30'), '2026-10-30');
    assert.equal(periodKey('month', '2026-10-01'), '2026-10');
    assert.equal(periodKey('year', '2026-01-01'), '2026');
    assert.equal(periodStart('month', '2026-10'), '2026-10-01');
    assert.equal(periodStart('year', '2026'), '2026-01-01');
  });
});
