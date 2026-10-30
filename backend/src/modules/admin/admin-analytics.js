const db = require('../../config/db');

const TZ = 'Asia/Bangkok';
// จำนวนช่วงที่แสดงในกราฟ และหน่วยย่อยที่ใช้ตอนกดดูรายละเอียดของช่วงหนึ่ง
const GRANULARITY = {
  day: { buckets: 30, step: '1 day', sub: 'hour' },
  month: { buckets: 12, step: '1 month', sub: 'day' },
  year: { buckets: 5, step: '1 year', sub: 'month' },
};
const PERIOD_PATTERN = { day: /^\d{4}-\d{2}-\d{2}$/, month: /^\d{4}-\d{2}$/, year: /^\d{4}$/ };
const DETAIL_SHOPS = 20;

const num = (value) => (value === null || value === undefined ? 0 : Number(value));

// ยอดของรายการที่จ่ายสำเร็จ "ใช้สิทธิ์" = รายการที่รัฐช่วยจ่ายมากกว่า 0
// นับ payment_id ไม่ใช่ COUNT(*) เพราะใช้กับ LEFT JOIN ด้วย ช่วงที่ไม่มีรายการต้องได้ 0
const PAYMENT_METRICS = `
  COUNT(p.payment_id)::integer AS orders,
  COUNT(*) FILTER (WHERE p.government_subsidy > 0)::integer AS rights_uses,
  COUNT(DISTINCT p.user_id) FILTER (WHERE p.government_subsidy > 0)::integer AS active_users,
  COALESCE(SUM(p.gross_amount), 0) AS gross,
  COALESCE(SUM(p.government_subsidy), 0) AS subsidy`;

const toMetrics = (row = {}) => ({
  orders: num(row.orders),
  rights_uses: num(row.rights_uses),
  active_users: num(row.active_users),
  gross: num(row.gross),
  subsidy: num(row.subsidy),
});

// ช่วงเวลาแบบเวลาไทย 2 เท่าของที่แสดง: ครึ่งแรกคือช่วงก่อนหน้า ใช้วาดเส้นเปรียบเทียบ
async function seriesFor(granularity) {
  const { buckets, step } = GRANULARITY[granularity];
  const result = await db.query(
    `WITH buckets AS (
       SELECT b AS bucket_start
       FROM generate_series(
         date_trunc($1, now() AT TIME ZONE '${TZ}') - ($2::integer * 2 - 1) * $3::interval,
         date_trunc($1, now() AT TIME ZONE '${TZ}'),
         $3::interval) AS b
     ),
     pay AS (
       SELECT date_trunc($1, p.paid_at AT TIME ZONE '${TZ}') AS bucket_start, ${PAYMENT_METRICS}
       FROM payments p
       WHERE p.status = 'SUCCESS' AND p.paid_at >= (SELECT min(bucket_start) FROM buckets) AT TIME ZONE '${TZ}'
       GROUP BY 1
     ),
     reg AS (
       SELECT date_trunc($1, created_at AT TIME ZONE '${TZ}') AS bucket_start, COUNT(*)::integer AS new_participants
       FROM users WHERE role = 'CITIZEN' GROUP BY 1
     ),
     shop_reg AS (
       SELECT date_trunc($1, created_at AT TIME ZONE '${TZ}') AS bucket_start, COUNT(*)::integer AS new_shops
       FROM shops GROUP BY 1
     )
     SELECT to_char(b.bucket_start, 'YYYY-MM-DD') AS bucket_start,
            pay.orders, pay.rights_uses, pay.active_users, pay.gross, pay.subsidy,
            COALESCE(reg.new_participants, 0) AS new_participants,
            COALESCE(shop_reg.new_shops, 0) AS new_shops,
            (SELECT COUNT(*) FROM users WHERE role = 'CITIZEN'
               AND created_at AT TIME ZONE '${TZ}' < b.bucket_start + $3::interval)::integer AS total_participants
     FROM buckets b
     LEFT JOIN pay ON pay.bucket_start = b.bucket_start
     LEFT JOIN reg ON reg.bucket_start = b.bucket_start
     LEFT JOIN shop_reg ON shop_reg.bucket_start = b.bucket_start
     ORDER BY b.bucket_start`,
    [granularity, buckets, step]
  );
  return result.rows.map((row) => ({
    period: periodKey(granularity, row.bucket_start),
    ...toMetrics(row),
    new_participants: num(row.new_participants),
    total_participants: num(row.total_participants),
    new_shops: num(row.new_shops),
  }));
}

