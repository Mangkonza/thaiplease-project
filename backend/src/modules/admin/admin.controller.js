const db = require('../../config/db');
const { writeAudit } = require('../shared/audit');
const { UUID_PATTERN } = require('../../middlewares/shop.middleware');

async function listShops(req, res) {
  const status = req.query.status;
  if (status && !['PENDING', 'ACTIVE', 'SUSPENDED'].includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid shop status filter' });
  }
  try {
    const result = await db.query(
      `SELECT s.*, u.display_name AS owner_name, u.email AS owner_email
       FROM shops s JOIN users u ON u.user_id = s.owner_id
       WHERE ($1::shop_status IS NULL OR s.status = $1)
       ORDER BY s.created_at DESC`,
      [status || null]
    );
    return res.json({ success: true, shops: result.rows });
  } catch (error) {
    console.error('Admin list shops error:', error);
    return res.status(500).json({ success: false, message: 'Unable to load shops' });
  }
}

async function updateShopStatus(req, res) {
  const { shopId } = req.params;
  const { status, reason } = req.body;
  if (!UUID_PATTERN.test(shopId)) {
    return res.status(400).json({ success: false, message: 'Shop ID must be a valid UUID' });
  }
  if (!['ACTIVE', 'SUSPENDED'].includes(status)) {
    return res.status(400).json({ success: false, message: 'Status must be ACTIVE or SUSPENDED' });
  }
  if (status === 'SUSPENDED' && (typeof reason !== 'string' || !reason.trim())) {
    return res.status(400).json({ success: false, message: 'A reason is required when rejecting a shop' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const updated = await client.query(
      `UPDATE shops SET status = $2, updated_at = NOW()
       WHERE shop_id = $1 AND status = 'PENDING' RETURNING *`,
      [shopId, status]
    );
    if (!updated.rows.length) {
      const exists = await client.query('SELECT shop_id FROM shops WHERE shop_id = $1', [shopId]);
      await client.query('ROLLBACK');
      return res.status(exists.rows.length ? 409 : 404).json({
        success: false,
        message: exists.rows.length ? 'Only pending shops can be reviewed' : 'Shop not found',
      });
    }
    await writeAudit(client, {
      actorId: req.user.user_id,
      action: status === 'ACTIVE' ? 'SHOP_APPROVED' : 'SHOP_REJECTED',
      entityType: 'shop',
      entityId: shopId,
      detail: { status, reason: reason ? reason.trim() : null },
    });
    await client.query('COMMIT');
    return res.json({ success: true, shop: updated.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Admin update shop status error:', error);
    return res.status(500).json({ success: false, message: 'Unable to update shop status' });
  } finally {
    client.release();
  }
}

async function listAuditLogs(req, res) {
  const parsedLimit = Number(req.query.limit || 50);
  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
    return res.status(400).json({ success: false, message: 'limit must be an integer between 1 and 100' });
  }
  try {
    const result = await db.query(
      `SELECT audit_id, actor_id, action, entity_type, entity_id, detail, created_at
       FROM audit_logs ORDER BY created_at DESC LIMIT $1`,
      [parsedLimit]
    );
    return res.json({ success: true, audit_logs: result.rows });
  } catch (error) {
    console.error('Admin list audit logs error:', error);
    return res.status(500).json({ success: false, message: 'Unable to load audit logs' });
  }
}

module.exports = { listShops, updateShopStatus, listAuditLogs };
