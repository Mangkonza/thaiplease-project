import { formatBaht } from './format.js';

export const MISSION_TYPES = [
  { value: 'NEW_SHOPS', label: 'ลองร้านใหม่ครบ N ร้าน' },
  { value: 'ORDER_COUNT', label: 'ซื้อครบ N ครั้ง' },
  { value: 'SPEND_TOTAL', label: 'ใช้จ่ายรวมครบ X บาท' },
];

export const REWARD_TYPES = [
  { value: 'COINS', label: 'เหรียญ' },
  { value: 'SHOP_COUPON', label: 'คูปองส่วนลดเฉพาะร้าน' },
];

const at = (mission) => (mission.shop_name ? `ที่${mission.shop_name}` : '');

// เป้าหมายของภารกิจเป็นประโยคเดียว เช่น "ซื้อที่ร้านกาแฟครบ 3 ครั้ง ภายใน 21 วัน"
export function missionGoalText(mission) {
  const within = ` ภายใน ${mission.window_days} วันหลังกดรับ`;
  if (mission.mission_type === 'SPEND_TOTAL') return `ใช้จ่าย${at(mission)}รวมครบ ${formatBaht(mission.target_amount)}${within}`;
  if (mission.mission_type === 'ORDER_COUNT') return `ซื้อ${at(mission)}ครบ ${mission.target_count} ครั้ง${within}`;
  return `ลองร้านใหม่ ${mission.target_count} ร้าน${within}`;
}

export function missionRewardText(mission) {
  if (mission.reward_type === 'SHOP_COUPON') {
    return `คูปองลด ${formatBaht(mission.reward_coupon_value)} ที่${mission.reward_shop_name || 'ร้านที่กำหนด'} (ขั้นต่ำ ${formatBaht(mission.reward_coupon_min_spend)}, ${mission.reward_coupon_days} วัน)`;
  }
  return `${mission.reward_coins} เหรียญ`;
}

export function missionProgressText(mission, progress) {
  if (mission.mission_type === 'SPEND_TOTAL') return `${formatBaht(progress)} / ${formatBaht(mission.target_amount)}`;
  const unit = mission.mission_type === 'ORDER_COUNT' ? 'ครั้ง' : 'ร้าน';
  return `${progress}/${mission.target_count} ${unit}`;
}

// ข้อความหลังจ่ายเงินเมื่อภารกิจสำเร็จ (จากผล POST /payments)
export function missionCompletedText(reward) {
  return reward.reward_type === 'SHOP_COUPON'
    ? `ภารกิจ "${reward.title}" สำเร็จ ได้คูปองลด ${formatBaht(reward.coupon_value)} ใช้ที่${reward.shop_name}`
    : `ภารกิจ "${reward.title}" สำเร็จ รับ ${reward.reward_coins} เหรียญ`;
}
