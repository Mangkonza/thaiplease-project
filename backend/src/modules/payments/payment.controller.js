const crypto = require('node:crypto');
const db = require('../../config/db');
const { quoteCampaignBenefit, recordRedemption } = require('../campaigns/campaign.service');
const { UUID_PATTERN } = require('../../middlewares/shop.middleware');

const BAHT_PER_COIN = 25;

async function createPayment(req, res) {
  const { shop_id: shopId, request_key: requestKey, gross_amount: grossAmount } = req.body;
  const amount = Number(grossAmount);

  if (!UUID_PATTERN.test(shopId || '') || !requestKey || typeof requestKey !== 'string' || requestKey.length > 100 ||
      !requestKey.trim() || !Number.isFinite(amount) || amount <= 0 ||
      amount > 9999999999.99 || Math.abs(Math.round(amount * 100) - amount * 100) > 1e-8) {
    return res.status(400).json({
      success: false,
      message: 'shop_id, request_key, and a positive gross_amount are required',
    });
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

    const shop = await client.query(
      'SELECT shop_id, status FROM shops WHERE shop_id = $1 FOR SHARE',
      [shopId]
    );
    if (!shop.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Shop not found' });
    }
    if (shop.rows[0].status !== 'ACTIVE') {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'Shop is not available for payments' });
    }

    const paidAt = new Date();
    const benefit = await quoteCampaignBenefit(client, {
      shopId, userId: req.user.user_id, grossAmount: amount, paidAt,
    });
    const discountAmount = benefit ? Math.min(amount, benefit.discountAmount) : 0;
    const netAmount = Number((amount - discountAmount).toFixed(2));
    const result = await client.query(
      `INSERT INTO payments (request_key, user_id, shop_id, gross_amount, discount_amount, net_amount, status, paid_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'SUCCESS', $7)
       RETURNING *`,
      [requestKey, req.user.user_id, shopId, amount, discountAmount, netAmount, paidAt]
    );
    const payment = result.rows[0];

    if (benefit) {
      await recordRedemption(client, {
        campaignId: benefit.campaignId,
        userId: req.user.user_id,
        paymentId: payment.payment_id,
        benefitValue: benefit.benefitValue,
      });
    }

    const regularCoins = Math.floor(netAmount / BAHT_PER_COIN);
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

    await client.query('COMMIT');
    return res.status(201).json({
      success: true,
      payment,
      coins_earned: regularCoins + (benefit ? benefit.bonusCoins : 0),
      campaign_benefit: benefit,
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

module.exports = { createPayment, createRequestKey };
