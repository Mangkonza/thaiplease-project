import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canComplain, canRequestRefund } from './cases.js';

const now = new Date('2026-10-28T12:00:00Z');
const payment = (overrides = {}) => ({ payment_id: 'p1', status: 'SUCCESS', paid_at: '2026-10-25T12:00:00Z', ...overrides });

test('refund is allowed for successful payments within 7 days without an open request', () => {
  assert.equal(canRequestRefund(payment(), [], now), true);
  assert.equal(canRequestRefund(payment({ paid_at: '2026-10-21T11:59:00Z' }), [], now), false);
  assert.equal(canRequestRefund(payment({ status: 'REFUNDED' }), [], now), false);
  assert.equal(canRequestRefund(payment(), [{ payment_id: 'p1', case_type: 'REFUND', status: 'PENDING' }], now), false);
  assert.equal(canRequestRefund(payment(), [{ payment_id: 'p1', case_type: 'REFUND', status: 'REJECTED' }], now), true);
});

test('a complaint is blocked only by another open complaint on the same payment', () => {
  assert.equal(canComplain(payment(), [{ payment_id: 'p1', case_type: 'REFUND', status: 'PENDING' }]), true);
  assert.equal(canComplain(payment(), [{ payment_id: 'p1', case_type: 'COMPLAINT', status: 'PENDING' }]), false);
});
