import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changePercent, periodLabel } from './admin-analytics.js';

test('change against the previous period', () => {
  assert.equal(changePercent(150, 100), 50);
  assert.equal(changePercent(50, 100), -50);
  assert.equal(changePercent(0, 0), 0);
  assert.equal(changePercent(10, 0), null);
});

test('labels periods in Thai with the Buddhist year', () => {
  assert.equal(periodLabel('day', '2026-10-12', true), '12 ต.ค.');
  assert.equal(periodLabel('day', '2026-10-12'), '12 ต.ค. 2569');
  assert.equal(periodLabel('month', '2026-10'), 'ตุลาคม 2569');
  assert.equal(periodLabel('month', '2026-10', true), 'ต.ค. 69');
  assert.equal(periodLabel('year', '2026'), '2569');
});
