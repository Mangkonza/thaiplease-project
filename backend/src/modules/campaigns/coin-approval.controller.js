const db = require('../../config/db');
const { writeAudit } = require('../shared/audit');
const { UUID_PATTERN } = require('../../middlewares/shop.middleware');
const { COIN_TEMPLATES } = require('../budget/budget.service');

// ร้านส่งแคมเปญแจกเหรียญฉบับร่างให้ Admin อนุมัติ (D-18) ต้องผ่าน verifyCampaignAccess ก่อน
async function requestCoinApproval(req, res) {
  try {
    const updated = await db.query(
      `UPDATE campaigns c SET coin_approval_status = 'PENDING', coin_approval_note = NULL,
         coin_approved_by = NULL, coin_approved_at = NULL, updated_at = NOW()
       FROM promotion_templates t
       WHERE c.campaign_id = $1 AND t.template_id = c.template_id AND t.code = ANY($2::text[])
         AND c.status = 'DRAFT' AND (c.coin_approval_status IS NULL OR c.coin_approval_status = 'REJECTED')
       RETURNING c.campaign_id, c.coin_approval_status`,
      [req.params.campaignId, COIN_TEMPLATES]
    );
    if (!updated.rows.length) {
      return res.status(409).json({
        success: false,
        message: 'Only draft coin campaigns that are not already pending or approved can be sent for approval',
      });
    }
    return res.json({ success: true, campaign: updated.rows[0] });
  } catch (error) {
    console.error('Request coin approval error:', error);
    return res.status(500).json({ success: false, message: 'Unable to request approval' });
  }
}

async function adminListCoinApprovals(req, res) {
  try {
    const result = await db.query(
      `SELECT c.campaign_id, c.name, c.parameters, c.start_at, c.end_at, c.treatment_ratio, c.updated_at,
         c.coin_approval_status, t.code AS template_code, t.name AS template_name, s.shop_id, s.name AS shop_name
       FROM campaigns c
       JOIN promotion_templates t ON t.template_id = c.template_id
       JOIN shops s ON s.shop_id = c.shop_id
       WHERE c.coin_approval_status = 'PENDING' AND c.status = 'DRAFT'
       ORDER BY c.updated_at ASC`
    );
    return res.json({ success: true, campaigns: result.rows });
  } catch (error) {
    console.error('Admin list coin approvals error:', error);
    return res.status(500).json({ success: false, message: 'Unable to load campaign approvals' });
  }
}

async function adminDecideCoinApproval(req, res) {
  const { campaignId } = req.params;
  const { decision } = req.body || {};
  const note = typeof req.body?.note === 'string' && req.body.note.trim() ? req.body.note.trim().slice(0, 500) : null;
  if (!UUID_PATTERN.test(campaignId || '') || !['APPROVE', 'REJECT'].includes(decision)) {
    return res.status(400).json({ success: false, message: 'decision must be APPROVE or REJECT' });
  }
  if (decision === 'REJECT' && !note) return res.status(400).json({ success: false, message: 'A note is required to reject' });
  const status = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const updated = await client.query(
      `UPDATE campaigns SET coin_approval_status = $2, coin_approval_note = $3, coin_approved_by = $4, coin_approved_at = NOW()
       WHERE campaign_id = $1 AND coin_approval_status = 'PENDING' AND status = 'DRAFT'
       RETURNING campaign_id, shop_id, name, coin_approval_status`,
      [campaignId, status, note, req.user.user_id]
    );
    if (!updated.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'This campaign is not waiting for approval' });
    }
    await writeAudit(client, {
      actorId: req.user.user_id, action: `COIN_CAMPAIGN_${status}`, entityType: 'campaign', entityId: campaignId,
      detail: { shop_id: updated.rows[0].shop_id, name: updated.rows[0].name, note },
    });
    await client.query('COMMIT');
    return res.json({ success: true, campaign: updated.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Admin decide coin approval error:', error);
    return res.status(500).json({ success: false, message: 'Unable to save the decision' });
  } finally {
    client.release();
  }
}

module.exports = { requestCoinApproval, adminListCoinApprovals, adminDecideCoinApproval };
