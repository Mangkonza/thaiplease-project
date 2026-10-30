const crypto = require('node:crypto');
const db = require('../../config/db');
const { quoteCampaignBenefit, recordRedemption } = require('../campaigns/campaign.service');
const { UUID_PATTERN } = require('../../middlewares/shop.middleware');
const { getActivePolicy, getSubsidyUsage } = require('../policies/policy.service');
const { calculateCheckout } = require('./checkout.calculator');
const { lockCouponForCheckout } = require('../coupons/coupon.service');
const { completeMissions } = require('../missions/mission.service');
const { PIN_PATTERN, getBalance, verifyPin } = require('../wallet/wallet.service');
const { loadPayableRequest } = require('../payment-requests/payment-request.service');

const DEFAULT_BAHT_PER_COIN = 25;

// coupon_id ไม่บังคับ ส่งมาเป็น null หรือไม่ส่งเลย = ไม่ใช้คูปอง
const readCouponId = (value) => (value === undefined || value === null || value === '' ? null : value);
const isValidCouponId = (couponId) => couponId === null || (typeof couponId === 'string' && UUID_PATTERN.test(couponId));

// ตรวจร้านแล้วคิดราคาตาม D-12 ใช้ร่วมกันระหว่างหน้าแสดงยอดก่อนจ่ายและการจ่ายจริง
// ต้องเรียกใน transaction; ล็อกแถว users ของผู้จ่ายไว้ให้รายการของคนเดียวกันคิดเพดานต่อกันทีละรายการ
async function priceCheckout(client, { shopId, userId, grossAmount, couponId, paidAt }) {
  const shop = await client.query(
    'SELECT shop_id, status FROM shops WHERE shop_id = $1 FOR SHARE',
    [shopId]
  );
  if (!shop.rows.length) return { error: { status: 404, message: 'Shop not found' } };
  if (shop.rows[0].status !== 'ACTIVE') return { error: { status: 409, message: 'Shop is not available for payments' } };

  const benefit = await quoteCampaignBenefit(client, { shopId, userId, grossAmount, paidAt });
  await client.query('SELECT user_id FROM users WHERE user_id = $1 FOR UPDATE', [userId]);
  const policy = await getActivePolicy(client);
  const usage = policy ? await getSubsidyUsage(client, userId, paidAt) : { today: 0, month: 0, total: 0 };
  const campaignDiscount = benefit ? benefit.discountAmount : 0;
  let coupon = null;
  if (couponId) {
    const locked = await lockCouponForCheckout(client, { couponId, userId, shopId, shopReceives: grossAmount - campaignDiscount, paidAt });
    if (locked.error) return locked;
    coupon = locked.coupon;
  }
  const breakdown = calculateCheckout({
    grossAmount,
    campaignDiscount,
    couponDiscount: coupon ? coupon.value : 0,
    policy,
    usage,
    paidAt,
  });
  return { benefit, policy, coupon, breakdown };
}

