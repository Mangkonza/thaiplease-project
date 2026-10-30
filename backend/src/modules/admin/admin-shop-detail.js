const db = require('../../config/db');
const { UUID_PATTERN } = require('../../middlewares/shop.middleware');
const { shopBalances } = require('../budget/budget.service');

const RECENT_PAYMENTS = 10;
const toNumbers = (row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value === null ? null : Number(value)]));

// รายละเอียดร้านสำหรับ Admin: ข้อมูลร้านและเจ้าของ ยอดขาย ยอดที่โครงการต้องโอน ประวัติการโอน รายการล่าสุด และคำร้อง
async function adminShopDetail(req, res) {
  const { shopId } = req.params;
  if (!UUID_PATTERN.test(shopId || '')) return res.status(400).json({ success: false, message: 'Shop ID must be a valid UUID' });
  try {
    const shop = await db.query(
      `SELECT s.*, u.display_name AS owner_name, u.email AS owner_email, u.status AS owner_status
       FROM shops s JOIN users u ON u.user_id = s.owner_id WHERE s.shop_id = $1`,
      [shopId]
    );
    if (!shop.rows.length) return res.status(404).json({ success: false, message: 'Shop not found' });

    const [sales, balance, payouts, recent, cases, campaigns] = await Promise.all([
      db.query(
        `SELECT COUNT(*) AS orders, COALESCE(SUM(gross_amount), 0) AS gross, COUNT(DISTINCT user_id) AS buyers,
           COUNT(*) FILTER (WHERE paid_at >= now() - interval '30 days') AS orders_30d,
           COALESCE(SUM(gross_amount) FILTER (WHERE paid_at >= now() - interval '30 days'), 0) AS gross_30d,
           MAX(paid_at) AS last_paid_at
         FROM payments WHERE shop_id = $1 AND status = 'SUCCESS'`,
        [shopId]
      ),
      shopBalances(db, shopId),
      db.query(
        `SELECT p.payout_id, p.amount, p.note, p.created_at, u.display_name AS created_by_name
         FROM shop_payouts p LEFT JOIN users u ON u.user_id = p.created_by
         WHERE p.shop_id = $1 ORDER BY p.created_at DESC LIMIT 20`,
        [shopId]
      ),
      db.query(
        `SELECT p.payment_id, p.paid_at, p.status, p.gross_amount, p.government_subsidy, p.coupon_discount, p.citizen_paid,
           u.display_name AS citizen_name
         FROM payments p JOIN users u ON u.user_id = p.user_id
         WHERE p.shop_id = $1 AND p.paid_at IS NOT NULL ORDER BY p.paid_at DESC LIMIT $2`,
        [shopId, RECENT_PAYMENTS]
      ),
      db.query(
        `SELECT case_type, status, COUNT(*)::integer AS count FROM case_requests WHERE shop_id = $1 GROUP BY case_type, status`,
        [shopId]
      ),
      db.query(
        `SELECT c.campaign_id, c.name, c.status, c.start_at, c.end_at, t.name AS template_name
         FROM campaigns c JOIN promotion_templates t ON t.template_id = c.template_id
         WHERE c.shop_id = $1 ORDER BY c.created_at DESC LIMIT 5`,
        [shopId]
      ),
    ]);

    return res.json({
      success: true,
      shop: shop.rows[0],
      sales: { ...toNumbers({ ...sales.rows[0], last_paid_at: null }), last_paid_at: sales.rows[0].last_paid_at },
      balance: balance[0] || null,
      payouts: payouts.rows.map((row) => ({ ...row, amount: Number(row.amount) })),
      recent_payments: recent.rows.map((row) => ({
        ...row, gross_amount: Number(row.gross_amount), government_subsidy: Number(row.government_subsidy),
        coupon_discount: Number(row.coupon_discount), citizen_paid: Number(row.citizen_paid),
      })),
      cases: cases.rows,
      campaigns: campaigns.rows,
    });
  } catch (error) {
    console.error('Admin shop detail error:', error);
    return res.status(500).json({ success: false, message: 'Unable to load shop detail' });
  }
}

module.exports = { adminShopDetail };
