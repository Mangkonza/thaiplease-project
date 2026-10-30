const MISSION_TYPES = ['NEW_SHOPS', 'ORDER_COUNT', 'SPEND_TOTAL'];
const REWARD_TYPES = ['COINS', 'SHOP_COUPON'];

// ความคืบหน้าของแต่ละแบบ นับเฉพาะรายการ SUCCESS ในช่วง accepted_at..deadline_at
//   NEW_SHOPS: ร้านที่ไม่เคยซื้อก่อนกดรับภารกิจ, ORDER_COUNT: จำนวนครั้ง, SPEND_TOTAL: ยอดซื้อรวม (บาท)
// $4 = shop_id ที่ภารกิจกำหนด (NULL = ร้านใดก็ได้)
const PROGRESS_SQL = {
  NEW_SHOPS: `SELECT COUNT(DISTINCT p.shop_id)::numeric AS progress
    FROM payments p
    WHERE p.user_id = $1 AND p.status = 'SUCCESS' AND p.paid_at >= $2 AND p.paid_at <= $3
      AND NOT EXISTS (
        SELECT 1 FROM payments q
        WHERE q.user_id = $1 AND q.shop_id = p.shop_id AND q.status = 'SUCCESS' AND q.paid_at < $2)`,
  ORDER_COUNT: `SELECT COUNT(*)::numeric AS progress FROM payments p
    WHERE p.user_id = $1 AND p.status = 'SUCCESS' AND p.paid_at >= $2 AND p.paid_at <= $3
      AND ($4::uuid IS NULL OR p.shop_id = $4)`,
  SPEND_TOTAL: `SELECT COALESCE(SUM(p.gross_amount), 0) AS progress FROM payments p
    WHERE p.user_id = $1 AND p.status = 'SUCCESS' AND p.paid_at >= $2 AND p.paid_at <= $3
      AND ($4::uuid IS NULL OR p.shop_id = $4)`,
};

const missionTarget = (mission) => (mission.mission_type === 'SPEND_TOTAL' ? Number(mission.target_amount) : mission.target_count);

// enrollment ต้องมีข้อมูลภารกิจ (mission_type, shop_id) มาด้วย
async function countProgress(queryable, enrollment) {
  const type = enrollment.mission_type || 'NEW_SHOPS';
  const params = [enrollment.user_id, enrollment.accepted_at, enrollment.deadline_at];
  if (type !== 'NEW_SHOPS') params.push(enrollment.shop_id || null);
  const result = await queryable.query(PROGRESS_SQL[type], params);
  return Number(result.rows[0].progress);
}

function enrollmentStatus(enrollment, now = new Date()) {
  if (enrollment.status === 'COMPLETED') return 'COMPLETED';
  return new Date(enrollment.deadline_at) < now ? 'EXPIRED' : 'IN_PROGRESS';
}

// เรียกใน transaction การจ่ายเงิน หลังบันทึก payment แล้ว (แถว users ของผู้จ่ายถูกล็อกอยู่)
// รางวัลผูกกับ payment_id (เหรียญ) หรือ enrollment_id (คูปอง) เพื่อให้การคืนเงินดึงคืนได้
async function completeMissions(client, { userId, paymentId, paidAt }) {
  const open = await client.query(
    `SELECT e.enrollment_id, e.user_id, e.accepted_at, e.deadline_at, m.mission_type, m.shop_id, m.target_count, m.target_amount,
            m.reward_type, m.reward_coins, m.reward_coupon_value, m.reward_coupon_min_spend, m.reward_coupon_days, m.reward_shop_id,
            m.title, rs.name AS reward_shop_name
     FROM mission_enrollments e JOIN missions m ON m.mission_id = e.mission_id
     LEFT JOIN shops rs ON rs.shop_id = m.reward_shop_id
     WHERE e.user_id = $1 AND e.status = 'IN_PROGRESS' AND e.accepted_at <= $2 AND e.deadline_at >= $2
     FOR UPDATE OF e`,
    [userId, paidAt]
  );
  const completed = [];
  for (const enrollment of open.rows) {
    if (await countProgress(client, enrollment) < missionTarget(enrollment)) continue;
    await client.query(
      `UPDATE mission_enrollments SET status = 'COMPLETED', completed_at = $2, reward_payment_id = $3
       WHERE enrollment_id = $1`,
      [enrollment.enrollment_id, paidAt, paymentId]
    );
    const reward = { enrollment_id: enrollment.enrollment_id, title: enrollment.title, reward_type: enrollment.reward_type || 'COINS', reward_coins: 0 };
    if (enrollment.reward_type === 'SHOP_COUPON') {
      const expiresAt = new Date(new Date(paidAt).getTime() + enrollment.reward_coupon_days * 24 * 60 * 60 * 1000);
      await client.query(
        `INSERT INTO coupons (user_id, value, min_spend, coin_cost, expires_at, shop_id, enrollment_id)
         VALUES ($1, $2, $3, 0, $4, $5, $6)`,
        [userId, enrollment.reward_coupon_value, enrollment.reward_coupon_min_spend, expiresAt, enrollment.reward_shop_id, enrollment.enrollment_id]
      );
      Object.assign(reward, { coupon_value: Number(enrollment.reward_coupon_value), shop_name: enrollment.reward_shop_name });
    } else {
      await client.query(
        `INSERT INTO coin_ledger (user_id, payment_id, amount, reason) VALUES ($1, $2, $3, 'MISSION_REWARD')`,
        [userId, paymentId, enrollment.reward_coins]
      );
      reward.reward_coins = enrollment.reward_coins;
    }
    completed.push(reward);
  }
  return completed;
}

