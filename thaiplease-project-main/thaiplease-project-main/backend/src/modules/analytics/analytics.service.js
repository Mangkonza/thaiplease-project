const db = require('../../config/db');
const { addDays, previousPeriod } = require('./analytics.period');

// นิยามตาม SRS 2.7: นับเฉพาะ payment SUCCESS ของร้านในช่วงเวลา (REFUNDED/FAILED ไม่นับ)
// ลูกค้าใหม่ = ซื้อ SUCCESS ครั้งแรกกับร้านนี้ในช่วงนี้; ลูกค้าซ้ำ = เคยซื้อ SUCCESS กับร้านนี้ก่อนเริ่มช่วง
// ขอบเขตช่วงเวลาเป็นเวลาไทย: [start 00:00, end+1 00:00) Asia/Bangkok
const METRICS_SQL = `
  WITH bounds AS (
    SELECT ($2::date)::timestamp AT TIME ZONE 'Asia/Bangkok' AS start_ts,
           ($3::date)::timestamp AT TIME ZONE 'Asia/Bangkok' AS end_ts
  ),
  in_period AS (
    SELECT p.user_id, p.net_amount
    FROM payments p, bounds b
    WHERE p.shop_id = $1 AND p.status = 'SUCCESS'
      AND p.paid_at >= b.start_ts AND p.paid_at < b.end_ts
  ),
  first_purchase AS (
    SELECT user_id, MIN(paid_at) AS first_paid_at
    FROM payments
    WHERE shop_id = $1 AND status = 'SUCCESS'
    GROUP BY user_id
  ),
  buyers AS (
    SELECT DISTINCT ip.user_id, fp.first_paid_at
    FROM in_period ip JOIN first_purchase fp USING (user_id)
  )
  SELECT
    (SELECT COALESCE(SUM(net_amount), 0) FROM in_period) AS revenue,
    (SELECT COUNT(*) FROM in_period)::int AS orders,
    (SELECT COUNT(*) FROM buyers)::int AS unique_buyers,
    (SELECT COUNT(*) FROM buyers, bounds b WHERE buyers.first_paid_at >= b.start_ts)::int AS new_customers,
    (SELECT COUNT(*) FROM buyers, bounds b WHERE buyers.first_paid_at < b.start_ts)::int AS repeat_customers
`;

const UPSERT_SQL = `
  INSERT INTO shop_metrics (shop_id, period_type, period_start, period_end, revenue, orders, unique_buyers,
                            new_customers, repeat_customers, aov, purchase_frequency, repeat_rate)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
  ON CONFLICT (shop_id, period_type, period_start, period_end) DO UPDATE SET
    revenue = EXCLUDED.revenue,
    orders = EXCLUDED.orders,
    unique_buyers = EXCLUDED.unique_buyers,
    new_customers = EXCLUDED.new_customers,
    repeat_customers = EXCLUDED.repeat_customers,
    aov = EXCLUDED.aov,
    purchase_frequency = EXCLUDED.purchase_frequency,
    repeat_rate = EXCLUDED.repeat_rate,
    created_at = CURRENT_TIMESTAMP
  RETURNING metric_id, created_at
`;

const round = (value, digits) => Math.round(value * 10 ** digits) / 10 ** digits;
// หารด้วยศูนย์ = ไม่มีค่า (null) ไม่ใช่ 0 ตาม SRS 2.7 (AOV เมื่อ Orders = 0)
const ratio = (numerator, denominator, digits) => (denominator > 0 ? round(numerator / denominator, digits) : null);

// คำนวณจากแถวที่ query ได้ แยกไว้เพื่อ test ได้โดยไม่ต้องมีฐานข้อมูล
function deriveMetrics(row) {
  const revenue = round(Number(row.revenue), 2);
  const { orders, unique_buyers, new_customers, repeat_customers } = row;
  return {
    revenue,
    orders,
    unique_buyers,
    new_customers,
    repeat_customers,
    aov: ratio(revenue, orders, 2),
    purchase_frequency: ratio(orders, unique_buyers, 4),
    repeat_rate: ratio(repeat_customers, unique_buyers, 4),
  };
}

async function computeShopMetrics(shopId, period, client = db) {
  const result = await client.query(METRICS_SQL, [shopId, period.start, addDays(period.end, 1)]);
  return deriveMetrics(result.rows[0]);
}

// บันทึกผลลง shop_metrics เพื่อย้อนดูได้ว่าใช้ตัวเลขชุดไหน (NFR-08)
async function saveShopMetrics(shopId, period, metrics, client = db) {
  const result = await client.query(UPSERT_SQL, [
    shopId, period.type, period.start, period.end,
    metrics.revenue, metrics.orders, metrics.unique_buyers, metrics.new_customers, metrics.repeat_customers,
    metrics.aov, metrics.purchase_frequency, metrics.repeat_rate,
  ]);
  return { metric_id: result.rows[0].metric_id, calculated_at: result.rows[0].created_at };
}

async function getAndSaveShopMetrics(shopId, period) {
  const metrics = await computeShopMetrics(shopId, period);
  const saved = await saveShopMetrics(shopId, period, metrics);
  return { ...saved, metrics };
}

// % เปลี่ยนแปลงเทียบช่วงก่อน; ช่วงก่อนเป็น 0 หรือไม่มีค่า = คำนวณไม่ได้ (null)
function percentChanges(current, previous) {
  const changes = {};
  for (const key of Object.keys(current)) {
    const before = previous[key];
    const after = current[key];
    changes[key] = before === null || after === null || before === 0 ? null : round(((after - before) / before) * 100, 2);
  }
  return changes;
}

// ช่วงที่เลือกเทียบกับช่วงก่อนหน้า ใช้ทั้งหน้า Dashboard และเป็น input ของ AI (SRS 3.4.1)
async function getDashboardData(shopId, period) {
  const comparisonPeriod = previousPeriod(period);
  const current = await getAndSaveShopMetrics(shopId, period);
  const comparison = await getAndSaveShopMetrics(shopId, comparisonPeriod);
  return {
    period,
    metrics: current.metrics,
    comparison: { period: comparisonPeriod, metrics: comparison.metrics },
    change_percent: percentChanges(current.metrics, comparison.metrics),
    calculated_at: current.calculated_at,
  };
}

// ADMIN ผ่าน verifyShopOwner โดยไม่เช็คว่ามีร้านจริง จึงต้องเช็คก่อนเขียนข้อมูลที่มี FK ไปที่ shops
async function shopExists(shopId) {
  const result = await db.query('SELECT 1 FROM shops WHERE shop_id = $1', [shopId]);
  return result.rows.length > 0;
}

module.exports = {
  computeShopMetrics,
  saveShopMetrics,
  getAndSaveShopMetrics,
  getDashboardData,
  shopExists,
  deriveMetrics,
  percentChanges,
};
