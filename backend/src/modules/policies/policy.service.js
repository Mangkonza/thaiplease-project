// คืนวันที่เป็นข้อความ YYYY-MM-DD เพื่อไม่ให้ timezone ของ process ทำให้วันเลื่อน
const policyColumns = (alias) => `${alias}.policy_version, ${alias}.copay_percent, ${alias}.daily_cap,
  ${alias}.monthly_cap, ${alias}.lifetime_cap, ${alias}.baht_per_coin, ${alias}.coupon_coin_cost,
  ${alias}.coupon_value, ${alias}.coupon_min_spend, ${alias}.coupon_valid_days,
  ${alias}.program_start::text AS program_start, ${alias}.program_end::text AS program_end,
  ${alias}.note, ${alias}.created_by, ${alias}.created_at`;

const NUMERIC_FIELDS = ['copay_percent', 'daily_cap', 'monthly_cap', 'lifetime_cap', 'coupon_value', 'coupon_min_spend'];

function normalizePolicy(row) {
  if (!row) return null;
  const policy = { ...row };
  for (const field of NUMERIC_FIELDS) policy[field] = Number(row[field]);
  return policy;
}

async function getActivePolicy(queryable) {
  const result = await queryable.query(
    `SELECT ${policyColumns('p')} FROM project_policies p ORDER BY policy_version DESC LIMIT 1`
  );
  return normalizePolicy(result.rows[0]);
}

async function listPolicies(queryable) {
  const result = await queryable.query(
    `SELECT ${policyColumns('p')}, u.display_name AS created_by_name
     FROM project_policies p LEFT JOIN users u ON u.user_id = p.created_by
     ORDER BY policy_version DESC`
  );
  return result.rows.map(normalizePolicy);
}

// ยอดรัฐช่วยจ่ายที่ใช้ไปแล้ว นับวันและเดือนตามเวลาไทย รายการที่คืนเงินแล้ว (REFUNDED) ไม่นับ
async function getSubsidyUsage(queryable, userId, at = new Date()) {
  const result = await queryable.query(
    `SELECT
       COALESCE(SUM(government_subsidy) FILTER (
         WHERE (paid_at AT TIME ZONE 'Asia/Bangkok')::date = ($2::timestamptz AT TIME ZONE 'Asia/Bangkok')::date), 0) AS today,
       COALESCE(SUM(government_subsidy) FILTER (
         WHERE date_trunc('month', paid_at AT TIME ZONE 'Asia/Bangkok') = date_trunc('month', $2::timestamptz AT TIME ZONE 'Asia/Bangkok')), 0) AS month,
       COALESCE(SUM(government_subsidy), 0) AS total
     FROM payments
     WHERE user_id = $1 AND status = 'SUCCESS'`,
    [userId, at]
  );
  const row = result.rows[0] || {};
  return { today: Number(row.today || 0), month: Number(row.month || 0), total: Number(row.total || 0) };
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const isMoney = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 &&
  value <= 9999999999.99 && Math.abs(Math.round(value * 100) - value * 100) < 1e-8;
const isPositiveInteger = (value) => Number.isInteger(value) && value >= 1 && value <= 1000000;

// ตรวจข้อมูลนโยบายใหม่จาก Admin คืนรายการข้อผิดพลาด (ว่าง = ผ่าน)
function validatePolicyInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return ['body must be an object'];
  const errors = [];
  const { copay_percent: copay } = input;
  if (typeof copay !== 'number' || !Number.isFinite(copay) || copay < 0 || copay > 100) {
    errors.push('copay_percent must be a number between 0 and 100');
  }
  for (const field of ['daily_cap', 'monthly_cap', 'lifetime_cap', 'coupon_value', 'coupon_min_spend']) {
    if (!isMoney(input[field])) errors.push(`${field} must be a non-negative amount with at most 2 decimals`);
  }
  for (const field of ['baht_per_coin', 'coupon_coin_cost', 'coupon_valid_days']) {
    if (!isPositiveInteger(input[field])) errors.push(`${field} must be a positive integer`);
  }
  for (const field of ['program_start', 'program_end']) {
    if (!isValidDate(input[field])) errors.push(`${field} must be a date in YYYY-MM-DD format`);
  }
  if (input.note !== undefined && input.note !== null && (typeof input.note !== 'string' || input.note.length > 500)) {
    errors.push('note must be text up to 500 characters');
  }
  if (errors.length) return errors;

  if (input.monthly_cap < input.daily_cap) errors.push('monthly_cap must be at least daily_cap');
  if (input.lifetime_cap < input.monthly_cap) errors.push('lifetime_cap must be at least monthly_cap');
  if (input.coupon_value <= 0) errors.push('coupon_value must be greater than 0');
  if (input.coupon_min_spend < input.coupon_value) errors.push('coupon_min_spend must be at least coupon_value');
  if (input.program_end < input.program_start) errors.push('program_end must not be before program_start');
  return errors;
}

module.exports = { getActivePolicy, listPolicies, getSubsidyUsage, validatePolicyInput, policyColumns, normalizePolicy };