// เรียกตอนคืนเงิน: ภารกิจที่ครบด้วยรายการนี้กลับไปทำต่อ เหรียญถูกหักพร้อมเหรียญอื่นของรายการ
// คูปองรางวัลที่ยังไม่ได้ใช้ถูกยกเลิก (ถ้าใช้ไปแล้วจะไม่ดึงคืน)
async function reopenMissionsForRefund(client, paymentId) {
  await client.query(
    `UPDATE coupons SET status = 'REVOKED'
     WHERE status = 'ACTIVE' AND enrollment_id IN (SELECT enrollment_id FROM mission_enrollments WHERE reward_payment_id = $1)`,
    [paymentId]
  );
  await client.query(
    `UPDATE mission_enrollments SET status = 'IN_PROGRESS', completed_at = NULL, reward_payment_id = NULL
     WHERE reward_payment_id = $1`,
    [paymentId]
  );
}

const isIntegerBetween = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const isMoney = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max &&
  Math.abs(Math.round(value * 100) - value * 100) < 1e-8;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateMissionInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return ['body must be an object'];
  const errors = [];
  const type = input.mission_type ?? 'NEW_SHOPS';
  const rewardType = input.reward_type ?? 'COINS';
  if (typeof input.title !== 'string' || !input.title.trim() || input.title.trim().length > 200) {
    errors.push('title must be text up to 200 characters');
  }
  if (input.description !== undefined && input.description !== null &&
      (typeof input.description !== 'string' || input.description.length > 1000)) {
    errors.push('description must be text up to 1000 characters');
  }
  if (!MISSION_TYPES.includes(type)) errors.push(`mission_type must be one of ${MISSION_TYPES.join(', ')}`);
  if (type === 'SPEND_TOTAL') {
    if (!isMoney(input.target_amount, 1, 1000000)) errors.push('target_amount must be between 1 and 1,000,000 baht');
  } else if (!isIntegerBetween(input.target_count, 1, 50)) {
    errors.push('target_count must be an integer between 1 and 50');
  }
  const shopId = input.shop_id ?? null;
  if (shopId !== null && (typeof shopId !== 'string' || !UUID.test(shopId))) errors.push('shop_id must be a UUID');
  if (type === 'NEW_SHOPS' && shopId !== null) errors.push('NEW_SHOPS missions cannot be limited to one shop');
  if (!isIntegerBetween(input.window_days, 1, 365)) errors.push('window_days must be an integer between 1 and 365');
  if (!REWARD_TYPES.includes(rewardType)) errors.push(`reward_type must be one of ${REWARD_TYPES.join(', ')}`);
  if (rewardType === 'COINS' && !isIntegerBetween(input.reward_coins, 1, 100000)) {
    errors.push('reward_coins must be an integer between 1 and 100000');
  }
  if (rewardType === 'SHOP_COUPON') {
    if (typeof input.reward_shop_id !== 'string' || !UUID.test(input.reward_shop_id)) errors.push('reward_shop_id must be a UUID');
    if (!isMoney(input.reward_coupon_value, 1, 10000)) errors.push('reward_coupon_value must be between 1 and 10,000 baht');
    if (!isMoney(input.reward_coupon_min_spend, 0, 100000) || input.reward_coupon_min_spend < input.reward_coupon_value) {
      errors.push('reward_coupon_min_spend must be at least reward_coupon_value');
    }
    if (!isIntegerBetween(input.reward_coupon_days, 1, 365)) errors.push('reward_coupon_days must be an integer between 1 and 365');
  }
  return errors;
}

module.exports = {
  MISSION_TYPES, REWARD_TYPES, missionTarget, countProgress, enrollmentStatus, completeMissions, reopenMissionsForRefund, validateMissionInput,
};
