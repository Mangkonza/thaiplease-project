// คูปองที่หมดอายุยังมี status = 'ACTIVE' ในตาราง จึงคำนวณสถานะที่แสดงจาก expires_at
const couponColumns = `coupon_id, value, min_spend, coin_cost, policy_version, expires_at, used_at, payment_id, created_at,
  CASE WHEN status = 'ACTIVE' AND expires_at <= now() THEN 'EXPIRED' ELSE status END AS status`;

function normalizeCoupon(row) {
  return { ...row, value: Number(row.value), min_spend: Number(row.min_spend) };
}

async function listCoupons(queryable, userId) {
  const result = await queryable.query(
    `SELECT ${couponColumns} FROM coupons WHERE user_id = $1
     ORDER BY (status = 'ACTIVE' AND expires_at > now()) DESC, expires_at ASC LIMIT 100`,
    [userId]
  );
  return result.rows.map(normalizeCoupon);
}

// ตรวจคูปองที่จะใช้จ่าย ต้องเรียกใน transaction หลังล็อกแถว users ของผู้จ่ายแล้ว
// shopReceives = ยอดหลังหักส่วนลดแคมเปญร้าน ใช้เทียบกับยอดขั้นต่ำ
async function lockCouponForCheckout(client, { couponId, userId, shopReceives, paidAt }) {
  const result = await client.query(
    'SELECT coupon_id, user_id, value, min_spend, status, expires_at FROM coupons WHERE coupon_id = $1 FOR UPDATE',
    [couponId]
  );
  const coupon = result.rows[0];
  if (!coupon || coupon.user_id !== userId) return { error: { status: 404, message: 'Coupon not found' } };
  if (coupon.status !== 'ACTIVE') return { error: { status: 409, message: 'Coupon has already been used' } };
  if (new Date(coupon.expires_at) <= paidAt) return { error: { status: 409, message: 'Coupon has expired' } };
  if (Math.round(shopReceives * 100) < Math.round(Number(coupon.min_spend) * 100)) {
    return { error: { status: 409, message: `Purchase must be at least ${Number(coupon.min_spend)} baht after shop discounts to use this coupon` } };
  }
  return { coupon: normalizeCoupon(coupon) };
}

module.exports = { couponColumns, normalizeCoupon, listCoupons, lockCouponForCheckout };
