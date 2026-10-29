const db = require('../../config/db');
const { writeAudit } = require('../shared/audit');
const { UUID_PATTERN } = require('../../middlewares/shop.middleware');
const {
  REFUND_WINDOW_DAYS, SHOP_DECISION_DAYS, CASE_TYPES, isWithinRefundWindow, adminCanDecide, readText, refundPayment,
} = require('./case.service');

const CASE_COLUMNS = `c.case_id, c.case_type, c.user_id, c.payment_id, c.shop_id, c.reason, c.status,
  c.decided_by, c.decided_at, c.decision_note, c.created_at, s.name AS shop_name,
  p.gross_amount, p.citizen_paid, p.status AS payment_status, p.paid_at`;

async function createCase(req, res) {
  const { case_type: caseType, payment_id: paymentId } = req.body || {};
  const reason = readText(req.body && req.body.reason);
  if (!CASE_TYPES.includes(caseType) || !UUID_PATTERN.test(paymentId || '') || !reason) {
    return res.status(400).json({
      success: false,
      message: 'case_type (REFUND or COMPLAINT), payment_id and a reason of up to 500 characters are required',
    });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query(
      'SELECT payment_id, shop_id, status, paid_at FROM payments WHERE payment_id = $1 AND user_id = $2 FOR UPDATE',
      [paymentId, req.user.user_id]
    );
    const payment = found.rows[0];
    let refusal = null;
    if (!payment) refusal = { status: 404, message: 'Payment not found' };
    else if (caseType === 'REFUND' && payment.status !== 'SUCCESS') refusal = { status: 409, message: 'Only successful payments can be refunded' };
    else if (caseType === 'REFUND' && !isWithinRefundWindow(payment.paid_at)) {
      refusal = { status: 409, message: `Refunds must be requested within ${REFUND_WINDOW_DAYS} days of payment` };
    }
    if (refusal) {
      await client.query('ROLLBACK');
      return res.status(refusal.status).json({ success: false, message: refusal.message });
    }

    const inserted = await client.query(
      `INSERT INTO case_requests (case_type, user_id, payment_id, shop_id, reason)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [caseType, req.user.user_id, paymentId, payment.shop_id, reason]
    );
    await client.query('COMMIT');
    return res.status(201).json({ success: true, case: inserted.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') {
      return res.status(409).json({ success: false, message: 'This payment already has an open request of this type' });
    }
    console.error('Create case error:', error);
    return res.status(500).json({ success: false, message: 'Unable to create request' });
  } finally {
    client.release();
  }
}

async function listMyCases(req, res) {
  try {
    const result = await db.query(
      `SELECT ${CASE_COLUMNS} FROM case_requests c
       JOIN shops s ON s.shop_id = c.shop_id JOIN payments p ON p.payment_id = c.payment_id
       WHERE c.user_id = $1 ORDER BY c.created_at DESC LIMIT 100`,
      [req.user.user_id]
    );
    return res.json({ success: true, cases: result.rows });
  } catch (error) {
    console.error('List my cases error:', error);
    return res.status(500).json({ success: false, message: 'Unable to load requests' });
  }
}

async function listShopRefunds(req, res) {
  try {
    const result = await db.query(
      `SELECT ${CASE_COLUMNS}, u.display_name AS citizen_name FROM case_requests c
       JOIN shops s ON s.shop_id = c.shop_id JOIN payments p ON p.payment_id = c.payment_id
       JOIN users u ON u.user_id = c.user_id
       WHERE c.shop_id = $1 AND c.case_type = 'REFUND'
       ORDER BY (c.status = 'PENDING') DESC, c.created_at DESC LIMIT 100`,
      [req.params.shopId]
    );
    return res.json({ success: true, cases: result.rows, shop_decision_days: SHOP_DECISION_DAYS });
  } catch (error) {
    console.error('List shop refunds error:', error);
    return res.status(500).json({ success: false, message: 'Unable to load refund requests' });
  }
}

async function listAllCases(req, res) {
  const { status } = req.query;
  if (status && !['PENDING', 'APPROVED', 'REJECTED', 'RESOLVED'].includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid case status filter' });
  }
  try {
    const result = await db.query(
      `SELECT ${CASE_COLUMNS}, u.display_name AS citizen_name FROM case_requests c
       JOIN shops s ON s.shop_id = c.shop_id JOIN payments p ON p.payment_id = c.payment_id
       JOIN users u ON u.user_id = c.user_id
       WHERE ($1::text IS NULL OR c.status = $1)
       ORDER BY (c.status = 'PENDING') DESC, c.created_at ASC LIMIT 200`,
      [status || null]
    );
    const now = new Date();
    const cases = result.rows.map((row) => ({ ...row, admin_can_decide: row.status === 'PENDING' && adminCanDecide(row, now) }));
    return res.json({ success: true, cases, shop_decision_days: SHOP_DECISION_DAYS });
  } catch (error) {
    console.error('Admin list cases error:', error);
    return res.status(500).json({ success: false, message: 'Unable to load requests' });
  }
}

// decision: APPROVE / REJECT สำหรับคืนเงิน, RESOLVE สำหรับเรื่องร้องเรียน; ปฏิเสธหรือปิดเรื่องต้องมีเหตุผล
async function decide(req, res, { asAdmin }) {
  const { caseId } = req.params;
  const { decision } = req.body || {};
  const note = readText(req.body && req.body.note);
  if (!UUID_PATTERN.test(caseId || '') || !['APPROVE', 'REJECT', 'RESOLVE'].includes(decision)) {
    return res.status(400).json({ success: false, message: 'decision must be APPROVE, REJECT or RESOLVE' });
  }
  if (decision !== 'APPROVE' && !note) {
    return res.status(400).json({ success: false, message: 'A note of up to 500 characters is required to reject or resolve' });
  }

  const client = await db.pool.connect();
  const fail = async (status, message) => {
    await client.query('ROLLBACK');
    return res.status(status).json({ success: false, message });
  };
  try {
    await client.query('BEGIN');
    const found = await client.query('SELECT * FROM case_requests WHERE case_id = $1 FOR UPDATE', [caseId]);
    const caseRow = found.rows[0];
    if (!caseRow || (!asAdmin && (caseRow.shop_id !== req.params.shopId || caseRow.case_type !== 'REFUND'))) {
      return await fail(404, 'Request not found');
    }
    if (caseRow.status !== 'PENDING') return await fail(409, 'This request has already been decided');
    const expected = caseRow.case_type === 'REFUND' ? ['APPROVE', 'REJECT'] : ['RESOLVE'];
    if (!expected.includes(decision)) return await fail(400, `decision for a ${caseRow.case_type} must be ${expected.join(' or ')}`);
    if (asAdmin && !adminCanDecide(caseRow)) {
      return await fail(409, `The shop has ${SHOP_DECISION_DAYS} days to decide a refund before an admin can`);
    }

    let refund = null;
    if (decision === 'APPROVE') {
      const result = await refundPayment(client, caseRow.payment_id);
      if (result.error) return await fail(result.error.status, result.error.message);
      refund = result.refund;
    }
    const status = { APPROVE: 'APPROVED', REJECT: 'REJECTED', RESOLVE: 'RESOLVED' }[decision];
    const updated = await client.query(
      `UPDATE case_requests SET status = $2, decided_by = $3, decided_at = now(), decision_note = $4
       WHERE case_id = $1 RETURNING *`,
      [caseId, status, req.user.user_id, note]
    );
    await writeAudit(client, {
      actorId: req.user.user_id,
      action: `${caseRow.case_type}_${status}`,
      entityType: 'case_request',
      entityId: caseId,
      detail: { payment_id: caseRow.payment_id, shop_id: caseRow.shop_id, note, by_admin: asAdmin, refund },
    });
    await client.query('COMMIT');
    return res.json({ success: true, case: updated.rows[0], refund });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Decide case error:', error);
    return res.status(500).json({ success: false, message: 'Unable to save the decision' });
  } finally {
    client.release();
  }
}

const decideAsShop = (req, res) => decide(req, res, { asAdmin: false });
const decideAsAdmin = (req, res) => decide(req, res, { asAdmin: true });

module.exports = { createCase, listMyCases, listShopRefunds, listAllCases, decideAsShop, decideAsAdmin };
