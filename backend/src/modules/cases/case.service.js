const { reopenMissionsForRefund } = require('../missions/mission.service');

// กติกาคืนเงินตาม D-15
const REFUND_WINDOW_DAYS = 7;
const SHOP_DECISION_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

const CASE_TYPES = ['REFUND', 'COMPLAINT'];
const MAX_TEXT = 500;

function isWithinRefundWindow(paidAt, now = new Date()) {
  return now.getTime() - new Date(paidAt).getTime() <= REFUND_WINDOW_DAYS * DAY_MS;
}

// Admin ตัดสินคำขอคืนเงินแทนร้านได้เมื่อร้านไม่ตอบเกิน 3 วัน
function adminCanDecide(caseRow, now = new Date()) {
  if (caseRow.case_type === 'COMPLAINT') return true;
  return now.getTime() - new Date(caseRow.created_at).getTime() > SHOP_DECISION_DAYS * DAY_MS;
}

// คืนข้อความที่ตัดช่องว่างแล้ว หรือ null ถ้าไม่ผ่าน
function readText(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text && text.length <= MAX_TEXT ? text : null;
}

// คืนเงินเต็มจำนวน: รายการเป็น REFUNDED (สิทธิ์รัฐช่วยจ่ายคืนเอง เพราะนับเฉพาะ SUCCESS),
// คูปองกลับมาใช้ได้, หักเหรียญที่ได้จากรายการนี้ (รวมรางวัลภารกิจ ซึ่งภารกิจจะกลับไปทำต่อ)
// ยอดเหรียญติดลบได้ ต้องเรียกใน transaction
async function refundPayment(client, paymentId) {
  const updated = await client.query(
    `UPDATE payments SET status = 'REFUNDED', refunded_at = now()
     WHERE payment_id = $1 AND status = 'SUCCESS' RETURNING payment_id, user_id`,
    [paymentId]
  );
  if (!updated.rows.length) return { error: { status: 409, message: 'Only successful payments can be refunded' } };
  const { user_id: userId } = updated.rows[0];

  const coupons = await client.query(
    `UPDATE coupons SET status = 'ACTIVE', payment_id = NULL, used_at = NULL
     WHERE payment_id = $1 RETURNING coupon_id`,
    [paymentId]
  );
  const earned = await client.query(
    'SELECT COALESCE(SUM(amount), 0)::integer AS coins FROM coin_ledger WHERE payment_id = $1',
    [paymentId]
  );
  const coins = earned.rows[0].coins;
  await reopenMissionsForRefund(client, paymentId);
  if (coins > 0) {
    await client.query(
      `INSERT INTO coin_ledger (user_id, payment_id, amount, reason) VALUES ($1, $2, $3, 'REFUND_REVERSAL')`,
      [userId, paymentId, -coins]
    );
  }
  return { refund: { payment_id: paymentId, coins_reversed: coins, coupons_restored: coupons.rows.map((row) => row.coupon_id) } };
}

module.exports = {
  REFUND_WINDOW_DAYS, SHOP_DECISION_DAYS, CASE_TYPES, isWithinRefundWindow, adminCanDecide, readText, refundPayment,
};
