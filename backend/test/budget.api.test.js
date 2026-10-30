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

describe('coin campaigns', () => {
  // Admin คุมแคมเปญแจกเหรียญผ่านแม่แบบ (เปิด/ปิดและช่วงค่า) จึงไม่ต้องอนุมัติทีละแคมเปญ
  test('a coin campaign activates without a separate approval', async () => {
    mockPool();
    mockClient((sql) => {
      if (sql.includes('SELECT shop_id, status FROM shops')) return [{ shop_id: SHOP_ID, status: 'ACTIVE' }];
      if (sql.includes('SELECT * FROM campaigns WHERE')) return [{ campaign_id: CAMPAIGN_ID, status: 'DRAFT', template_id: 3, treatment_ratio: '0.5' }];
      if (sql.includes("UPDATE campaigns SET status = 'ACTIVE'")) return [{ campaign_id: CAMPAIGN_ID, status: 'ACTIVE' }];
      return undefined;
    });
    const response = await api.request('POST', `/api/v1/campaigns/${CAMPAIGN_ID}/activate`, { token: merchantToken });
    assert.equal(response.status, 200, JSON.stringify(response.body));
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

describe('project budget and shop detail', () => {
  const { validatePolicyInput } = require('../src/modules/policies/policy.service');

  test('remaining budget = total − (co-pay + coupons used), active coupons are a commitment', async () => {
    mockPool((sql) => {
      if (sql.includes('FROM project_policies')) return [{ policy_version: 3, copay_percent: '60.00', total_budget: '500000.00' }];
      if (sql.includes('FROM payments') && sql.includes('refunded_payments')) return [{ government_subsidy: '22405.00', coupon_discount: '95.00' }];
      if (sql.includes('FROM coupons')) return [{ active_value: '600.00' }];
      return undefined;
    });
    const response = await api.request('GET', '/api/v1/admin/budget', { token: adminToken });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.budget, { total: 500000, spent: 22500, remaining: 477500, committed: 600, available: 476900, used_percent: 4.5 });
  });

  test('no total budget set means no budget block', async () => {
    mockPool((sql) => {
      if (sql.includes('FROM project_policies')) return [{ policy_version: 1, copay_percent: '60.00', total_budget: null }];
      if (sql.includes('refunded_payments')) return [{ government_subsidy: '0', coupon_discount: '0' }];
      if (sql.includes('FROM coupons')) return [{ active_value: '0' }];
      return undefined;
    });
    const response = await api.request('GET', '/api/v1/admin/budget', { token: adminToken });
    assert.equal(response.status, 200);
    assert.equal(response.body.budget, null);
  });

  test('total_budget is optional but must be positive', () => {
    const base = { copay_percent: 60, daily_cap: 200, monthly_cap: 1000, baht_per_coin: 25, coupon_coin_cost: 100, coupon_value: 20,
      coupon_min_spend: 100, coupon_valid_days: 30, program_start: '2026-10-01', program_end: '2027-03-31' };
    assert.deepEqual(validatePolicyInput(base), []);
    assert.deepEqual(validatePolicyInput({ ...base, total_budget: 500000 }), []);
    assert.match(validatePolicyInput({ ...base, total_budget: 0 }).join(), /total_budget/);
  });

  test('shop detail returns the shop, sales, balance and recent payments', async () => {
    mockPool((sql) => {
      if (sql.includes('owner_status')) return [{ shop_id: SHOP_ID, name: 'ร้านทดสอบ', owner_email: 'm@example.com' }];
      if (sql.includes('AS orders_30d')) return [{ orders: '12', gross: '1500.00', buyers: '8', orders_30d: '5', gross_30d: '600.00', last_paid_at: '2026-10-25T05:00:00Z' }];
      if (sql.includes('FROM shops s')) return [BALANCE_ROW];
      if (sql.includes('FROM payments p JOIN users')) return [{ payment_id: 'p1', gross_amount: '100.00', government_subsidy: '60.00', coupon_discount: '0', citizen_paid: '40.00' }];
      return undefined;
    });
    const response = await api.request('GET', `/api/v1/admin/shops/${SHOP_ID}`, { token: adminToken });
    assert.equal(response.status, 200);
    assert.equal(response.body.shop.name, 'ร้านทดสอบ');
    assert.deepEqual([response.body.sales.orders, response.body.sales.gross, response.body.sales.buyers], [12, 1500, 8]);
    assert.equal(response.body.sales.last_paid_at, '2026-10-25T05:00:00Z');
    assert.equal(response.body.balance.pending, 80);
    assert.equal(response.body.recent_payments[0].government_subsidy, 60);
  });

  test('shop detail returns 404 for an unknown shop and 403 for merchants', async () => {
    mockPool(() => []);
    assert.equal((await api.request('GET', `/api/v1/admin/shops/${SHOP_ID}`, { token: adminToken })).status, 404);
    assert.equal((await api.request('GET', `/api/v1/admin/shops/${SHOP_ID}`, { token: merchantToken })).status, 403);
  });
});
