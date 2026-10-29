// แคมเปญที่แจกเหรียญ ต้องให้ Admin อนุมัติก่อนเปิด (D-18)
const COIN_TEMPLATES = ['BONUS_COIN', 'COIN_MULTIPLIER', 'FREQUENCY_REWARD'];

// ยอดที่โครงการต้องโอน ยอดที่โอนแล้ว และยอดรอรับ ของทุกร้าน หรือร้านเดียวเมื่อส่ง shopId
// ยอดรอรับติดลบได้ ถ้ามีการคืนเงินหลังโอนไปแล้ว (ร้านต้องคืนให้โครงการ)
async function shopBalances(queryable, shopId = null) {
  const result = await queryable.query(
    `SELECT s.shop_id, s.name, s.status,
       COALESCE(o.owed, 0)::numeric(14,2) AS owed,
       COALESCE(o.subsidy, 0)::numeric(14,2) AS government_subsidy,
       COALESCE(o.coupon, 0)::numeric(14,2) AS coupon_discount,
       COALESCE(o.citizen_paid, 0)::numeric(14,2) AS citizen_paid,
       COALESCE(o.payments, 0)::integer AS payments,
       COALESCE(p.paid_out, 0)::numeric(14,2) AS paid_out,
       (COALESCE(o.owed, 0) - COALESCE(p.paid_out, 0))::numeric(14,2) AS pending,
       p.last_payout_at
     FROM shops s
     LEFT JOIN (
       SELECT shop_id, SUM(government_subsidy + coupon_discount) AS owed, SUM(government_subsidy) AS subsidy,
         SUM(coupon_discount) AS coupon, SUM(citizen_paid) AS citizen_paid, COUNT(*) AS payments
       FROM payments WHERE status = 'SUCCESS' GROUP BY shop_id
     ) o ON o.shop_id = s.shop_id
     LEFT JOIN (
       SELECT shop_id, SUM(amount) AS paid_out, MAX(created_at) AS last_payout_at FROM shop_payouts GROUP BY shop_id
     ) p ON p.shop_id = s.shop_id
     WHERE ($1::uuid IS NULL OR s.shop_id = $1)
     ORDER BY pending DESC, s.name`,
    [shopId]
  );
  return result.rows.map((row) => ({
    ...row,
    owed: Number(row.owed),
    government_subsidy: Number(row.government_subsidy),
    coupon_discount: Number(row.coupon_discount),
    citizen_paid: Number(row.citizen_paid),
    paid_out: Number(row.paid_out),
    pending: Number(row.pending),
  }));
}

module.exports = { COIN_TEMPLATES, shopBalances };
