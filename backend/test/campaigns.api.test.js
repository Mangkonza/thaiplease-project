const { test, describe, before, after, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { db, startServer, signToken } = require('./helpers');

const OWNER_ID = '22222222-2222-4222-8222-222222222222';
const SHOP_ID = '33333333-3333-4333-8333-333333333333';
const CAMPAIGN_ID = '55555555-5555-4555-8555-555555555555';
const CITIZENS = [
  '66666666-6666-4666-8666-666666666666',
  '77777777-7777-4777-8777-777777777777',
];
const token = signToken({ user_id: OWNER_ID, email: 'merchant@example.com', role: 'MERCHANT', status: 'ACTIVE' });
let api;

before(async () => { api = await startServer(); });
after(async () => { await api.close(); });
afterEach(() => mock.restoreAll());

describe('POST /campaigns/:campaignId/end', () => {
  test('ending early moves end_at to now so the campaign can be evaluated right away (D-06)', async () => {
    let updateSql;
    mock.method(db, 'query', async (sql) => {
      if (sql.startsWith('SELECT status FROM users')) return { rows: [{ status: 'ACTIVE' }] };
      if (sql.includes('FROM campaigns c JOIN shops')) return { rows: [{ shop_id: SHOP_ID, owner_id: OWNER_ID }] };
      throw new Error(`Unexpected pool query: ${sql}`);
    });
    mock.method(db.pool, 'connect', async () => ({
      query: async (sql) => {
        if (sql.includes("SET status = 'ENDED'")) {
          updateSql = sql;
          return { rows: [{ campaign_id: CAMPAIGN_ID, status: 'ENDED' }] };
        }
        return { rows: [] };
      },
      release() {},
    }));

    const response = await api.request('POST', `/api/v1/campaigns/${CAMPAIGN_ID}/end`, { token });

    assert.equal(response.status, 200);
    assert.match(updateSql, /end_at = GREATEST\(start_at, LEAST\(end_at, NOW\(\)\)\)/);
  });
});

describe('POST /campaigns/:campaignId/activate', () => {
  test('assigns each active citizen deterministically and activates in one transaction', async () => {
    const assignments = [];
    const statements = [];
    mock.method(db, 'query', async (sql) => {
      if (sql.startsWith('SELECT status FROM users')) return { rows: [{ status: 'ACTIVE' }] };
      if (sql.includes('FROM campaigns c JOIN shops')) return { rows: [{ shop_id: SHOP_ID, owner_id: OWNER_ID }] };
      throw new Error(`Unexpected pool query: ${sql}`);
    });
    mock.method(db.pool, 'connect', async () => ({
      query: async (sql, params) => {
        statements.push(sql.trim().split(/\s+/).slice(0, 3).join(' '));
        if (sql.includes('SELECT shop_id, status FROM shops')) return { rows: [{ shop_id: SHOP_ID, status: 'ACTIVE' }] };
        if (sql.includes('SELECT * FROM campaigns WHERE')) return { rows: [{ campaign_id: CAMPAIGN_ID, status: 'DRAFT', treatment_ratio: '0.5' }] };
        if (sql.includes('SELECT campaign_id FROM campaigns')) return { rows: [] };
        if (sql.includes('SELECT user_id FROM users')) return { rows: CITIZENS.map((user_id) => ({ user_id })) };
        if (sql.includes('INSERT INTO campaign_assignments')) {
          assignments.push({ user_id: params[1], group_type: params[2] });
        }
        if (sql.includes("UPDATE campaigns SET status = 'ACTIVE'")) {
          return { rows: [{ campaign_id: CAMPAIGN_ID, status: 'ACTIVE' }] };
        }
        return { rows: [] };
      },
      release() {},
    }));

    const response = await api.request('POST', `/api/v1/campaigns/${CAMPAIGN_ID}/activate`, { token });

    assert.equal(response.status, 200);
    assert.equal(response.body.assigned_users, CITIZENS.length);
    assert.deepEqual(assignments.map(({ user_id, group_type }) => {
      const hash = crypto.createHash('sha256').update(`${user_id}${CAMPAIGN_ID}`).digest();
      return [user_id, hash.readUInt32BE(0) / 0x100000000 < 0.5 ? 'TREATMENT' : 'CONTROL'];
    }), assignments.map(({ user_id, group_type }) => [user_id, group_type]));
    assert.ok(statements.includes('COMMIT'));
    assert.ok(statements.some((item) => item.startsWith('INSERT INTO audit_logs')));
  });
});
