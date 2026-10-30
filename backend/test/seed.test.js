const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { buildSeedData, renderSql, summarizeShopWeeks, lastCompletedSunday, ID, CATEGORY, AREA, DAILY_CAP, MONTHLY_CAP, PROGRAM_START } = require('../scripts/generate-seed');

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
    const count = (status) => data.shops.filter((s) => s.status === status).length;
    assert.deepEqual([count('ACTIVE'), count('PENDING'), count('SUSPENDED')], [10, 1, 1]);
  });

  test('every shop uses a category and area offered by the shop search filters', () => {
    for (const shop of data.shops) {
      assert.ok(Object.values(CATEGORY).includes(shop.category), `${shop.name}: ${shop.category}`);
      assert.ok(Object.values(AREA).includes(shop.area), `${shop.name}: ${shop.area}`);
    }
  });

  test('every active shop has sales and customers are spread across shops', () => {
    for (const shop of data.shops.filter((s) => s.status === 'ACTIVE')) {
      assert.ok(data.payments.some((p) => p.shop_id === shop.shop_id && p.status === 'SUCCESS'), shop.name);
    }
    const shopsPerCitizen = new Map();
    for (const p of data.payments) {
      if (!shopsPerCitizen.has(p.user_id)) shopsPerCitizen.set(p.user_id, new Set());
      shopsPerCitizen.get(p.user_id).add(p.shop_id);
    }
    const buyers = [...shopsPerCitizen.values()];
    assert.ok(buyers.length >= 70, `buyers = ${buyers.length}`);
    assert.ok(buyers.filter((shops) => shops.size >= 2).length >= 40, 'most buyers should use more than one shop');
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

  test('co-pay from the program start respects the daily and monthly caps', () => {
    const perDay = new Map();
    const perMonth = new Map();
    let subsidised = 0;
    for (const p of data.payments.filter((x) => x.status === 'SUCCESS')) {
      const day = p.paid_at.slice(0, 10);
      assert.equal(p.citizen_paid + p.government_subsidy, p.net_amount, p.request_key);
      if (day < PROGRAM_START) {
        assert.equal(p.government_subsidy, 0);
        continue;
      }
      if (p.government_subsidy > 0) subsidised += 1;
      perDay.set(`${p.user_id}${day}`, (perDay.get(`${p.user_id}${day}`) || 0) + p.government_subsidy);
      perMonth.set(`${p.user_id}${day.slice(0, 7)}`, (perMonth.get(`${p.user_id}${day.slice(0, 7)}`) || 0) + p.government_subsidy);
    }
    assert.ok(subsidised > 50, `subsidised payments = ${subsidised}`);
    for (const total of perDay.values()) assert.ok(total <= DAILY_CAP + 1e-9);
    for (const total of perMonth.values()) assert.ok(total <= MONTHLY_CAP + 1e-9);
  });
});
