const crypto = require('node:crypto');
const db = require('../../config/db');
const { writeAudit } = require('../shared/audit');
const { validateCampaignParameters } = require('./campaign.service');
const { evaluateCampaign } = require('./campaign.metrics');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sendError(res, error, label) {
  if (error.status) return res.status(error.status).json({ success: false, message: error.message });
  console.error(`${label}:`, error);
  return res.status(500).json({ success: false, message: 'Unable to process campaign request' });
}

async function verifyCampaignAccess(req, res, next) {
  const { campaignId } = req.params;
  if (!UUID_PATTERN.test(campaignId)) {
    return res.status(400).json({ success: false, message: 'Campaign ID must be a valid UUID' });
  }
  try {
    const result = await db.query(
      `SELECT c.shop_id, s.owner_id
       FROM campaigns c JOIN shops s ON s.shop_id = c.shop_id
       WHERE c.campaign_id = $1`,
      [campaignId]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Campaign not found' });
    if (req.user.role !== 'ADMIN' && result.rows[0].owner_id !== req.user.user_id) {
      return res.status(403).json({ success: false, message: 'Forbidden: You do not own this campaign' });
    }
    req.campaignShopId = result.rows[0].shop_id;
    return next();
  } catch (error) {
    console.error('Verify campaign access error:', error);
    return res.status(500).json({ success: false, message: 'Unable to verify campaign access' });
  }
}

async function selectSuggestion(req, res) {
  const { suggestionId } = req.params;
  const { shop_id: shopId } = req.body;
  if (!UUID_PATTERN.test(suggestionId)) {
    return res.status(400).json({ success: false, message: 'Suggestion ID must be a valid UUID' });
  }
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const suggestion = await client.query(
      `SELECT a.suggestion_id, a.report_id, a.template_id, a.parameters, a.target_kpi,
              a.status, r.shop_id
       FROM ai_suggestions a JOIN ai_reports r ON r.report_id = a.report_id
       WHERE a.suggestion_id = $1 FOR UPDATE OF r, a`,
      [suggestionId]
    );
    if (!suggestion.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'AI suggestion not found' });
    }
    if (suggestion.rows[0].shop_id !== shopId) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, message: 'Suggestion does not belong to this shop' });
    }
    if (suggestion.rows[0].status !== 'PROPOSED') {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'Suggestion is no longer available' });
    }
    const alreadySelected = await client.query(
      `SELECT suggestion_id FROM ai_suggestions
       WHERE report_id = $1 AND status = 'SELECTED'`,
      [suggestion.rows[0].report_id]
    );
    if (alreadySelected.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'An AI suggestion has already been selected for this report' });
    }
    const updated = await client.query(
      `UPDATE ai_suggestions SET status = 'SELECTED'
       WHERE suggestion_id = $1 RETURNING *`,
      [suggestionId]
    );
    await client.query(
      `UPDATE ai_suggestions SET status = 'REJECTED'
       WHERE report_id = $1 AND suggestion_id <> $2 AND status = 'PROPOSED'`,
      [suggestion.rows[0].report_id, suggestionId]
    );
    await writeAudit(client, {
      actorId: req.user.user_id,
      action: 'AI_SUGGESTION_SELECTED',
      entityType: 'ai_suggestion',
      entityId: suggestionId,
      detail: { shop_id: shopId },
    });
    await client.query('COMMIT');
    return res.json({ success: true, suggestion: updated.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    return sendError(res, error, 'Select AI suggestion error');
  } finally {
    client.release();
  }
}

