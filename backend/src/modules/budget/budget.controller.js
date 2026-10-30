const db = require('../../config/db');
const { writeAudit } = require('../shared/audit');
const { UUID_PATTERN } = require('../../middlewares/shop.middleware');
const { getActivePolicy } = require('../policies/policy.service');
const { shopBalances } = require('./budget.service');

const toNumbers = (row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value === null ? null : Number(value)]));

// Dashboard งบโครงการ (D-17): รัฐช่วยจ่าย, คูปอง, เหรียญ, ยอดโอนรายร้าน
async function adminBudget(req, res) {
  try {
    const [policy, payments, coins, coupons, shops] = await Promise.all([
      getActivePolicy(db),
      db.query(
        `SELECT COUNT(*) FILTER (WHERE status = 'SUCCESS') AS payments,
           COALESCE(SUM(gross_amount) FILTER (WHERE status = 'SUCCESS'), 0) AS gross_amount,
           COALESCE(SUM(discount_amount) FILTER (WHERE status = 'SUCCESS'), 0) AS campaign_discount,
           COALESCE(SUM(coupon_discount) FILTER (WHERE status = 'SUCCESS'), 0) AS coupon_discount,
           COALESCE(SUM(government_subsidy) FILTER (WHERE status = 'SUCCESS'), 0) AS government_subsidy,
           COALESCE(SUM(citizen_paid) FILTER (WHERE status = 'SUCCESS'), 0) AS citizen_paid,
           COUNT(DISTINCT user_id) FILTER (WHERE status = 'SUCCESS' AND government_subsidy > 0) AS subsidized_citizens,
           COUNT(*) FILTER (WHERE status = 'REFUNDED') AS refunded_payments,
           COALESCE(SUM(gross_amount) FILTER (WHERE status = 'REFUNDED'), 0) AS refunded_amount
         FROM payments`
      ),
      db.query(
        `SELECT reason, COALESCE(SUM(amount), 0)::integer AS amount, COUNT(*)::integer AS entries
         FROM coin_ledger GROUP BY reason ORDER BY reason`
      ),
      db.query(
        `SELECT COUNT(*) AS issued, COALESCE(SUM(value), 0) AS issued_value, COALESCE(SUM(coin_cost), 0) AS coins_spent,
           COUNT(*) FILTER (WHERE status = 'USED') AS used, COALESCE(SUM(value) FILTER (WHERE status = 'USED'), 0) AS used_value,
           COUNT(*) FILTER (WHERE status = 'ACTIVE' AND expires_at > now()) AS active,
           COALESCE(SUM(value) FILTER (WHERE status = 'ACTIVE' AND expires_at > now()), 0) AS active_value,
           COUNT(*) FILTER (WHERE status = 'ACTIVE' AND expires_at <= now()) AS expired
         FROM coupons`
      ),
      shopBalances(db),
    ]);
    const coinRows = coins.rows;
    const outstanding = coinRows.reduce((sum, row) => sum + row.amount, 0);
    const shopTotals = shops.reduce((sum, shop) => ({
      owed: sum.owed + shop.owed, paid_out: sum.paid_out + shop.paid_out, pending: sum.pending + shop.pending,
    }), { owed: 0, paid_out: 0, pending: 0 });
    const round = (value) => Number(value.toFixed(2));
    const paymentTotals = toNumbers(payments.rows[0]);
    const couponTotals = toNumbers(coupons.rows[0]);
    // งบที่ใช้ไปแล้ว = รัฐช่วยจ่าย + คูปองของรายการที่สำเร็จ, คูปองที่ออกแล้วแต่ยังไม่ใช้คือภาระผูกพัน
    const spent = round(paymentTotals.government_subsidy + paymentTotals.coupon_discount);
    const total = policy?.total_budget ?? null;
    const programBudget = total === null ? null : {
      total,
      spent,
      remaining: round(total - spent),
      committed: couponTotals.active_value,
      available: round(total - spent - couponTotals.active_value),
      used_percent: Number(((spent / total) * 100).toFixed(1)),
    };
    return res.json({
      success: true,
      policy,
      budget: programBudget,
      payments: paymentTotals,
      coins: { by_reason: coinRows, outstanding },
      coupons: couponTotals,
      transfers: { owed: round(shopTotals.owed), paid_out: round(shopTotals.paid_out), pending: round(shopTotals.pending) },
      shops: shops.filter((shop) => shop.payments > 0 || shop.paid_out > 0),
    });
  } catch (error) {
    console.error('Admin budget error:', error);
    return res.status(500).json({ success: false, message: 'Unable to load budget dashboard' });
  }
}

// บันทึกว่าโอนยอดรอรับทั้งหมด ณ ตอนนี้ให้ร้านแล้ว ล็อกร้านไว้กันบันทึกซ้อนกัน
async function adminCreatePayout(req, res) {
  const { shopId } = req.params;
  const note = typeof req.body?.note === 'string' && req.body.note.trim() ? req.body.note.trim().slice(0, 500) : null;
  if (!UUID_PATTERN.test(shopId || '')) return res.status(400).json({ success: false, message: 'Shop ID must be a valid UUID' });
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const shop = await client.query('SELECT shop_id FROM shops WHERE shop_id = $1 FOR UPDATE', [shopId]);
    if (!shop.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Shop not found' });
    }
    const [balance] = await shopBalances(client, shopId);
    if (balance.pending <= 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'This shop has no pending amount to transfer' });
    }
    const inserted = await client.query(
      'INSERT INTO shop_payouts (shop_id, amount, note, created_by) VALUES ($1, $2, $3, $4) RETURNING *',
      [shopId, balance.pending, note, req.user.user_id]
    );
    await writeAudit(client, {
      actorId: req.user.user_id, action: 'SHOP_PAYOUT_RECORDED', entityType: 'shop', entityId: shopId,
      detail: { amount: balance.pending, owed: balance.owed, paid_out_before: balance.paid_out, note },
    });
    await client.query('COMMIT');
    return res.status(201).json({ success: true, payout: inserted.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Admin create payout error:', error);
    return res.status(500).json({ success: false, message: 'Unable to record payout' });
  } finally {
    client.release();
  }
}

// ยอดรอรับจากโครงการของร้าน (D-14) สำหรับเจ้าของร้าน
async function shopProgramBalance(req, res) {
  try {
    const [[balance], payouts] = await Promise.all([
      shopBalances(db, req.params.shopId),
      db.query(
        'SELECT payout_id, amount, note, created_at FROM shop_payouts WHERE shop_id = $1 ORDER BY created_at DESC LIMIT 10',
        [req.params.shopId]
      ),
    ]);
    if (!balance) return res.status(404).json({ success: false, message: 'Shop not found' });
    return res.json({ success: true, balance, payouts: payouts.rows.map((row) => ({ ...row, amount: Number(row.amount) })) });
  } catch (error) {
    console.error('Shop program balance error:', error);
    return res.status(500).json({ success: false, message: 'Unable to load program balance' });
  }
}

module.exports = { adminBudget, adminCreatePayout, shopProgramBalance };
