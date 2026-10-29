const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { calculateCheckout } = require('../src/modules/payments/checkout.calculator');

const POLICY = {
  policy_version: 1, copay_percent: 60, daily_cap: 200, monthly_cap: 2000, lifetime_cap: 8000,
  program_start: '2026-10-01', program_end: '2027-03-31',
};
const NO_USAGE = { today: 0, month: 0, total: 0 };
const PAID_AT = new Date('2026-10-27T05:00:00Z');

describe('calculateCheckout (D-12)', () => {
  test('government pays 60% and the citizen pays the rest', () => {
    const result = calculateCheckout({ grossAmount: 100, policy: POLICY, usage: NO_USAGE, paidAt: PAID_AT });
    assert.equal(result.shop_receives, 100);
    assert.equal(result.government_subsidy, 60);
    assert.equal(result.citizen_paid, 40);
    assert.equal(result.subsidy_status, 'APPLIED');
    assert.equal(result.policy_version, 1);
    assert.deepEqual(result.subsidy_remaining, { today: 140, month: 1940, total: 7940 });
  });

  test('campaign discount comes off first and the shop absorbs it', () => {
    const result = calculateCheckout({ grossAmount: 200, campaignDiscount: 20, policy: POLICY, usage: NO_USAGE, paidAt: PAID_AT });
    assert.equal(result.campaign_discount, 20);
    assert.equal(result.shop_receives, 180);
    assert.equal(result.government_subsidy, 108);
    assert.equal(result.citizen_paid, 72);
  });

  test('coupon comes off before the 60% is applied', () => {
    const result = calculateCheckout({ grossAmount: 150, couponDiscount: 20, policy: POLICY, usage: NO_USAGE, paidAt: PAID_AT });
    assert.equal(result.shop_receives, 150);
    assert.equal(result.coupon_discount, 20);
    assert.equal(result.government_subsidy, 78);
    assert.equal(result.citizen_paid, 52);
  });

  test('daily cap of 200 baht limits the subsidy', () => {
    const result = calculateCheckout({ grossAmount: 1000, policy: POLICY, usage: { today: 50, month: 50, total: 50 }, paidAt: PAID_AT });
    assert.equal(result.government_subsidy, 150);
    assert.equal(result.citizen_paid, 850);
    assert.equal(result.subsidy_status, 'CAP_REACHED');
    assert.equal(result.subsidy_remaining.today, 0);
  });

  test('monthly and lifetime caps apply even when the daily cap has room', () => {
    const monthly = calculateCheckout({ grossAmount: 300, policy: POLICY, usage: { today: 0, month: 1990, total: 1990 }, paidAt: PAID_AT });
    assert.equal(monthly.government_subsidy, 10);
    const lifetime = calculateCheckout({ grossAmount: 300, policy: POLICY, usage: { today: 0, month: 0, total: 8000 }, paidAt: PAID_AT });
    assert.equal(lifetime.government_subsidy, 0);
    assert.equal(lifetime.citizen_paid, 300);
    assert.equal(lifetime.subsidy_status, 'CAP_REACHED');
  });

  test('no subsidy outside the program dates in Bangkok time', () => {
    // 2026-09-30T17:30Z คือ 1 ต.ค. 00:30 เวลาไทย จึงอยู่ในโครงการแล้ว
    const firstDay = calculateCheckout({ grossAmount: 100, policy: POLICY, usage: NO_USAGE, paidAt: new Date('2026-09-30T17:30:00Z') });
    assert.equal(firstDay.government_subsidy, 60);
    const before = calculateCheckout({ grossAmount: 100, policy: POLICY, usage: NO_USAGE, paidAt: new Date('2026-09-30T16:30:00Z') });
    assert.equal(before.government_subsidy, 0);
    assert.equal(before.subsidy_status, 'OUTSIDE_PROGRAM');
  });

  test('rounds to satang without floating point drift', () => {
    const result = calculateCheckout({ grossAmount: 33.35, policy: POLICY, usage: NO_USAGE, paidAt: PAID_AT });
    assert.equal(result.government_subsidy, 20.01);
    assert.equal(result.citizen_paid, 13.34);
    assert.equal(Math.round((result.government_subsidy + result.citizen_paid) * 100), 3335);
  });

  test('without a policy the citizen pays everything after the campaign discount', () => {
    const result = calculateCheckout({ grossAmount: 100, campaignDiscount: 10, policy: null, usage: NO_USAGE, paidAt: PAID_AT });
    assert.equal(result.government_subsidy, 0);
    assert.equal(result.citizen_paid, 90);
    assert.equal(result.subsidy_status, 'NO_POLICY');
    assert.equal(result.policy_version, null);
  });

  test('discounts never exceed the amount due', () => {
    const result = calculateCheckout({ grossAmount: 50, campaignDiscount: 80, couponDiscount: 20, policy: POLICY, usage: NO_USAGE, paidAt: PAID_AT });
    assert.equal(result.campaign_discount, 50);
    assert.equal(result.coupon_discount, 0);
    assert.equal(result.citizen_paid, 0);
  });
});
