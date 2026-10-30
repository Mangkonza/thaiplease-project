const db = require('../../config/db');
const { writeAudit } = require('../shared/audit');
const { UUID_PATTERN } = require('../../middlewares/shop.middleware');
const { countProgress, enrollmentStatus, missionTarget, validateMissionInput } = require('./mission.service');

const MISSION_COLUMNS = `m.mission_id, m.mission_type, m.title, m.description, m.target_count, m.target_amount, m.shop_id,
  ts.name AS shop_name, m.window_days, m.reward_type, m.reward_coins, m.reward_coupon_value, m.reward_coupon_min_spend,
  m.reward_coupon_days, m.reward_shop_id, rs.name AS reward_shop_name`;
const MISSION_JOINS = `LEFT JOIN shops ts ON ts.shop_id = m.shop_id
  LEFT JOIN shops rs ON rs.shop_id = m.reward_shop_id`;

const normalizeMission = (row) => ({
  ...row,
  target_amount: row.target_amount === null ? null : Number(row.target_amount),
  reward_coupon_value: row.reward_coupon_value === null ? null : Number(row.reward_coupon_value),
  reward_coupon_min_spend: row.reward_coupon_min_spend === null ? null : Number(row.reward_coupon_min_spend),
});

// ภารกิจที่เปิดอยู่ และภารกิจที่เคยรับแล้ว (แม้ปิดไปแล้ว) พร้อมความคืบหน้า
async function listMyMissions(req, res) {
  try {
    const result = await db.query(
      `SELECT ${MISSION_COLUMNS}, m.status AS mission_status,
         e.enrollment_id, e.user_id, e.status, e.accepted_at, e.deadline_at, e.completed_at
       FROM missions m
       ${MISSION_JOINS}
       LEFT JOIN mission_enrollments e ON e.mission_id = m.mission_id AND e.user_id = $1
       WHERE m.status = 'ACTIVE' OR e.enrollment_id IS NOT NULL
       ORDER BY e.accepted_at DESC NULLS FIRST, m.created_at DESC`,
      [req.user.user_id]
    );
    const now = new Date();
    const missions = await Promise.all(result.rows.map(async (row) => {
      const { enrollment_id: enrollmentId, user_id: userId, status, accepted_at: acceptedAt, deadline_at: deadlineAt, completed_at: completedAt, ...rest } = row;
      const mission = normalizeMission(rest);
      if (!enrollmentId) return { ...mission, enrollment: null };
      const enrollment = { enrollment_id: enrollmentId, user_id: userId, status, accepted_at: acceptedAt, deadline_at: deadlineAt, completed_at: completedAt };
      const target = missionTarget(mission);
      const progress = status === 'COMPLETED'
        ? target
        : await countProgress(db, { ...enrollment, mission_type: mission.mission_type, shop_id: mission.shop_id });
      return {
        ...mission,
        enrollment: { enrollment_id: enrollmentId, status: enrollmentStatus(enrollment, now), accepted_at: acceptedAt, deadline_at: deadlineAt, completed_at: completedAt, progress: Math.min(progress, target) },
      };
    }));
    return res.json({ success: true, missions });
  } catch (error) {
    console.error('List missions error:', error);
    return res.status(500).json({ success: false, message: 'Unable to load missions' });
  }
}

async function acceptMission(req, res) {
  const { missionId } = req.params;
  if (!UUID_PATTERN.test(missionId || '')) return res.status(400).json({ success: false, message: 'Mission ID must be a valid UUID' });
  try {
    const mission = await db.query('SELECT mission_id, status, window_days FROM missions WHERE mission_id = $1', [missionId]);
    if (!mission.rows.length) return res.status(404).json({ success: false, message: 'Mission not found' });
    if (mission.rows[0].status !== 'ACTIVE') return res.status(409).json({ success: false, message: 'This mission is closed' });
    const inserted = await db.query(
      `INSERT INTO mission_enrollments (mission_id, user_id, deadline_at)
       VALUES ($1, $2, now() + make_interval(days => $3))
       ON CONFLICT (mission_id, user_id) DO NOTHING RETURNING *`,
      [missionId, req.user.user_id, mission.rows[0].window_days]
    );
    if (!inserted.rows.length) return res.status(409).json({ success: false, message: 'You have already accepted this mission' });
    return res.status(201).json({ success: true, enrollment: inserted.rows[0] });
  } catch (error) {
    console.error('Accept mission error:', error);
    return res.status(500).json({ success: false, message: 'Unable to accept mission' });
  }
}

