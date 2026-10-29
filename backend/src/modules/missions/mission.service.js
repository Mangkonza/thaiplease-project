// ร้านใหม่ = ร้านที่ไม่เคยมีรายการ SUCCESS ก่อนกดรับภารกิจ นับร้านไม่ซ้ำในช่วง accepted_at..deadline_at
const PROGRESS_SQL = `SELECT COUNT(DISTINCT p.shop_id)::integer AS progress
  FROM payments p
  WHERE p.user_id = $1 AND p.status = 'SUCCESS' AND p.paid_at >= $2 AND p.paid_at <= $3
    AND NOT EXISTS (
      SELECT 1 FROM payments q
      WHERE q.user_id = $1 AND q.shop_id = p.shop_id AND q.status = 'SUCCESS' AND q.paid_at < $2)`;

async function countProgress(queryable, enrollment) {
  const result = await queryable.query(PROGRESS_SQL, [enrollment.user_id, enrollment.accepted_at, enrollment.deadline_at]);
  return result.rows[0].progress;
}

function enrollmentStatus(enrollment, now = new Date()) {
  if (enrollment.status === 'COMPLETED') return 'COMPLETED';
  return new Date(enrollment.deadline_at) < now ? 'EXPIRED' : 'IN_PROGRESS';
}

// เรียกใน transaction การจ่ายเงิน หลังบันทึก payment แล้ว (แถว users ของผู้จ่ายถูกล็อกอยู่)
// ภารกิจที่ครบด้วยรายการนี้ได้เหรียญ ผูก payment_id ไว้ เพื่อให้การคืนเงินหักคืนได้
async function completeMissions(client, { userId, paymentId, paidAt }) {
  const open = await client.query(
    `SELECT e.enrollment_id, e.user_id, e.accepted_at, e.deadline_at, m.target_count, m.reward_coins, m.title
     FROM mission_enrollments e JOIN missions m ON m.mission_id = e.mission_id
     WHERE e.user_id = $1 AND e.status = 'IN_PROGRESS' AND e.accepted_at <= $2 AND e.deadline_at >= $2
     FOR UPDATE OF e`,
    [userId, paidAt]
  );
  const completed = [];
  for (const enrollment of open.rows) {
    if (await countProgress(client, enrollment) < enrollment.target_count) continue;
    await client.query(
      `UPDATE mission_enrollments SET status = 'COMPLETED', completed_at = $2, reward_payment_id = $3
       WHERE enrollment_id = $1`,
      [enrollment.enrollment_id, paidAt, paymentId]
    );
    await client.query(
      `INSERT INTO coin_ledger (user_id, payment_id, amount, reason) VALUES ($1, $2, $3, 'MISSION_REWARD')`,
      [userId, paymentId, enrollment.reward_coins]
    );
    completed.push({ enrollment_id: enrollment.enrollment_id, title: enrollment.title, reward_coins: enrollment.reward_coins });
  }
  return completed;
}

// เรียกตอนคืนเงิน: ภารกิจที่ครบด้วยรายการนี้กลับไปทำต่อ (เหรียญถูกหักพร้อมเหรียญอื่นของรายการ)
async function reopenMissionsForRefund(client, paymentId) {
  await client.query(
    `UPDATE mission_enrollments SET status = 'IN_PROGRESS', completed_at = NULL, reward_payment_id = NULL
     WHERE reward_payment_id = $1`,
    [paymentId]
  );
}

const isIntegerBetween = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;

function validateMissionInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return ['body must be an object'];
  const errors = [];
  if (typeof input.title !== 'string' || !input.title.trim() || input.title.trim().length > 200) {
    errors.push('title must be text up to 200 characters');
  }
  if (input.description !== undefined && input.description !== null &&
      (typeof input.description !== 'string' || input.description.length > 1000)) {
    errors.push('description must be text up to 1000 characters');
  }
  if (!isIntegerBetween(input.target_count, 1, 50)) errors.push('target_count must be an integer between 1 and 50');
  if (!isIntegerBetween(input.window_days, 1, 365)) errors.push('window_days must be an integer between 1 and 365');
  if (!isIntegerBetween(input.reward_coins, 1, 100000)) errors.push('reward_coins must be an integer between 1 and 100000');
  return errors;
}

module.exports = { countProgress, enrollmentStatus, completeMissions, reopenMissionsForRefund, validateMissionInput };