// คีย์ของช่วงที่หน้าเว็บส่งกลับมาขอรายละเอียด: 2026-10-30 / 2026-10 / 2026
function periodKey(granularity, isoDay) {
  if (granularity === 'year') return isoDay.slice(0, 4);
  if (granularity === 'month') return isoDay.slice(0, 7);
  return isoDay;
}

function periodStart(granularity, period) {
  if (granularity === 'year') return `${period}-01-01`;
  if (granularity === 'month') return `${period}-01`;
  return period;
}

const sumMetrics = (rows, keys) => Object.fromEntries(keys.map((key) => [key, rows.reduce((total, row) => total + row[key], 0)]));
const SUM_KEYS = ['orders', 'rights_uses', 'gross', 'subsidy', 'new_participants', 'new_shops'];

// ยอดรวมของช่วงปัจจุบันเทียบช่วงก่อน; ผู้ใช้สิทธิ์ (ไม่ซ้ำคน) รวมข้ามช่วงไม่ได้ จึงนับใหม่จากตาราง
async function totalsFor(granularity, current, previous) {
  const { step } = GRANULARITY[granularity];
  const start = periodStart(granularity, current[0].period);
  const prevStart = periodStart(granularity, previous[0].period);
  const result = await db.query(
    `SELECT
       COUNT(DISTINCT p.user_id) FILTER (WHERE p.paid_at AT TIME ZONE '${TZ}' >= $1::timestamp)::integer AS current_users,
       COUNT(DISTINCT p.user_id) FILTER (WHERE p.paid_at AT TIME ZONE '${TZ}' < $1::timestamp)::integer AS previous_users
     FROM payments p
     WHERE p.status = 'SUCCESS' AND p.government_subsidy > 0
       AND p.paid_at AT TIME ZONE '${TZ}' >= $2::timestamp
       AND p.paid_at AT TIME ZONE '${TZ}' < $1::timestamp + $3::integer * $4::interval`,
    [start, prevStart, current.length, step]
  );
  const users = result.rows[0] || {};
  return {
    current: { ...sumMetrics(current, SUM_KEYS), active_users: num(users.current_users), total_participants: current.at(-1).total_participants },
    previous: { ...sumMetrics(previous, SUM_KEYS), active_users: num(users.previous_users), total_participants: previous.at(-1).total_participants },
  };
}

async function breakdownFor(column, start, buckets, step) {
  const result = await db.query(
    `SELECT COALESCE(NULLIF(s.${column}, ''), 'ไม่ระบุ') AS label, COUNT(DISTINCT s.shop_id)::integer AS shops, ${PAYMENT_METRICS}
     FROM payments p JOIN shops s ON s.shop_id = p.shop_id
     WHERE p.status = 'SUCCESS'
       AND p.paid_at AT TIME ZONE '${TZ}' >= $1::timestamp
       AND p.paid_at AT TIME ZONE '${TZ}' < $1::timestamp + $2::integer * $3::interval
     GROUP BY 1 ORDER BY gross DESC`,
    [start, buckets, step]
  );
  return result.rows.map((row) => ({ label: row.label, shops: num(row.shops), ...toMetrics(row) }));
}