async function createCampaign(req, res) {
  const { shop_id: shopId, suggestion_id: suggestionId, name, parameters, start_at: startAt,
    end_at: endAt, treatment_ratio: treatmentRatio = 0.5 } = req.body;
  if (!UUID_PATTERN.test(shopId || '') || !name || typeof name !== 'string' || name.length > 150 ||
      !startAt || !endAt || !Number.isFinite(Number(treatmentRatio)) ||
      Number(treatmentRatio) < 0 || Number(treatmentRatio) > 1 ||
      new Date(startAt).toString() === 'Invalid Date' || new Date(endAt).toString() === 'Invalid Date' ||
      new Date(startAt) >= new Date(endAt)) {
    return res.status(400).json({ success: false, message: 'Valid shop, name, dates, and treatment_ratio are required' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    let source;
    if (suggestionId) {
      const selected = await client.query(
        `SELECT a.*, t.parameter_schema, r.shop_id
         FROM ai_suggestions a
         JOIN ai_reports r ON r.report_id = a.report_id
         JOIN promotion_templates t ON t.template_id = a.template_id
         WHERE a.suggestion_id = $1 FOR UPDATE OF a`,
        [suggestionId]
      );
      if (!selected.rows.length) throw Object.assign(new Error('AI suggestion not found'), { status: 404 });
      source = selected.rows[0];
      if (source.shop_id !== shopId) throw Object.assign(new Error('Suggestion belongs to another shop'), { status: 403 });
      if (source.status !== 'SELECTED') throw Object.assign(new Error('Select the AI suggestion before creating a campaign'), { status: 409 });
      const existingCampaign = await client.query(
        'SELECT campaign_id FROM campaigns WHERE suggestion_id = $1',
        [suggestionId]
      );
      if (existingCampaign.rows.length) {
        throw Object.assign(new Error('A campaign has already been created from this suggestion'), { status: 409 });
      }
    } else {
      throw Object.assign(new Error('Campaigns must start from an AI suggestion'), { status: 400 });
    }

    const campaignParameters = parameters || source.parameters;
    validateCampaignParameters(campaignParameters, source.parameter_schema);
    const result = await client.query(
      `INSERT INTO campaigns
         (shop_id, suggestion_id, template_id, name, parameters, target_kpi,
          treatment_ratio, start_at, end_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'DRAFT')
       RETURNING *`,
      [shopId, suggestionId, source.template_id, name, JSON.stringify(campaignParameters),
        source.target_kpi, Number(treatmentRatio), startAt, endAt]
    );
    await writeAudit(client, {
      actorId: req.user.user_id,
      action: 'CAMPAIGN_CREATED',
      entityType: 'campaign',
      entityId: result.rows[0].campaign_id,
      detail: { shop_id: shopId, suggestion_id: suggestionId },
    });
    await client.query('COMMIT');
    return res.status(201).json({ success: true, campaign: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    return sendError(res, error, 'Create campaign error');
  } finally {
    client.release();
  }
}

async function updateCampaign(req, res) {
  const { name, parameters, start_at: startAt, end_at: endAt, treatment_ratio: treatmentRatio } = req.body;
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query(
      `SELECT c.*, t.parameter_schema FROM campaigns c
       JOIN promotion_templates t ON t.template_id = c.template_id
       WHERE c.campaign_id = $1 FOR UPDATE OF c`,
      [req.params.campaignId]
    );
    if (!current.rows.length) throw Object.assign(new Error('Campaign not found'), { status: 404 });
    if (current.rows[0].status !== 'DRAFT') {
      throw Object.assign(new Error('Only draft campaigns can be edited'), { status: 409 });
    }
    const nextParameters = parameters === undefined ? current.rows[0].parameters : parameters;
    validateCampaignParameters(nextParameters, current.rows[0].parameter_schema);
    const nextName = name === undefined ? current.rows[0].name : name;
    const nextStart = startAt === undefined ? current.rows[0].start_at : startAt;
    const nextEnd = endAt === undefined ? current.rows[0].end_at : endAt;
    const nextRatio = treatmentRatio === undefined ? current.rows[0].treatment_ratio : Number(treatmentRatio);
    if (typeof nextName !== 'string' || !nextName.trim() || nextName.length > 150 ||
        !nextStart || !nextEnd || Number.isNaN(new Date(nextStart).getTime()) ||
        Number.isNaN(new Date(nextEnd).getTime()) || new Date(nextStart) >= new Date(nextEnd) ||
        !Number.isFinite(nextRatio) || nextRatio < 0 || nextRatio > 1) {
      throw Object.assign(new Error('Invalid campaign settings'), { status: 400 });
    }
    const updated = await client.query(
      `UPDATE campaigns
       SET name = $2, parameters = $3, start_at = $4, end_at = $5,
           treatment_ratio = $6, updated_at = NOW()
       WHERE campaign_id = $1 AND status = 'DRAFT'
       RETURNING *`,
      [req.params.campaignId, nextName, JSON.stringify(nextParameters), nextStart, nextEnd, nextRatio]
    );
    await writeAudit(client, {
      actorId: req.user.user_id,
      action: 'CAMPAIGN_UPDATED',
      entityType: 'campaign',
      entityId: req.params.campaignId,
      detail: { name: nextName },
    });
    await client.query('COMMIT');
    return res.json({ success: true, campaign: updated.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    return sendError(res, error, 'Update campaign error');
  } finally {
    client.release();
  }
}

async function activateCampaign(req, res) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const locked = await client.query(
      'SELECT shop_id, status FROM shops WHERE shop_id = $1 FOR UPDATE',
      [req.campaignShopId]
    );
    if (!locked.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Shop not found' });
    }
    if (locked.rows[0].status !== 'ACTIVE') {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'Only active shops can run campaigns' });
    }
    const current = await client.query(
      'SELECT * FROM campaigns WHERE campaign_id = $1 FOR UPDATE',
      [req.params.campaignId]
    );
    if (!current.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Campaign not found' });
    }
    if (current.rows[0].status !== 'DRAFT') {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'Only draft campaigns can be activated' });
    }
    const active = await client.query(
      `SELECT campaign_id FROM campaigns
       WHERE shop_id = $1 AND status = 'ACTIVE' AND campaign_id <> $2`,
      [req.campaignShopId, req.params.campaignId]
    );
    if (active.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'This shop already has an active campaign' });
    }

    const citizens = await client.query(
      `SELECT user_id FROM users WHERE role = 'CITIZEN' AND status = 'ACTIVE'
       ORDER BY user_id`
    );
    const campaignId = req.params.campaignId;
    for (const citizen of citizens.rows) {
      const hash = crypto.createHash('sha256').update(`${citizen.user_id}${campaignId}`).digest();
      const value = hash.readUInt32BE(0) / 0x100000000;
      const group = value < Number(current.rows[0].treatment_ratio) ? 'TREATMENT' : 'CONTROL';
      await client.query(
        `INSERT INTO campaign_assignments (campaign_id, user_id, group_type)
         VALUES ($1, $2, $3) ON CONFLICT (campaign_id, user_id) DO NOTHING`,
        [campaignId, citizen.user_id, group]
      );
    }
    const updated = await client.query(
      `UPDATE campaigns SET status = 'ACTIVE', activated_at = NOW(), updated_at = NOW()
       WHERE campaign_id = $1 RETURNING *`,
      [campaignId]
    );
    await writeAudit(client, {
      actorId: req.user.user_id, action: 'CAMPAIGN_ACTIVATED',
      entityType: 'campaign', entityId: campaignId, detail: { assignment_count: citizens.rows.length },
    });
    await client.query('COMMIT');
    return res.json({ success: true, campaign: updated.rows[0], assigned_users: citizens.rows.length });
  } catch (error) {
    await client.query('ROLLBACK');
    return sendError(res, error, 'Activate campaign error');
  } finally {
    client.release();
  }
}