async function adminListMissions(req, res) {
  try {
    const result = await db.query(
      `SELECT ${MISSION_COLUMNS}, m.status, m.created_at, u.display_name AS created_by_name,
         COUNT(e.enrollment_id)::integer AS accepted_count,
         COUNT(e.enrollment_id) FILTER (WHERE e.status = 'COMPLETED')::integer AS completed_count
       FROM missions m
       ${MISSION_JOINS}
       LEFT JOIN users u ON u.user_id = m.created_by
       LEFT JOIN mission_enrollments e ON e.mission_id = m.mission_id
       GROUP BY m.mission_id, ts.name, rs.name, u.display_name
       ORDER BY (m.status = 'ACTIVE') DESC, m.created_at DESC`
    );
    return res.json({ success: true, missions: result.rows.map(normalizeMission) });
  } catch (error) {
    console.error('Admin list missions error:', error);
    return res.status(500).json({ success: false, message: 'Unable to load missions' });
  }
}

async function adminCreateMission(req, res) {
  const errors = validateMissionInput(req.body);
  if (errors.length) return res.status(400).json({ success: false, message: errors.join('; ') });
  const input = req.body;
  const description = typeof input.description === 'string' && input.description.trim() ? input.description.trim() : null;
  const type = input.mission_type ?? 'NEW_SHOPS';
  const rewardType = input.reward_type ?? 'COINS';
  const isSpend = type === 'SPEND_TOTAL';
  const isCoupon = rewardType === 'SHOP_COUPON';
  const shopIds = [input.shop_id, isCoupon ? input.reward_shop_id : null].filter(Boolean);
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    // ร้านที่ภารกิจอ้างถึงต้องเปิดใช้งานอยู่ ไม่อย่างนั้นประชาชนทำภารกิจหรือใช้คูปองไม่ได้
    if (shopIds.length) {
      const shops = await client.query("SELECT shop_id FROM shops WHERE shop_id = ANY($1::uuid[]) AND status = 'ACTIVE'", [shopIds]);
      if (shops.rows.length !== new Set(shopIds).size) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'shop_id and reward_shop_id must be active shops' });
      }
    }
    const inserted = await client.query(
      `INSERT INTO missions (mission_type, title, description, target_count, target_amount, shop_id, window_days,
         reward_type, reward_coins, reward_coupon_value, reward_coupon_min_spend, reward_coupon_days, reward_shop_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
      [type, input.title.trim(), description, isSpend ? null : input.target_count, isSpend ? input.target_amount : null,
        input.shop_id || null, input.window_days, rewardType, isCoupon ? null : input.reward_coins,
        isCoupon ? input.reward_coupon_value : null, isCoupon ? input.reward_coupon_min_spend : null,
        isCoupon ? input.reward_coupon_days : null, isCoupon ? input.reward_shop_id : null, req.user.user_id]
    );
    const mission = inserted.rows[0];
    await writeAudit(client, {
      actorId: req.user.user_id, action: 'MISSION_CREATED', entityType: 'mission', entityId: mission.mission_id,
      detail: { title: mission.title, mission_type: type, reward_type: rewardType, window_days: mission.window_days },
    });
    await client.query('COMMIT');
    return res.status(201).json({ success: true, mission });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Admin create mission error:', error);
    return res.status(500).json({ success: false, message: 'Unable to create mission' });
  } finally {
    client.release();
  }
}

// ปิดภารกิจ: รับเพิ่มไม่ได้ ส่วนคนที่รับไปแล้วทำต่อได้จนครบกำหนดของตัวเอง
async function adminCloseMission(req, res) {
  const { missionId } = req.params;
  if (!UUID_PATTERN.test(missionId || '')) return res.status(400).json({ success: false, message: 'Mission ID must be a valid UUID' });
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const updated = await client.query(
      `UPDATE missions SET status = 'CLOSED', closed_at = now() WHERE mission_id = $1 AND status = 'ACTIVE' RETURNING *`,
      [missionId]
    );
    if (!updated.rows.length) {
      const exists = await client.query('SELECT mission_id FROM missions WHERE mission_id = $1', [missionId]);
      await client.query('ROLLBACK');
      return res.status(exists.rows.length ? 409 : 404).json({
        success: false, message: exists.rows.length ? 'Mission is already closed' : 'Mission not found',
      });
    }
    await writeAudit(client, {
      actorId: req.user.user_id, action: 'MISSION_CLOSED', entityType: 'mission', entityId: missionId, detail: { title: updated.rows[0].title },
    });
    await client.query('COMMIT');
    return res.json({ success: true, mission: updated.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Admin close mission error:', error);
    return res.status(500).json({ success: false, message: 'Unable to close mission' });
  } finally {
    client.release();
  }
}

module.exports = { listMyMissions, acceptMission, adminListMissions, adminCreateMission, adminCloseMission };
