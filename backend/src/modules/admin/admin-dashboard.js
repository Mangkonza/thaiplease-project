const db = require('../../config/db');

const TREND_DAYS = 30;
const TOP_SHOPS = 5;

// วันและเดือนนับตามเวลาไทย เหมือนการคิดเพดานรัฐช่วยจ่าย
const BKK_DAY = "(p.paid_at AT TIME ZONE 'Asia/Bangkok')::date";
const BKK_TODAY = "(now() AT TIME ZONE 'Asia/Bangkok')::date";

const toNumber = (row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value === null ? null : Number(value)]));

// ภาพรวมทั้งระบบสำหรับหน้าแรกของ Admin: ยอดวันนี้/เดือนนี้ งานที่รอ แนวโน้ม 30 วัน และร้านยอดสูงสุด
async function adminDashboard(req, res) {
  try {
    const [shops, citizens, totals, pending, payouts, trend, topShops] = await Promise.all([
      db.query('SELECT status, COUNT(*)::integer AS count FROM shops GROUP BY status'),
      db.query(`SELECT COUNT(*)::integer AS total,
                       COUNT(*) FILTER (WHERE status = 'ACTIVE')::integer AS active
                FROM users WHERE role = 'CITIZEN'`),
      db.query(
        `SELECT
           COUNT(*) FILTER (WHERE ${BKK_DAY} = ${BKK_TODAY}) AS today_orders,
           COALESCE(SUM(p.gross_amount) FILTER (WHERE ${BKK_DAY} = ${BKK_TODAY}), 0) AS today_gross,
           COALESCE(SUM(p.government_subsidy) FILTER (WHERE ${BKK_DAY} = ${BKK_TODAY}), 0) AS today_subsidy,
           COUNT(*) FILTER (WHERE date_trunc('month', ${BKK_DAY}) = date_trunc('month', ${BKK_TODAY})) AS month_orders,
           COALESCE(SUM(p.gross_amount) FILTER (WHERE date_trunc('month', ${BKK_DAY}) = date_trunc('month', ${BKK_TODAY})), 0) AS month_gross,
           COALESCE(SUM(p.government_subsidy) FILTER (WHERE date_trunc('month', ${BKK_DAY}) = date_trunc('month', ${BKK_TODAY})), 0) AS month_subsidy,
           COUNT(DISTINCT p.user_id) FILTER (WHERE date_trunc('month', ${BKK_DAY}) = date_trunc('month', ${BKK_TODAY})) AS month_buyers
         FROM payments p WHERE p.status = 'SUCCESS'`
      ),
      db.query(
        `SELECT
           (SELECT COUNT(*) FROM shops WHERE status = 'PENDING')::integer AS shops,
           (SELECT COUNT(*) FROM case_requests WHERE status = 'PENDING')::integer AS cases`
      ),
      db.query(
        `SELECT
           (SELECT COALESCE(SUM(government_subsidy + coupon_discount), 0) FROM payments WHERE status = 'SUCCESS') AS owed,
           (SELECT COALESCE(SUM(amount), 0) FROM shop_payouts) AS paid_out`
      ),
      db.query(
        `SELECT d::date::text AS day,
                COUNT(p.payment_id)::integer AS orders,
                COALESCE(SUM(p.gross_amount), 0) AS gross,
                COALESCE(SUM(p.government_subsidy), 0) AS subsidy
         FROM generate_series(${BKK_TODAY} - ($1::integer - 1), ${BKK_TODAY}, interval '1 day') AS d
         LEFT JOIN payments p ON p.status = 'SUCCESS' AND ${BKK_DAY} = d::date
         GROUP BY d ORDER BY d`,
        [TREND_DAYS]
      ),
      db.query(
        `SELECT s.shop_id, s.name, s.category, COUNT(p.payment_id)::integer AS orders, COALESCE(SUM(p.gross_amount), 0) AS gross
         FROM payments p JOIN shops s ON s.shop_id = p.shop_id
         WHERE p.status = 'SUCCESS' AND ${BKK_DAY} >= ${BKK_TODAY} - ($1::integer - 1)
         GROUP BY s.shop_id, s.name, s.category
         ORDER BY gross DESC LIMIT $2`,
        [TREND_DAYS, TOP_SHOPS]
      ),
    ]);

    const shopCounts = { ACTIVE: 0, PENDING: 0, SUSPENDED: 0 };
    for (const row of shops.rows) shopCounts[row.status] = row.count;
    const money = toNumber(totals.rows[0]);
    const { owed, paid_out: paidOut } = toNumber(payouts.rows[0]);

    return res.json({
      success: true,
      dashboard: {
        shops: shopCounts,
        citizens: citizens.rows[0],
        today: { orders: money.today_orders, gross: money.today_gross, subsidy: money.today_subsidy },
        month: { orders: money.month_orders, gross: money.month_gross, subsidy: money.month_subsidy, buyers: money.month_buyers },
        pending: pending.rows[0],
        payouts: { owed, paid_out: paidOut, outstanding: Math.round((owed - paidOut) * 100) / 100 },
        trend: trend.rows.map((row) => ({ day: row.day, orders: row.orders, gross: Number(row.gross), subsidy: Number(row.subsidy) })),
        top_shops: topShops.rows.map((row) => ({ ...row, gross: Number(row.gross) })),
        trend_days: TREND_DAYS,
      },
    });
  } catch (error) {
    console.error('Admin dashboard error:', error);
    return res.status(500).json({ success: false, message: 'Unable to load admin dashboard' });
  }
}

module.exports = { adminDashboard, TREND_DAYS };
