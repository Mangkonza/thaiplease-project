import { test } from 'node:test';
import assert from 'node:assert/strict';
import { walletErrorMessage } from './wallet.js';

test('explains each wallet and PIN error in Thai', () => {
  assert.equal(walletErrorMessage({ code: 'PIN_INCORRECT', attempts_left: 3 }), 'PIN ไม่ถูกต้อง เหลือโอกาสอีก 3 ครั้ง');
  assert.match(walletErrorMessage({ code: 'PIN_LOCKED', locked_until: '2026-10-29T09:15:00Z' }), /ล็อกการจ่ายเงินถึง 16:15 น\./);
  assert.equal(walletErrorMessage({ code: 'PIN_NOT_SET' }), 'กรุณาตั้ง PIN 6 หลักก่อนจ่ายเงิน');
  assert.match(walletErrorMessage({ code: 'INSUFFICIENT_BALANCE', balance: 50, required: 60 }), /มี 50\.00 บาท แต่ต้องจ่าย 60\.00 บาท/);
});

test('falls back to the server message, then to the given text', () => {
  assert.equal(walletErrorMessage({ message: 'Shop not found' }, 'x'), 'Shop not found');
  assert.equal(walletErrorMessage(undefined, 'เชื่อมต่อไม่ได้'), 'เชื่อมต่อไม่ได้');
});
