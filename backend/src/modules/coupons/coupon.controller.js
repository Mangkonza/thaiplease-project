const db = require('../../config/db');
const { getActivePolicy } = require('../policies/policy.service');
const { couponColumns, normalizeCoupon, listCoupons } = require('./coupon.service');

async function getMyCoupons(req, res) {
  try {
    return res.json({ success: true, coupons: await listCoupons(db, req.user.user_id) });
  } catch (error) {
    console.error('Get coupons error:', error);
    return res.status(500).json({ success: false, message: 'Unable to load coupons' });
  }
}

// แลกเหรียญเป็นคูปอง 1 ใบตามนโยบายที่ใช้อยู่ (D-13)
// ล็อกแถว users ก่อนอ่านยอดเหรียญ เพื่อไม่ให้กดแลกพร้อมกันหลายครั้งจนเหรียญติดลบ
async function redeemCoupon(req, res) {
  const userId = req.user.user_id;
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT user_id FROM users WHERE user_id = $1 FOR UPDATE', [userId]);
    const policy = await getActivePolicy(client);
    if (!policy) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'No project policy has been configured' });
    }

    const balanceResult = await client.query(
      'SELECT COALESCE(SUM(amount), 0)::integer AS balance FROM coin_ledger WHERE user_id = $1',
      [userId]
    );
    const balance = balanceResult.rows[0].balance;
    if (balance < policy.coupon_coin_cost) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: `Not enough coins: a coupon costs ${policy.coupon_coin_cost} coins but the balance is ${balance}`,
      });
    }

    const inserted = await client.query(
      `INSERT INTO coupons (user_id, value, min_spend, coin_cost, policy_version, expires_at)
       VALUES ($1, $2, $3, $4, $5, now() + make_interval(days => $6))
       RETURNING ${couponColumns}`,
      [userId, policy.coupon_value, policy.coupon_min_spend, policy.coupon_coin_cost, policy.policy_version, policy.coupon_valid_days]
    );
    await client.query(
      `INSERT INTO coin_ledger (user_id, amount, reason) VALUES ($1, $2, 'COUPON_REDEEM')`,
      [userId, -policy.coupon_coin_cost]
    );
    await client.query('COMMIT');
    return res.status(201).json({
      success: true,
      coupon: normalizeCoupon(inserted.rows[0]),
      balance: balance - policy.coupon_coin_cost,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Redeem coupon error:', error);
    return res.status(500).json({ success: false, message: 'Unable to redeem coupon' });
  } finally {
    client.release();
  }
}

module.exports = { getMyCoupons, redeemCoupon };