// ยอดเงินและร้านมาจากคำขอรับเงินที่ร้านสร้าง (แบบไทยพลัส) ลูกค้าส่งได้แค่ id ของคำขอ
async function quotePayment(req, res) {
  const requestId = req.body.payment_request_id;
  const couponId = readCouponId(req.body.coupon_id);
  if (!UUID_PATTERN.test(requestId || '')) {
    return res.status(400).json({ success: false, message: 'payment_request_id is required' });
  }
  if (!isValidCouponId(couponId)) return res.status(400).json({ success: false, message: 'coupon_id must be a UUID' });

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const paidAt = new Date();
    const loaded = await loadPayableRequest(client, requestId, { now: paidAt });
    const priced = loaded.error ? loaded : await priceCheckout(client, {
      shopId: loaded.request.shop_id, userId: req.user.user_id, grossAmount: loaded.request.amount, couponId, paidAt,
    });
    const walletBalance = priced.error ? null : await getBalance(client, req.user.user_id);
    await client.query('ROLLBACK');
    if (priced.error) {
      const { status, ...body } = priced.error;
      return res.status(status).json({ success: false, ...body });
    }
    const bahtPerCoin = priced.policy ? priced.policy.baht_per_coin : DEFAULT_BAHT_PER_COIN;
    return res.json({
      success: true,
      quote: {
        ...priced.breakdown,
        campaign_benefit: priced.benefit,
        coins_estimate: Math.floor(priced.breakdown.shop_receives / bahtPerCoin) + (priced.benefit ? priced.benefit.bonusCoins : 0),
        wallet_balance: walletBalance,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Quote payment error:', error);
    return res.status(500).json({ success: false, message: 'Unable to calculate payment' });
  } finally {
    client.release();
  }
}

async function createPayment(req, res) {
  const { payment_request_id: paymentRequestId, request_key: requestKey } = req.body;
  const couponId = readCouponId(req.body.coupon_id);

  if (!UUID_PATTERN.test(paymentRequestId || '') || !requestKey || typeof requestKey !== 'string' || requestKey.length > 100 ||
      !requestKey.trim()) {
    return res.status(400).json({
      success: false,
      message: 'payment_request_id and request_key are required',
    });
  }
  if (!isValidCouponId(couponId)) return res.status(400).json({ success: false, message: 'coupon_id must be a UUID' });
  if (typeof req.body.pin !== 'string' || !PIN_PATTERN.test(req.body.pin)) {
    return res.status(400).json({ success: false, code: 'PIN_REQUIRED', message: 'pin must be exactly 6 digits' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const prior = await client.query(
      'SELECT * FROM payments WHERE request_key = $1',
      [requestKey]
    );
    if (prior.rows.length) {
      await client.query('ROLLBACK');
      if (prior.rows[0].user_id !== req.user.user_id) {
        return res.status(409).json({ success: false, message: 'Request key has already been used' });
      }
      return res.status(200).json({ success: true, payment: prior.rows[0], idempotent: true });
    }

    // ล็อกคำขอไว้จนจบ transaction ลูกค้าสองคนจึงจ่ายคำขอเดียวกันพร้อมกันไม่ได้
    const paidAt = new Date();
    const loaded = await loadPayableRequest(client, paymentRequestId, { lock: true, now: paidAt });
    if (loaded.error) {
      await client.query('ROLLBACK');
      const { status, ...body } = loaded.error;
      return res.status(status).json({ success: false, ...body });
    }
    const { shop_id: shopId, amount } = loaded.request;

    const pinCheck = await verifyPin(client, req.user.user_id, req.body.pin);
    if (pinCheck.error) {
      // ยังไม่ได้บันทึกรายการใด COMMIT เพื่อเก็บจำนวนครั้งที่ใส่ PIN ผิด
      await client.query('COMMIT');
      return res.status(pinCheck.error.status).json({ success: false, ...pinCheck.error });
    }

    const priced = await priceCheckout(client, { shopId, userId: req.user.user_id, grossAmount: amount, couponId, paidAt });
    if (priced.error) {
      await client.query('ROLLBACK');
      return res.status(priced.error.status).json({ success: false, message: priced.error.message });
    }
    const { benefit, policy, coupon, breakdown } = priced;
    // แถว users ถูกล็อกแล้ว ยอดกระเป๋าจึงไม่เปลี่ยนระหว่างตรวจกับหัก
    const walletBalance = await getBalance(client, req.user.user_id);
    if (walletBalance < breakdown.citizen_paid) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false, code: 'INSUFFICIENT_BALANCE', message: 'Wallet balance is not enough',
        balance: walletBalance, required: breakdown.citizen_paid,
      });
    }
    const netAmount = breakdown.shop_receives;
    const result = await client.query(
      `INSERT INTO payments (request_key, user_id, shop_id, gross_amount, discount_amount, net_amount,
         coupon_discount, government_subsidy, citizen_paid, policy_version, status, paid_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'SUCCESS', $11)
       RETURNING *`,
      [requestKey, req.user.user_id, shopId, amount, breakdown.campaign_discount, netAmount,
        breakdown.coupon_discount, breakdown.government_subsidy, breakdown.citizen_paid, breakdown.policy_version, paidAt]
    );
    const payment = result.rows[0];
    await client.query(
      "UPDATE payment_requests SET status = 'PAID', payment_id = $2 WHERE request_id = $1",
      [paymentRequestId, payment.payment_id]
    );

    if (breakdown.citizen_paid > 0) {
      await client.query(
        "INSERT INTO wallet_ledger (user_id, payment_id, amount, reason) VALUES ($1, $2, $3, 'PAYMENT')",
        [req.user.user_id, payment.payment_id, -breakdown.citizen_paid]
      );
    }

    if (coupon) {
      await client.query(
        `UPDATE coupons SET status = 'USED', payment_id = $2, used_at = $3 WHERE coupon_id = $1`,
        [coupon.coupon_id, payment.payment_id, paidAt]
      );
    }

    if (benefit) {
      await recordRedemption(client, {
        campaignId: benefit.campaignId,
        userId: req.user.user_id,
        paymentId: payment.payment_id,
        benefitValue: benefit.benefitValue,
      });
    }

    const regularCoins = Math.floor(netAmount / (policy ? policy.baht_per_coin : DEFAULT_BAHT_PER_COIN));
    if (regularCoins > 0) {
      await client.query(
        `INSERT INTO coin_ledger (user_id, payment_id, amount, reason)
         VALUES ($1, $2, $3, 'PAYMENT_REWARD')`,
        [req.user.user_id, payment.payment_id, regularCoins]
      );
    }
    if (benefit && benefit.bonusCoins > 0) {
      await client.query(
        `INSERT INTO coin_ledger (user_id, payment_id, amount, reason)
         VALUES ($1, $2, $3, 'CAMPAIGN_BONUS')`,
        [req.user.user_id, payment.payment_id, benefit.bonusCoins]
      );
    }
    const missions = await completeMissions(client, { userId: req.user.user_id, paymentId: payment.payment_id, paidAt });
    const missionCoins = missions.reduce((sum, mission) => sum + mission.reward_coins, 0);

    await client.query('COMMIT');
    return res.status(201).json({
      success: true,
      payment,
      coins_earned: regularCoins + (benefit ? benefit.bonusCoins : 0) + missionCoins,
      missions_completed: missions,
      campaign_benefit: benefit,
      breakdown,
      wallet_balance: Math.round((walletBalance - breakdown.citizen_paid) * 100) / 100,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') {
      const existing = await db.query('SELECT * FROM payments WHERE request_key = $1', [requestKey]);
      if (existing.rows[0] && existing.rows[0].user_id === req.user.user_id) {
        return res.status(200).json({ success: true, payment: existing.rows[0], idempotent: true });
      }
      return res.status(409).json({ success: false, message: 'Request key has already been used' });
    }
    console.error('Create payment error:', error);
    return res.status(500).json({ success: false, message: 'Unable to process payment' });
  } finally {
    client.release();
  }
}

function createRequestKey() {
  return crypto.randomUUID();
}

module.exports = { createPayment, quotePayment, createRequestKey };