// GET /admin/analytics?granularity=day|month|year
async function adminAnalytics(req, res) {
  const granularity = req.query.granularity || 'day';
  if (!GRANULARITY[granularity]) {
    return res.status(400).json({ success: false, message: 'granularity must be day, month or year' });
  }
  try {
    const { buckets, step } = GRANULARITY[granularity];
    const all = await seriesFor(granularity);
    const previous = all.slice(0, buckets);
    const current = all.slice(buckets);
    const start = periodStart(granularity, current[0].period);
    const [totals, byCategory, byArea] = await Promise.all([
      totalsFor(granularity, current, previous),
      breakdownFor('category', start, buckets, step),
      breakdownFor('area', start, buckets, step),
    ]);
    return res.json({
      success: true,
      analytics: {
        granularity,
        series: current.map((row, index) => ({ ...row, previous: previous[index] })),
        totals,
        by_category: byCategory,
        by_area: byArea,
      },
    });
  } catch (error) {
    console.error('Admin analytics error:', error);
    return res.status(500).json({ success: false, message: 'Unable to load analytics' });
  }
}

// GET /admin/analytics/detail?granularity=day&period=2026-10-30 รายละเอียดของช่วงที่กดในกราฟ
async function adminAnalyticsDetail(req, res) {
  const { granularity, period } = req.query;
  if (!GRANULARITY[granularity] || typeof period !== 'string' || !PERIOD_PATTERN[granularity].test(period)) {
    return res.status(400).json({ success: false, message: 'granularity (day|month|year) and a matching period are required' });
  }
  const start = periodStart(granularity, period);
  if (Number.isNaN(Date.parse(`${start}T00:00:00Z`))) {
    return res.status(400).json({ success: false, message: 'period is not a valid date' });
  }
  const { step, sub } = GRANULARITY[granularity];
  const inPeriod = (expr) => `${expr} AT TIME ZONE '${TZ}' >= $1::timestamp AND ${expr} AT TIME ZONE '${TZ}' < $1::timestamp + $2::interval`;
  try {
    const [totals, people, shops, breakdown] = await Promise.all([
      db.query(`SELECT ${PAYMENT_METRICS} FROM payments p WHERE p.status = 'SUCCESS' AND ${inPeriod('p.paid_at')}`, [start, step]),
      db.query(
        `SELECT (SELECT COUNT(*) FROM users WHERE role = 'CITIZEN' AND ${inPeriod('created_at')})::integer AS new_participants,
                (SELECT COUNT(*) FROM shops WHERE ${inPeriod('created_at')})::integer AS new_shops`,
        [start, step]
      ),
      db.query(
        `SELECT s.shop_id, s.name, s.category, s.area, COUNT(DISTINCT p.user_id)::integer AS customers, ${PAYMENT_METRICS}
         FROM payments p JOIN shops s ON s.shop_id = p.shop_id
         WHERE p.status = 'SUCCESS' AND ${inPeriod('p.paid_at')}
         GROUP BY s.shop_id, s.name, s.category, s.area
         ORDER BY gross DESC LIMIT ${DETAIL_SHOPS}`,
        [start, step]
      ),
      db.query(
        `SELECT to_char(b, $3) AS label, ${PAYMENT_METRICS}
         FROM generate_series($1::timestamp, $1::timestamp + $2::interval - ('1 ' || $4)::interval, ('1 ' || $4)::interval) AS b
         LEFT JOIN payments p ON p.status = 'SUCCESS' AND date_trunc($4, p.paid_at AT TIME ZONE '${TZ}') = b
         GROUP BY b ORDER BY b`,
        [start, step, { hour: 'HH24:00', day: 'YYYY-MM-DD', month: 'YYYY-MM' }[sub], sub]
      ),
    ]);
    return res.json({
      success: true,
      detail: {
        granularity,
        period,
        sub_granularity: sub,
        totals: { ...toMetrics(totals.rows[0]), new_participants: num(people.rows[0].new_participants), new_shops: num(people.rows[0].new_shops) },
        shops: shops.rows.map((row) => ({ shop_id: row.shop_id, name: row.name, category: row.category, area: row.area, customers: num(row.customers), ...toMetrics(row) })),
        breakdown: breakdown.rows.map((row) => ({ label: row.label, ...toMetrics(row) })),
      },
    });
  } catch (error) {
    console.error('Admin analytics detail error:', error);
    return res.status(500).json({ success: false, message: 'Unable to load analytics detail' });
  }
}

module.exports = { adminAnalytics, adminAnalyticsDetail, GRANULARITY, periodKey, periodStart };
