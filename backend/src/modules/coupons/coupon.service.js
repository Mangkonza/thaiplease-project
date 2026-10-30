// คูปองที่หมดอายุยังมี status = 'ACTIVE' ในตาราง จึงคำนวณสถานะที่แสดงจาก expires_at
// shop_id = คูปองจากภารกิจที่ใช้ได้เฉพาะร้านนั้น (NULL = ใช้ได้ทุกร้าน)
const couponColumns = `c.coupon_id, c.value, c.min_spend, c.coin_cost, c.policy_version, c.expires_at, c.used_at, c.payment_id, c.created_at,
  c.shop_id, s.name AS shop_name,
  CASE WHEN c.status = 'ACTIVE' AND c.expires_at <= now() THEN 'EXPIRED' ELSE c.status END AS status`;

function normalizeCoupon(row) {
  return { ...row, value: Number(row.value), min_spend: Number(row.min_spend) };
}

async function listCoupons(queryable, userId) {
  const result = await queryable.query(
    `SELECT ${couponColumns} FROM coupons c LEFT JOIN shops s ON s.shop_id = c.shop_id WHERE c.user_id = $1
     ORDER BY (c.status = 'ACTIVE' AND c.expires_at > now()) DESC, c.expires_at ASC LIMIT 100`,
    [userId]
  );
  return result.rows.map(normalizeCoupon);
}

// ตรวจคูปองที่จะใช้จ่าย ต้องเรียกใน transaction หลังล็อกแถว users ของผู้จ่ายแล้ว
// shopReceives = ยอดหลังหักส่วนลดแคมเปญร้าน ใช้เทียบกับยอดขั้นต่ำ
async function lockCouponForCheckout(client, { couponId, userId, shopId, shopReceives, paidAt }) {
  const result = await client.query(
    'SELECT coupon_id, user_id, value, min_spend, status, expires_at, shop_id FROM coupons WHERE coupon_id = $1 FOR UPDATE',
    [couponId]
  );
  const coupon = result.rows[0];
  if (!coupon || coupon.user_id !== userId) return { error: { status: 404, message: 'Coupon not found' } };
  if (coupon.status === 'REVOKED') return { error: { status: 409, message: 'Coupon was cancelled because its mission payment was refunded' } };
  if (coupon.status !== 'ACTIVE') return { error: { status: 409, message: 'Coupon has already been used' } };
  if (coupon.shop_id && coupon.shop_id !== shopId) return { error: { status: 409, message: 'This coupon can only be used at the shop it was issued for' } };
  if (new Date(coupon.expires_at) <= paidAt) return { error: { status: 409, message: 'Coupon has expired' } };
  if (Math.round(shopReceives * 100) < Math.round(Number(coupon.min_spend) * 100)) {
    return { error: { status: 409, message: `Purchase must be at least ${Number(coupon.min_spend)} baht after shop discounts to use this coupon` } };
  }
  return { coupon: normalizeCoupon(coupon) };
}

module.exports = { couponColumns, normalizeCoupon, listCoupons, lockCouponForCheckout };
