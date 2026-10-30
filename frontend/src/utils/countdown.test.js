import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clockOffset, formatCountdown, secondsLeft } from './countdown.js';

test('counts down using the server clock even when the device clock is wrong', () => {
  const serverNow = Date.parse('2026-10-30T10:00:00Z');
  const deviceNow = serverNow - 90_000; // นาฬิกาเครื่องช้าไป 90 วินาที
  const offset = clockOffset(new Date(serverNow).toISOString(), deviceNow);
  assert.equal(secondsLeft('2026-10-30T10:05:00Z', offset, deviceNow), 300);
  assert.equal(secondsLeft('2026-10-30T10:05:00Z', offset, deviceNow + 299_500), 1);
  assert.equal(secondsLeft('2026-10-30T10:05:00Z', offset, deviceNow + 400_000), 0);
});

test('formats minutes and seconds', () => {
  assert.equal(formatCountdown(300), '5:00');
  assert.equal(formatCountdown(65), '1:05');
  assert.equal(formatCountdown(0), '0:00');
});

test('falls back to the device clock when the server time is missing', () => {
  assert.equal(clockOffset(undefined, 1000), 0);
});
