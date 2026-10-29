const { test, describe, before, after, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { db, startServer, signToken } = require('./helpers');

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const OWNER_ID = '55555555-5555-4555-8555-555555555555';
const SHOP_ID = '33333333-3333-4333-8333-333333333333';
const CAMPAIGN_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const adminToken = signToken({ user_id: ADMIN_ID, email: 'a@example.com', role: 'ADMIN', status: 'ACTIVE' });
const merchantToken = signToken({ user_id: OWNER_ID, email: 'm@example.com', role: 'MERCHANT', status: 'ACTIVE' });

let api;
before(async () => { api = await startServer(); });
after(async () => { await api.close(); });
afterEach(() => mock.restoreAll());

const BALANCE_ROW = {
  shop_id: SHOP_ID, name: 'ร้านทดสอบ', status: 'ACTIVE', owed: '180.00', government_subsidy: '160.00', coupon_discount: '20.00',
  citizen_paid: '220.00', payments: 3, paid_out: '100.00', pending: '80.00', last_payout_at: null,
};

function mockPool(handler = () => undefined) {
  mock.method(db, 'query', async (sql, params) => {
    if (sql.startsWith('SELECT status FROM users')) return { rows: [{ status: 'ACTIVE' }] };
    if (sql.includes('SELECT owner_id FROM shops')) return { rows: [{ owner_id: OWNER_ID }] };
    if (sql.includes('FROM campaigns c JOIN shops')) return { rows: [{ shop_id: SHOP_ID, owner_id: OWNER_ID }] };
    return { rows: handler(sql, params) || [] };
  });
}

function mockClient(handler) {
  const statements = [];
  mock.method(db.pool, 'connect', async () => ({
    query: async (sql, params) => {
      statements.push({ sql, params, verb: sql.trim().split(/\s+/)[0] });
      return { rows: handler(sql, params) || [] };
    },
    release() {},
  }));
  return statements;
}

describe('coin campaign approval (D-18)', () => {
  function activationHandler(approval) {
    return (sql) => {
      if (sql.includes('SELECT shop_id, status FROM shops')) return [{ shop_id: SHOP_ID, status: 'ACTIVE' }];
      if (sql.includes('SELECT * FROM campaigns WHERE')) return [{ campaign_id: CAMPAIGN_ID, status: 'DRAFT', template_id: 3, treatment_ratio: '0.5', coin_approval_status: approval }];
      if (sql.includes('SELECT code FROM promotion_templates')) return [{ code: 'BONUS_COIN' }];
      if (sql.includes("UPDATE campaigns SET status = 'ACTIVE'")) return [{ campaign_id: CAMPAIGN_ID, status: 'ACTIVE' }];
      return undefined;
    };
  }

  test('a coin campaign cannot be activated before approval', async () => {
    mockPool();
    const statements = mockClient(activationHandler(null));
    const response = await api.request('POST', `/api/v1/campaigns/${CAMPAIGN_ID}/activate`, { token: merchantToken });
    assert.equal(response.status, 409);
    assert.match(response.body.message, /admin approval/);
    assert.ok(!statements.some((s) => s.sql.includes("SET status = 'ACTIVE'")));
  });

  test('an approved coin campaign activates', async () => {
    mockPool();
    mockClient(activationHandler('APPROVED'));
    const response = await api.request('POST', `/api/v1/campaigns/${CAMPAIGN_ID}/activate`, { token: merchantToken });
    assert.equal(response.status, 200);
  });

  test('the shop sends a draft for approval only once', async () => {
    let returned = [{ campaign_id: CAMPAIGN_ID, coin_approval_status: 'PENDING' }];
    let params;
    mockPool((sql, values) => {
      if (sql.includes("coin_approval_status = 'PENDING'")) { params = values; return returned; }
      return undefined;
    });
    const first = await api.request('POST', `/api/v1/campaigns/${CAMPAIGN_ID}/request-approval`, { token: merchantToken });
    assert.equal(first.status, 200);
    assert.deepEqual(params[1], ['BONUS_COIN', 'COIN_MULTIPLIER', 'FREQUENCY_REWARD']);
    returned = [];
    const again = await api.request('POST', `/api/v1/campaigns/${CAMPAIGN_ID}/request-approval`, { token: merchantToken });
    assert.equal(again.status, 409);
  });

  test('admin approves with an audit log and must give a note to reject', async () => {
    mockPool();
    const statements = mockClient((sql) => (sql.includes('UPDATE campaigns SET coin_approval_status')
      ? [{ campaign_id: CAMPAIGN_ID, shop_id: SHOP_ID, name: 'โบนัส', coin_approval_status: 'APPROVED' }] : undefined));
    const approved = await api.request('POST', `/api/v1/admin/campaigns/${CAMPAIGN_ID}/approval`, { token: adminToken, body: { decision: 'APPROVE' } });
    assert.equal(approved.status, 200);
    assert.equal(statements.find((s) => s.sql.includes('audit_logs')).params[1], 'COIN_CAMPAIGN_APPROVED');
    const noNote = await api.request('POST', `/api/v1/admin/campaigns/${CAMPAIGN_ID}/approval`, { token: adminToken, body: { decision: 'REJECT' } });
    assert.equal(noNote.status, 400);
  });

  test('deciding a campaign that is not pending returns 409', async () => {
    mockPool();
    mockClient(() => undefined);
    const response = await api.request('POST', `/api/v1/admin/campaigns/${CAMPAIGN_ID}/approval`, { token: adminToken, body: { decision: 'APPROVE' } });
    assert.equal(response.status, 409);
  });
});

describe('program transfers to shops (D-14, D-17)', () => {
  test('admin records a payout of the whole pending amount', async () => {
    mockPool();
    const statements = mockClient((sql) => {
      if (sql.includes('SELECT shop_id FROM shops')) return [{ shop_id: SHOP_ID }];
      if (sql.includes('FROM shops s')) return [BALANCE_ROW];
      if (sql.includes('INSERT INTO shop_payouts')) return [{ payout_id: 'p', amount: '80.00' }];
      return undefined;
    });
    const response = await api.request('POST', `/api/v1/admin/shops/${SHOP_ID}/payouts`, { token: adminToken, body: { note: 'โอนรอบ 1' } });
    assert.equal(response.status, 201);
    const insert = statements.find((s) => s.sql.includes('INSERT INTO shop_payouts'));
    assert.deepEqual(insert.params, [SHOP_ID, 80, 'โอนรอบ 1', ADMIN_ID]);
    assert.equal(statements.at(-1).verb, 'COMMIT');
  });

  test('refuses a payout when nothing is pending', async () => {
    mockPool();
    const statements = mockClient((sql) => {
      if (sql.includes('SELECT shop_id FROM shops')) return [{ shop_id: SHOP_ID }];
      if (sql.includes('FROM shops s')) return [{ ...BALANCE_ROW, pending: '0.00' }];
      return undefined;
    });
    const response = await api.request('POST', `/api/v1/admin/shops/${SHOP_ID}/payouts`, { token: adminToken });
    assert.equal(response.status, 409);
    assert.ok(!statements.some((s) => s.sql.includes('INSERT INTO shop_payouts')));
  });

  test('the shop owner sees what the program still owes', async () => {
    mockPool((sql) => {
      if (sql.includes('FROM shops s')) return [BALANCE_ROW];
      if (sql.includes('FROM shop_payouts')) return [{ payout_id: 'p', amount: '100.00' }];
      return undefined;
    });
    const response = await api.request('GET', `/api/v1/shops/${SHOP_ID}/program-balance`, { token: merchantToken });
    assert.equal(response.status, 200);
    assert.equal(response.body.balance.pending, 80);
    assert.equal(response.body.balance.owed, 180);
    assert.equal(response.body.payouts[0].amount, 100);
  });

  test('budget dashboard adds up coins and transfers', async () => {
    mockPool((sql) => {
      if (sql.includes('FROM project_policies')) return [{ policy_version: 1, copay_percent: '60.00' }];
      if (sql.includes('FROM payments') && sql.includes('refunded_payments')) return [{ payments: '3', government_subsidy: '160.00', coupon_discount: '20.00' }];
      if (sql.includes('FROM coin_ledger')) return [{ reason: 'PAYMENT_REWARD', amount: 300 }, { reason: 'COUPON_REDEEM', amount: -100 }];
      if (sql.includes('FROM coupons')) return [{ issued: '1', issued_value: '20.00' }];
      if (sql.includes('FROM shops s')) return [BALANCE_ROW, { ...BALANCE_ROW, shop_id: 'x', payments: 0, owed: '0', paid_out: '0', pending: '0' }];
      return undefined;
    });
    const response = await api.request('GET', '/api/v1/admin/budget', { token: adminToken });
    assert.equal(response.status, 200);
    assert.equal(response.body.coins.outstanding, 200);
    assert.deepEqual(response.body.transfers, { owed: 180, paid_out: 100, pending: 80 });
    assert.equal(response.body.shops.length, 1);
    assert.equal(response.body.payments.government_subsidy, 160);
  });
});
