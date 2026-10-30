import { test } from 'node:test';
import assert from 'node:assert/strict';
import { missionCompletedText, missionGoalText, missionProgressText, missionRewardText } from './missions.js';

const shopVisits = { mission_type: 'ORDER_COUNT', target_count: 3, shop_name: 'ร้านกาแฟบ้านสวน', window_days: 21 };

test('describes the goal of each mission type', () => {
  assert.equal(missionGoalText({ mission_type: 'NEW_SHOPS', target_count: 2, window_days: 30 }), 'ลองร้านใหม่ 2 ร้าน ภายใน 30 วันหลังกดรับ');
  assert.equal(missionGoalText(shopVisits), 'ซื้อที่ร้านกาแฟบ้านสวนครบ 3 ครั้ง ภายใน 21 วันหลังกดรับ');
  assert.equal(missionGoalText({ mission_type: 'SPEND_TOTAL', target_amount: 1000, window_days: 30 }), 'ใช้จ่ายรวมครบ 1,000.00 บาท ภายใน 30 วันหลังกดรับ');
});

test('describes coin and shop coupon rewards', () => {
  assert.equal(missionRewardText({ reward_type: 'COINS', reward_coins: 50 }), '50 เหรียญ');
  assert.equal(
    missionRewardText({ reward_type: 'SHOP_COUPON', reward_coupon_value: 30, reward_coupon_min_spend: 100, reward_coupon_days: 30, reward_shop_name: 'ร้านกาแฟบ้านสวน' }),
    'คูปองลด 30.00 บาท ที่ร้านกาแฟบ้านสวน (ขั้นต่ำ 100.00 บาท, 30 วัน)'
  );
  assert.equal(missionCompletedText({ reward_type: 'SHOP_COUPON', title: 'ขาประจำ', coupon_value: 30, shop_name: 'ร้านกาแฟ' }), 'ภารกิจ "ขาประจำ" สำเร็จ ได้คูปองลด 30.00 บาท ใช้ที่ร้านกาแฟ');
});

test('shows progress in the unit of the mission', () => {
  assert.equal(missionProgressText(shopVisits, 2), '2/3 ครั้ง');
  assert.equal(missionProgressText({ mission_type: 'NEW_SHOPS', target_count: 2 }, 1), '1/2 ร้าน');
  assert.equal(missionProgressText({ mission_type: 'SPEND_TOTAL', target_amount: 1000 }, 450.5), '450.50 บาท / 1,000.00 บาท');
});
