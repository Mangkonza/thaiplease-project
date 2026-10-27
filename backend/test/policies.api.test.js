const { test, describe, before, after, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { db, startServer, signToken } = require('./helpers');
const { validatePolicyInput } = require('../src/modules/policies/policy.service');

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const CITIZEN_ID = '22222222-2222-4222-8222-222222222222';
const adminToken = signToken({ user_id: ADMIN_ID, email: 'admin@example.com', role: 'ADMIN', status: 'ACTIVE' });
const citizenToken = signToken({ user_id: CITIZEN_ID, email: 'citizen@example.com', role: 'CITIZEN', status: 'ACTIVE' });

const VALID_INPUT = {
  copay_percent: 50, daily_cap: 150, monthly_cap: 1500, lifetime_cap: 6000, baht_per_coin: 25,
  coupon_coin_cost: 100, coupon_value: 20, coupon_min_spend: 100, coupon_valid_days: 30,
  program_start: '2026-10-01', program_end: '2027-03-31', note: 'ลดสัดส่วนรัฐช่วยจ่าย',
};
const POLICY_ROW = {
  policy_version: 1, copay_percent: '60.00', daily_cap: '200.00', monthly_cap: '2000.00', lifetime_cap: '8000.00',
  baht_per_coin: 25, coupon_coin_cost: 100, coupon_value: '20.00', coupon_min_spend: '100.00', coupon_valid_days: 30,
  program_start: '2026-10-01', program_end: '2027-03-31',
};

let api;
before(async () => { api = await startServer(); });
after(async () => { await api.close(); });
afterEach(() => mock.restoreAll());

const activeUser = (sql) => sql.startsWith('SELECT status FROM users') ? { rows: [{ status: 'ACTIVE' }] } : null;

describe('validatePolicyInput', () => {
  test('accepts a complete policy', () => {
    assert.deepEqual(validatePolicyInput(VALID_INPUT), []);
  });

  test('rejects out-of-range and inconsistent values', () => {
    assert.ok(validatePolicyInput({ ...VALID_INPUT, copay_percent: 120 }).some((e) => e.includes('copay_percent')));
    assert.ok(validatePolicyInput({ ...VALID_INPUT, daily_cap: '200' }).some((e) => e.includes('daily_cap')));
    assert.ok(validatePolicyInput({ ...VALID_INPUT, monthly_cap: 100 }).some((e) => e.includes('monthly_cap must be at least')));
    assert.ok(validatePolicyInput({ ...VALID_INPUT, baht_per_coin: 2.5 }).some((e) => e.includes('baht_per_coin')));
    assert.ok(validatePolicyInput({ ...VALID_INPUT, program_end: '2026-02-30' }).some((e) => e.includes('program_end')));
    assert.ok(validatePolicyInput({ ...VALID_INPUT, program_end: '2026-09-01' }).some((e) => e.includes('before program_start')));
    assert.ok(validatePolicyInput({ ...VALID_INPUT, coupon_min_spend: 10 }).some((e) => e.includes('coupon_min_spend')));
  });
});

describe('POST /admin/policies', () => {
  test('creates a new version and writes an audit log in one transaction', async () => {
    mock.method(db, 'query', async (sql) => activeUser(sql) || { rows: [] });
    const statements = [];
    let auditDetail;
    mock.method(db.pool, 'connect', async () => ({
      query: async (sql, params) => {
        statements.push(sql.trim().split(/\s+/)[0]);
        if (sql.includes('FROM project_policies p ORDER BY')) return { rows: [POLICY_ROW] };
        if (sql.includes('INSERT INTO project_policies')) {
          assert.equal(params[0], 50);
          assert.equal(params[12], ADMIN_ID);
          return { rows: [{ ...POLICY_ROW, policy_version: 2, copay_percent: '50.00' }] };
        }
        if (sql.includes('INSERT INTO audit_logs')) auditDetail = JSON.parse(params[4]);
        return { rows: [] };
      },
      release() {},
    }));

    const response = await api.request('POST', '/api/v1/admin/policies', { token: adminToken, body: VALID_INPUT });
    assert.equal(response.status, 201);
    assert.equal(response.body.policy.policy_version, 2);
    assert.equal(response.body.policy.copay_percent, 50);
    assert.equal(auditDetail.policy_version, 2);
    assert.equal(auditDetail.previous_version, 1);
    assert.equal(statements.at(-1), 'COMMIT');
  });

  test('rejects invalid input without opening a transaction', async () => {
    mock.method(db, 'query', async (sql) => activeUser(sql) || { rows: [] });
    const connect = mock.method(db.pool, 'connect', async () => { throw new Error('must not connect'); });
    const response = await api.request('POST', '/api/v1/admin/policies', {
      token: adminToken, body: { ...VALID_INPUT, lifetime_cap: 10 },
    });
    assert.equal(response.status, 400);
    assert.match(response.body.message, /lifetime_cap/);
    assert.equal(connect.mock.callCount(), 0);
  });

  test('only admins can change the policy', async () => {
    mock.method(db, 'query', async (sql) => activeUser(sql) || { rows: [] });
    const response = await api.request('POST', '/api/v1/admin/policies', { token: citizenToken, body: VALID_INPUT });
    assert.equal(response.status, 403);
  });
});

describe('GET /users/me/subsidy', () => {
  test('returns used and remaining subsidy limited by every cap', async () => {
    mock.method(db, 'query', async (sql, params) => {
      const user = activeUser(sql);
      if (user) return user;
      if (sql.includes('FROM project_policies')) return { rows: [POLICY_ROW] };
      if (sql.includes('SUM(government_subsidy)')) {
        assert.equal(params[0], CITIZEN_ID);
        return { rows: [{ today: '120.00', month: '1950.00', total: '1950.00' }] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    });
    const response = await api.request('GET', '/api/v1/users/me/subsidy', { token: citizenToken });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.used, { today: 120, month: 1950, total: 1950 });
    assert.deepEqual(response.body.remaining, { today: 50, month: 50, total: 6050 });
    assert.equal(response.body.policy.copay_percent, 60);
  });
});