async function endCampaign(req, res) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const updated = await client.query(
      `UPDATE campaigns SET status = 'ENDED', updated_at = NOW()
       WHERE campaign_id = $1 AND status = 'ACTIVE' RETURNING *`,
      [req.params.campaignId]
    );
    if (!updated.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'Only active campaigns can be ended' });
    }
    await writeAudit(client, {
      actorId: req.user.user_id, action: 'CAMPAIGN_ENDED',
      entityType: 'campaign', entityId: req.params.campaignId, detail: {},
    });
    await client.query('COMMIT');
    return res.json({ success: true, campaign: updated.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    return sendError(res, error, 'End campaign error');
  } finally {
    client.release();
  }
}

async function evaluate(req, res) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT c.*, t.code AS template_code
       FROM campaigns c JOIN promotion_templates t ON t.template_id = c.template_id
       WHERE c.campaign_id = $1`,
      [req.params.campaignId]
    );
    if (!result.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Campaign not found' });
    }
    const campaign = result.rows[0];
    if (campaign.status !== 'ENDED') {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'End the campaign before evaluating it' });
    }
    const assignments = await client.query(
      'SELECT user_id, group_type FROM campaign_assignments WHERE campaign_id = $1',
      [req.params.campaignId]
    );
    const users = assignments.rows.map((item) => item.user_id);
    const payments = await client.query(
      `SELECT user_id, paid_at, net_amount, status
       FROM payments WHERE shop_id = $1 AND user_id = ANY($2::uuid[])
         AND paid_at <= $3`,
      [campaign.shop_id, users, campaign.end_at]
    );
    const redemptions = await client.query(
      'SELECT COUNT(*)::integer AS count FROM promotion_redemptions WHERE campaign_id = $1',
      [req.params.campaignId]
    );
    const metrics = evaluateCampaign({
      campaign,
      assignments: assignments.rows,
      payments: payments.rows,
      redemptions: redemptions.rows[0].count,
    });
    const saved = await client.query(
      `INSERT INTO campaign_results
         (campaign_id, baseline_metric, treatment_metric, control_metric, uplift,
          sample_size, treatment_size, control_size, redemption_count, result_status, explanation)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (campaign_id) DO UPDATE SET
         baseline_metric = EXCLUDED.baseline_metric,
         treatment_metric = EXCLUDED.treatment_metric,
         control_metric = EXCLUDED.control_metric,
         uplift = EXCLUDED.uplift,
         sample_size = EXCLUDED.sample_size,
         treatment_size = EXCLUDED.treatment_size,
         control_size = EXCLUDED.control_size,
         redemption_count = EXCLUDED.redemption_count,
         result_status = EXCLUDED.result_status,
         explanation = EXCLUDED.explanation,
         evaluated_at = NOW()
       RETURNING *`,
      [req.params.campaignId, metrics.baseline_metric, metrics.treatment_metric, metrics.control_metric,
        metrics.uplift, metrics.sample_size, metrics.treatment_size, metrics.control_size,
        metrics.redemption_count, metrics.result_status, metrics.explanation]
    );
    await writeAudit(client, {
      actorId: req.user.user_id,
      action: 'CAMPAIGN_EVALUATED',
      entityType: 'campaign',
      entityId: req.params.campaignId,
      detail: { result_status: metrics.result_status },
    });
    await client.query('COMMIT');
    return res.json({ success: true, result: saved.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    return sendError(res, error, 'Evaluate campaign error');
  } finally {
    client.release();
  }
}

async function getCampaign(req, res) {
  try {
    const result = await db.query(
      `SELECT c.*, t.code AS template_code, t.name AS template_name,
              r.result_status, r.uplift, r.explanation
       FROM campaigns c
       JOIN promotion_templates t ON t.template_id = c.template_id
       LEFT JOIN campaign_results r ON r.campaign_id = c.campaign_id
       WHERE c.campaign_id = $1`,
      [req.params.campaignId]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Campaign not found' });
    return res.json({ success: true, campaign: result.rows[0] });
  } catch (error) {
    return sendError(res, error, 'Get campaign error');
  }
}

async function getCampaignResult(req, res) {
  try {
    const result = await db.query(
      `SELECT c.campaign_id, c.name, c.status, r.*
       FROM campaigns c LEFT JOIN campaign_results r ON r.campaign_id = c.campaign_id
       WHERE c.campaign_id = $1`,
      [req.params.campaignId]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Campaign not found' });
    if (!result.rows[0].result_id) return res.status(404).json({ success: false, message: 'Campaign has not been evaluated' });
    return res.json({ success: true, result: result.rows[0] });
  } catch (error) {
    return sendError(res, error, 'Get campaign result error');
  }
}

async function getShopCampaigns(req, res) {
  try {
    const result = await db.query(
      `SELECT c.*, t.name AS template_name, r.result_status, r.uplift
       FROM campaigns c JOIN promotion_templates t ON t.template_id = c.template_id
       LEFT JOIN campaign_results r ON r.campaign_id = c.campaign_id
       WHERE c.shop_id = $1 ORDER BY c.created_at DESC`,
      [req.params.shopId]
    );
    return res.json({ success: true, campaigns: result.rows });
  } catch (error) {
    return sendError(res, error, 'List shop campaigns error');
  }
}

module.exports = {
  selectSuggestion, createCampaign, updateCampaign, activateCampaign, endCampaign,
  evaluate, getCampaign, getCampaignResult, getShopCampaigns, verifyCampaignAccess,
};
