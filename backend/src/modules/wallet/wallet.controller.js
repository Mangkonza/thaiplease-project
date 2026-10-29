const db = require('../../config/db');
const { UUID_PATTERN } = require('../../middlewares/shop.middleware');
const { MAX_TOPUP, PIN_PATTERN, isValidTopup, getBalance, hashPin, verifyPin } = require('./wallet.service');

const sendError = (res, error) => res.status(error.status).json({ success: false, ...error });

async function getWallet(req, res) {
  try {
    const userId = req.user.user_id;
    const [balance, user, transactions] = await Promise.all([
      getBalance(db, userId),
      db.query('SELECT pin_hash IS NOT NULL AS has_pin, pin_locked_until FROM users WHERE user_id = $1', [userId]),
      db.query(
        `SELECT w.ledger_id, w.payment_id, w.amount, w.reason, w.created_at, s.name AS shop_name
         FROM wallet_ledger w
         LEFT JOIN payments p ON p.payment_id = w.payment_id
         LEFT JOIN shops s ON s.shop_id = p.shop_id
         WHERE w.user_id = $1 ORDER BY w.created_at DESC LIMIT 50`,
        [userId]
      ),
    ]);
    return res.json({
      success: true,
      balance,
      max_topup: MAX_TOPUP,
      has_pin: Boolean(user.rows[0]?.has_pin),
      pin_locked_until: user.rows[0]?.pin_locked_until || null,
      transactions: transactions.rows,
    });
  } catch (error) {
    console.error('Get wallet error:', error);
    return res.status(500).json({ success: false, message: 'Unable to load wallet' });
  }
}

// เติมเงินแบบจำลอง ไม่มีการตัดเงินจากธนาคารจริง
async function topUp(req, res) {
  const amount = Number(req.body.amount);
  if (!isValidTopup(amount)) {
    return res.status(400).json({ success: false, message: `amount must be between 0.01 and ${MAX_TOPUP} baht` });
  }
  try {
    await db.query(
      "INSERT INTO wallet_ledger (user_id, amount, reason) VALUES ($1, $2, 'TOPUP')",
      [req.user.user_id, amount]
    );
    return res.status(201).json({ success: true, balance: await getBalance(db, req.user.user_id) });
  } catch (error) {
    console.error('Wallet top-up error:', error);
    return res.status(500).json({ success: false, message: 'Unable to top up wallet' });
  }
}

// ตั้ง PIN ครั้งแรก หรือเปลี่ยน PIN ซึ่งต้องใส่ PIN เดิมให้ถูกก่อน
async function setPin(req, res) {
  const { pin, current_pin: currentPin } = req.body;
  if (typeof pin !== 'string' || !PIN_PATTERN.test(pin)) {
    return res.status(400).json({ success: false, message: 'pin must be exactly 6 digits' });
  }
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const user = await client.query('SELECT pin_hash FROM users WHERE user_id = $1 FOR UPDATE', [req.user.user_id]);
    if (user.rows[0]?.pin_hash) {
      if (typeof currentPin !== 'string' || !PIN_PATTERN.test(currentPin)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, code: 'CURRENT_PIN_REQUIRED', message: 'current_pin is required to change the PIN' });
      }
      const checked = await verifyPin(client, req.user.user_id, currentPin);
      if (checked.error) {
        await client.query('COMMIT');
        return sendError(res, checked.error);
      }
    }
    await client.query(
      'UPDATE users SET pin_hash = $2, pin_failed_attempts = 0, pin_locked_until = NULL, updated_at = NOW() WHERE user_id = $1',
      [req.user.user_id, await hashPin(pin)]
    );
    await client.query('COMMIT');
    return res.json({ success: true, has_pin: true });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Set PIN error:', error);
    return res.status(500).json({ success: false, message: 'Unable to set PIN' });
  } finally {
    client.release();
  }
}

// สลิปของรายการจ่าย ผู้จ่ายดูได้เฉพาะรายการของตัวเอง
async function getSlip(req, res) {
  const { paymentId } = req.params;
  if (!UUID_PATTERN.test(paymentId)) {
    return res.status(400).json({ success: false, message: 'paymentId must be a valid UUID' });
  }
  try {
    const result = await db.query(
      `SELECT p.payment_id, p.shop_id, s.name AS shop_name, s.area AS shop_area, p.status, p.paid_at, p.refunded_at,
              p.gross_amount, p.discount_amount AS campaign_discount, p.coupon_discount, p.government_subsidy,
              p.citizen_paid, p.net_amount, p.policy_version,
              (SELECT COALESCE(SUM(c.amount), 0)::integer FROM coin_ledger c WHERE c.payment_id = p.payment_id AND c.amount > 0) AS coins_earned
       FROM payments p JOIN shops s ON s.shop_id = p.shop_id
       WHERE p.payment_id = $1 AND p.user_id = $2`,
      [paymentId, req.user.user_id]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Payment not found' });
    return res.json({ success: true, slip: result.rows[0] });
  } catch (error) {
    console.error('Get slip error:', error);
    return res.status(500).json({ success: false, message: 'Unable to load slip' });
  }
}

module.exports = { getWallet, topUp, setPin, getSlip };
