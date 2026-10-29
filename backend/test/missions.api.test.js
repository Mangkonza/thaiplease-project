const { test, describe, before, after, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { db, startServer, signToken, TEST_PIN, paymentAccountRows } = require('./helpers');
const { enrollmentStatus, validateMissionInput } = require('../src/modules/missions/mission.service');

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const CITIZEN_ID = '22222222-2222-4222-8222-222222222222';
const SHOP_ID = '33333333-3333-4333-8333-333333333333';
const PAYMENT_ID = '44444444-4444-4444-8444-444444444444';
const MISSION_ID = '99999999-9999-4999-8999-999999999999';
const ENROLLMENT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const citizenToken = signToken({ user_id: CITIZEN_ID, email: 'c@example.com', role: 'CITIZEN', status: 'ACTIVE' });
const adminToken = signToken({ user_id: ADMIN_ID, email: 'a@example.com', role: 'ADMIN', status: 'ACTIVE' });
const DAY = 24 * 60 * 60 * 1000;

let api;
before(async () => { api = await startServer(); });
after(async () => { await api.close(); });
afterEach(() => mock.restoreAll());

const activeUser = (sql) => (sql.startsWith('SELECT status FROM users') ? { rows: [{ status: 'ACTIVE' }] } : null);

describe('mission rules', () => {
  test('enrollment status is derived from the deadline', () => {
    const now = new Date('2026-10-28T00:00:00Z');
    assert.equal(enrollmentStatus({ status: 'IN_PROGRESS', deadline_at: '2026-10-29T00:00:00Z' }, now), 'IN_PROGRESS');
    assert.equal(enrollmentStatus({ status: 'IN_PROGRESS', deadline_at: '2026-10-27T00:00:00Z' }, now), 'EXPIRED');
    assert.equal(enrollmentStatus({ status: 'COMPLETED', deadline_at: '2026-10-27T00:00:00Z' }, now), 'COMPLETED');
  });

  test('validates admin input', () => {
    assert.deepEqual(validateMissionInput({ title: 'ลองร้านใหม่', target_count: 2, window_days: 30, reward_coins: 50 }), []);
    const errors = validateMissionInput({ title: ' ', target_count: 0, window_days: 1.5, reward_coins: '50' });
    assert.equal(errors.length, 4);
  });
});

describe('completing a mission during payment', () => {
  function mockPayment(progress) {
    mock.method(db, 'query', async (sql) => activeUser(sql) || { rows: [] });
    const statements = [];
    mock.method(db.pool, 'connect', async () => ({
      query: async (sql, params) => {
        const account = paymentAccountRows(sql);
        if (account) return account;
        statements.push({ sql, params });
        if (sql.includes('SELECT shop_id, status FROM shops')) return { rows: [{ shop_id: SHOP_ID, status: 'ACTIVE' }] };
        if (sql.includes('INSERT INTO payments')) return { rows: [{ payment_id: PAYMENT_ID, status: 'SUCCESS' }] };
        if (sql.includes('FROM mission_enrollments e JOIN missions m')) {
          return { rows: [{ enrollment_id: ENROLLMENT_ID, user_id: CITIZEN_ID, accepted_at: new Date(Date.now() - DAY), deadline_at: new Date(Date.now() + DAY), target_count: 2, reward_coins: 50, title: 'ลองร้านใหม่' }] };
        }
        if (sql.includes('COUNT(DISTINCT p.shop_id)')) return { rows: [{ progress }] };
        return { rows: [] };
      },
      release() {},
    }));
    return statements;
  }

  test('rewards coins tied to the payment when the target is reached', async () => {
    const statements = mockPayment(2);
    const response = await api.request('POST', '/api/v1/payments', {
      token: citizenToken, body: { shop_id: SHOP_ID, pin: TEST_PIN, request_key: 'mission-pay-1', gross_amount: 100 },
    });
    assert.equal(response.status, 201);
    assert.equal(response.body.coins_earned, 4 + 50);
    assert.equal(response.body.missions_completed[0].reward_coins, 50);
    const reward = statements.find((s) => s.sql.includes("'MISSION_REWARD'"));
    assert.deepEqual(reward.params, [CITIZEN_ID, PAYMENT_ID, 50]);
    const update = statements.find((s) => s.sql.includes("SET status = 'COMPLETED'"));
    assert.equal(update.params[2], PAYMENT_ID);
  });

  test('gives nothing before the target is reached', async () => {
    const statements = mockPayment(1);
    const response = await api.request('POST', '/api/v1/payments', {
      token: citizenToken, body: { shop_id: SHOP_ID, pin: TEST_PIN, request_key: 'mission-pay-2', gross_amount: 100 },
    });
    assert.equal(response.status, 201);
    assert.equal(response.body.coins_earned, 4);
    assert.ok(!statements.some((s) => s.sql.includes("'MISSION_REWARD'")));
  });
});

describe('accepting missions', () => {
  function mockMissions({ status = 'ACTIVE', inserted = true } = {}) {
    let insertParams;
    mock.method(db, 'query', async (sql, params) => {
      const user = activeUser(sql);
      if (user) return user;
      if (sql.includes('FROM missions WHERE mission_id')) return { rows: [{ mission_id: MISSION_ID, status, window_days: 30 }] };
      if (sql.includes('INSERT INTO mission_enrollments')) {
        insertParams = params;
        return { rows: inserted ? [{ enrollment_id: ENROLLMENT_ID }] : [] };
      }
      return { rows: [] };
    });
    return () => insertParams;
  }

  test('a citizen accepts an active mission with a deadline from the mission window', async () => {
    const params = mockMissions();
    const response = await api.request('POST', `/api/v1/users/me/missions/${MISSION_ID}/accept`, { token: citizenToken });
    assert.equal(response.status, 201);
    assert.deepEqual(params(), [MISSION_ID, CITIZEN_ID, 30]);
  });

  test('refuses a closed mission and a second acceptance', async () => {
    mockMissions({ status: 'CLOSED' });
    const closed = await api.request('POST', `/api/v1/users/me/missions/${MISSION_ID}/accept`, { token: citizenToken });
    assert.equal(closed.status, 409);
    mock.restoreAll();
    mockMissions({ inserted: false });
    const again = await api.request('POST', `/api/v1/users/me/missions/${MISSION_ID}/accept`, { token: citizenToken });
    assert.equal(again.status, 409);
    assert.match(again.body.message, /already accepted/);
  });
});

describe('admin missions', () => {
  function mockAdmin(handler) {
    mock.method(db, 'query', async (sql) => activeUser(sql) || { rows: [] });
    const statements = [];
    mock.method(db.pool, 'connect', async () => ({
      query: async (sql, params) => {
        const account = paymentAccountRows(sql);
        if (account) return account;
        statements.push({ sql, params });
        return { rows: handler(sql) || [] };
      },
      release() {},
    }));
    return statements;
  }

  test('creates a mission and writes an audit log', async () => {
    const statements = mockAdmin((sql) => (sql.includes('INSERT INTO missions') ? [{ mission_id: MISSION_ID, title: 'ลองร้านใหม่ 3 ร้าน', target_count: 3, window_days: 14, reward_coins: 80 }] : undefined));
    const response = await api.request('POST', '/api/v1/admin/missions', {
      token: adminToken, body: { title: ' ลองร้านใหม่ 3 ร้าน ', target_count: 3, window_days: 14, reward_coins: 80 },
    });
    assert.equal(response.status, 201);
    const insert = statements.find((s) => s.sql.includes('INSERT INTO missions'));
    assert.deepEqual(insert.params, ['ลองร้านใหม่ 3 ร้าน', null, 3, 14, 80, ADMIN_ID]);
    assert.equal(statements.find((s) => s.sql.includes('audit_logs')).params[1], 'MISSION_CREATED');
  });

  test('rejects invalid input and citizens', async () => {
    mockAdmin(() => undefined);
    const invalid = await api.request('POST', '/api/v1/admin/missions', { token: adminToken, body: { title: 'x', target_count: 0 } });
    assert.equal(invalid.status, 400);
    const forbidden = await api.request('POST', '/api/v1/admin/missions', { token: citizenToken, body: {} });
    assert.equal(forbidden.status, 403);
  });

  test('closing an already closed mission returns 409', async () => {
    mockAdmin((sql) => (sql.includes('SELECT mission_id FROM missions') ? [{ mission_id: MISSION_ID }] : undefined));
    const response = await api.request('POST', `/api/v1/admin/missions/${MISSION_ID}/close`, { token: adminToken });
    assert.equal(response.status, 409);
  });
});
