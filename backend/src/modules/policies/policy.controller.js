const db = require('../../config/db');
const { writeAudit } = require('../shared/audit');
const {
  getActivePolicy, listPolicies, getSubsidyUsage, validatePolicyInput, policyColumns, normalizePolicy,
} = require('./policy.service');

async function getCurrentPolicy(req, res) {
  try {
    const policy = await getActivePolicy(db);
    if (!policy) return res.status(404).json({ success: false, message: 'No project policy has been configured' });
    return res.json({ success: true, policy });
  } catch (error) {
    console.error('Get current policy error:', error);
    return res.status(500).json({ success: false, message: 'Unable to load project policy' });
  }
}

// สิทธิ์รัฐช่วยจ่ายของประชาชน: ใช้ไปแล้วและคงเหลือตามเพดานรายวัน/เดือน/ทั้งโครงการ
async function getMySubsidy(req, res) {
  try {
    const [policy, used] = await Promise.all([
      getActivePolicy(db),
      getSubsidyUsage(db, req.user.user_id, new Date()),
    ]);
    if (!policy) return res.status(404).json({ success: false, message: 'No project policy has been configured' });
    const left = (cap, value) => Math.max(0, Number((cap - value).toFixed(2)));
    return res.json({
      success: true,
      policy,
      used,
      remaining: {
        today: Math.min(left(policy.daily_cap, used.today), left(policy.monthly_cap, used.month), left(policy.lifetime_cap, used.total)),
        month: Math.min(left(policy.monthly_cap, used.month), left(policy.lifetime_cap, used.total)),
        total: left(policy.lifetime_cap, used.total),
      },
    });
  } catch (error) {
    console.error('Get subsidy usage error:', error);
    return res.status(500).json({ success: false, message: 'Unable to load subsidy usage' });
  }
}

async function adminListPolicies(req, res) {
  try {
    return res.json({ success: true, policies: await listPolicies(db) });
  } catch (error) {
    console.error('Admin list policies error:', error);
    return res.status(500).json({ success: false, message: 'Unable to load project policies' });
  }
}

// แก้นโยบาย = สร้างเวอร์ชันใหม่ มีผลกับรายการที่จ่ายหลังจากนี้เท่านั้น (D-17)
async function adminCreatePolicy(req, res) {
  const errors = validatePolicyInput(req.body);
  if (errors.length) return res.status(400).json({ success: false, message: errors.join('; ') });

  const input = req.body;
  const note = typeof input.note === 'string' && input.note.trim() ? input.note.trim() : null;
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const previous = await getActivePolicy(client);
    const result = await client.query(
      `INSERT INTO project_policies AS p (copay_percent, daily_cap, monthly_cap, lifetime_cap, baht_per_coin,
         coupon_coin_cost, coupon_value, coupon_min_spend, coupon_valid_days, program_start, program_end, note, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING ${policyColumns('p')}`,
      [input.copay_percent, input.daily_cap, input.monthly_cap, input.lifetime_cap, input.baht_per_coin,
        input.coupon_coin_cost, input.coupon_value, input.coupon_min_spend, input.coupon_valid_days,
        input.program_start, input.program_end, note, req.user.user_id]
    );
    const policy = normalizePolicy(result.rows[0]);
    await writeAudit(client, {
      actorId: req.user.user_id,
      action: 'POLICY_UPDATED',
      entityType: 'project_policy',
      entityId: null,
      detail: {
        policy_version: policy.policy_version,
        previous_version: previous ? previous.policy_version : null,
        values: { ...input, note },
      },
    });
    await client.query('COMMIT');
    return res.status(201).json({ success: true, policy });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Admin create policy error:', error);
    return res.status(500).json({ success: false, message: 'Unable to save project policy' });
  } finally {
    client.release();
  }
}

module.exports = { getCurrentPolicy, getMySubsidy, adminListPolicies, adminCreatePolicy };
