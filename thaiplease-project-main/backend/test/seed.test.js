const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { buildSeedData, renderSql, summarizeShopWeeks, lastCompletedSunday, ID } = require('../scripts/generate-seed');

const END = '2026-10-18';
const data = buildSeedData({ endDate: END });
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/;

describe('seed generator', () => {
  test('same --end produces identical SQL', () => {
    assert.equal(renderSql(buildSeedData({ endDate: END })), renderSql(data));
  });

  test('--end must be a Sunday', () => {
    assert.throws(() => buildSeedData({ endDate: '2026-10-19' }), /must be a Sunday/);
  });

  test('default end date is the last completed Sunday', () => {
    assert.equal(lastCompletedSunday(new Date(2026, 9, 22)), '2026-10-18'); // Thursday
    assert.equal(lastCompletedSunday(new Date(2026, 9, 18)), '2026-10-11'); // Sunday itself is not complete yet
  });

  test('has shops in every status needed by D-10 and AT-20', () => {
    assert.deepEqual(data.shops.map((s) => s.status).sort(), ['ACTIVE', 'ACTIVE', 'PENDING', 'SUSPENDED']);
  });

  test('shop A story: new customers drop sharply in the latest week', () => {
    const weeks = summarizeShopWeeks(data, ID.shopA);
    const previous = weeks.slice(0, -1).map((w) => w.newCustomers);
    const average = previous.reduce((a, b) => a + b, 0) / previous.length;
    assert.ok(weeks.at(-1).newCustomers <= average / 2, `latest=${weeks.at(-1).newCustomers} average=${average}`);
  });

  test('shop A story: latest week revenue and orders are lower than the week before', () => {
    const weeks = summarizeShopWeeks(data, ID.shopA);
    assert.ok(weeks.at(-1).revenue < weeks.at(-2).revenue, `revenue ${weeks.at(-2).revenue} -> ${weeks.at(-1).revenue}`);
    assert.ok(weeks.at(-1).orders < weeks.at(-2).orders, `orders ${weeks.at(-2).orders} -> ${weeks.at(-1).orders}`);
  });

  test('at least 40 active citizens never bought from shop A (needed for D-05 with NEW_CUSTOMER)', () => {
    const buyers = new Set(data.payments.filter((p) => p.shop_id === ID.shopA).map((p) => p.user_id));
    const neverBought = data.users.filter((u) => u.role === 'CITIZEN' && u.status === 'ACTIVE' && !buyers.has(u.user_id));
    assert.ok(neverBought.length >= 40, `never bought = ${neverBought.length}`);
  });

  test('all ids are valid UUIDs and request keys are unique', () => {
    const ids = [...data.users.map((u) => u.user_id), ...data.shops.map((s) => s.shop_id), ...data.payments.map((p) => p.payment_id), ...data.coinLedger.map((c) => c.ledger_id)];
    ids.forEach((id) => assert.match(id, UUID_PATTERN));
    assert.equal(new Set(data.payments.map((p) => p.request_key)).size, data.payments.length);
  });

  test('refunded payments net to zero coins and failed payments earn none (BR-08)', () => {
    for (const payment of data.payments.filter((p) => p.status !== 'SUCCESS')) {
      const coins = data.coinLedger.filter((c) => c.payment_id === payment.payment_id).reduce((sum, c) => sum + c.amount, 0);
      assert.equal(coins, 0, `${payment.status} ${payment.request_key}`);
    }
  });

  test('all payments fall inside the 8 seeded weeks', () => {
    const first = data.weeks[0].start;
    const last = data.weeks.at(-1).end;
    for (const p of data.payments) {
      const day = (p.paid_at || p.created_at).slice(0, 10);
      assert.ok(day >= first && day <= last, p.request_key);
    }
  });
});
