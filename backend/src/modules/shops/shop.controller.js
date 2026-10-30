const db = require('../../config/db');
const { UUID_PATTERN } = require('../../middlewares/shop.middleware');
const { attachMenuPreview, getMenuItems } = require('./shop-details');

// Public storefront view is limited to approved shops; the existing owner endpoint remains protected.
const getPublicShopById = async (req, res) => {
  const { shopId } = req.params;
  if (!UUID_PATTERN.test(shopId)) {
    return res.status(400).json({ success: false, message: 'Shop ID must be a valid UUID' });
  }
  try {
    const result = await db.query(
      `SELECT shop_id, name, category, area, description, status, image_path,
              address, opening_hours, latitude, longitude
       FROM shops WHERE shop_id = $1 AND status = 'ACTIVE'`,
      [shopId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Shop not found' });
    }
    return res.json({ success: true, shop: { ...result.rows[0], menu_items: await getMenuItems(shopId) } });
  } catch (error) {
    console.error('Get public shop error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// POST /api/v1/shops (สร้างร้านค้าใหม่โดย Merchant; ร้านใหม่ต้องรอ Admin อนุมัติก่อนเป็น ACTIVE)
const createShop = async (req, res) => {
  const { name, category, area, description } = req.body;
  const owner_id = req.user.user_id;

  if (!name) {
    return res.status(400).json({ success: false, message: 'Shop name is required' });
  }

  try {
    const result = await db.query(
      `INSERT INTO shops (owner_id, name, category, area, description, status)
       VALUES ($1, $2, $3, $4, $5, 'PENDING')
       RETURNING *`,
      [owner_id, name, category || null, area || null, description || null]
    );

    return res.status(201).json({
      success: true,
      message: 'Shop created and pending admin approval',
      shop: result.rows[0],
    });
  } catch (error) {
    console.error('Create shop error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// GET /api/v1/shops/:shopId (ดึงข้อมูลร้านค้าตาม ID - FR-02)
const getShopById = async (req, res) => {
  const { shopId } = req.params;

  try {
    const result = await db.query(
      `SELECT s.*, u.display_name AS owner_name, u.email AS owner_email
       FROM shops s
       JOIN users u ON s.owner_id = u.user_id
       WHERE s.shop_id = $1`,
      [shopId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Shop not found' });
    }

    return res.status(200).json({
      success: true,
      shop: { ...result.rows[0], menu_items: await getMenuItems(shopId) },
    });
  } catch (error) {
    console.error('Get shop by ID error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// GET /api/v1/shops/my (ดึงรายการร้านค้าของ Merchant ที่กำลังล็อกอิน)
const getMyShops = async (req, res) => {
  const owner_id = req.user.user_id;

  try {
    const result = await db.query(
      `SELECT s.*,
              (SELECT al.detail ->> 'reason'
               FROM audit_logs al
               WHERE al.entity_type = 'shop'
                 AND al.entity_id = s.shop_id
                 AND al.action = 'SHOP_REJECTED'
               ORDER BY al.created_at DESC
               LIMIT 1) AS rejection_reason
       FROM shops s
       WHERE s.owner_id = $1
       ORDER BY s.created_at DESC`,
      [owner_id]
    );

    return res.status(200).json({
      success: true,
      shops: result.rows,
    });
  } catch (error) {
    console.error('Get my shops error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const deleteUnavailableShop = async (req, res) => {
  const { shopId } = req.params;
  const ownerId = req.user.user_id;

  try {
    const result = await db.query(
      `DELETE FROM shops
       WHERE shop_id = $1 AND owner_id = $2 AND status IN ('PENDING', 'SUSPENDED', 'CLOSED')
       RETURNING shop_id`,
      [shopId, ownerId]
    );

    if (result.rows.length) {
      return res.json({ success: true, message: 'Shop deleted' });
    }

    const existing = await db.query(
      'SELECT status FROM shops WHERE shop_id = $1 AND owner_id = $2',
      [shopId, ownerId]
    );
    if (!existing.rows.length) {
      return res.status(404).json({ success: false, message: 'Shop not found' });
    }
    return res.status(409).json({
      success: false,
      message: 'Only pending, rejected, or closed shops can be deleted',
    });
  } catch (error) {
    if (error.code === '23503') {
      return res.status(409).json({
        success: false,
        message: 'ลบร้านไม่ได้ เนื่องจากมีข้อมูลธุรกรรมที่อ้างอิงร้านนี้อยู่',
      });
    }
    console.error('Delete rejected shop error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const resubmitRejectedShop = async (req, res) => {
  const { shopId } = req.params;
  const { name, category, area, description } = req.body;

  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ success: false, message: 'Shop name is required' });
  }
  if (name.trim().length > 150) {
    return res.status(400).json({ success: false, message: 'Shop name must be 150 characters or fewer' });
  }

  try {
    const result = await db.query(
      `UPDATE shops
       SET name = $3, category = $4, area = $5, description = $6,
           status = 'PENDING', updated_at = NOW()
       WHERE shop_id = $1 AND owner_id = $2 AND status = 'SUSPENDED'
       RETURNING *`,
      [shopId, req.user.user_id, name.trim(), category || null, area || null, description || null]
    );
    if (!result.rows.length) {
      const existing = await db.query(
        'SELECT status FROM shops WHERE shop_id = $1 AND owner_id = $2',
        [shopId, req.user.user_id]
      );
      if (!existing.rows.length) {
        return res.status(404).json({ success: false, message: 'Shop not found' });
      }
      return res.status(409).json({ success: false, message: 'Only rejected shops can be resubmitted' });
    }
    return res.json({
      success: true,
      message: 'Shop updated and resubmitted for admin approval',
      shop: result.rows[0],
    });
  } catch (error) {
    console.error('Resubmit rejected shop error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const updateMerchantShopStatus = async (req, res) => {
  const { shopId } = req.params;
  const { status } = req.body;
  if (!['ACTIVE', 'CLOSED'].includes(status)) {
    return res.status(400).json({ success: false, message: 'Status must be ACTIVE or CLOSED' });
  }

  const expectedStatus = status === 'CLOSED' ? 'ACTIVE' : 'CLOSED';
  try {
    const result = await db.query(
      `UPDATE shops SET status = $3, updated_at = NOW()
       WHERE shop_id = $1 AND owner_id = $2 AND status = $4
       RETURNING *`,
      [shopId, req.user.user_id, status, expectedStatus]
    );
    if (!result.rows.length) {
      const existing = await db.query(
        'SELECT status FROM shops WHERE shop_id = $1 AND owner_id = $2',
        [shopId, req.user.user_id]
      );
      if (!existing.rows.length) {
        return res.status(404).json({ success: false, message: 'Shop not found' });
      }
      return res.status(409).json({
        success: false,
        message: status === 'CLOSED'
          ? 'Only active shops can be closed'
          : 'Only closed shops can be reopened',
      });
    }
    return res.json({
      success: true,
      message: status === 'CLOSED' ? 'Shop closed' : 'Shop reopened',
      shop: result.rows[0],
    });
  } catch (error) {
    if (error.code === '22P02') {
      return res.status(409).json({
        success: false,
        message: 'ฐานข้อมูลยังไม่ได้อัปเดตสำหรับการปิดร้าน กรุณารัน migration 10_shop_closure.sql แล้วลองอีกครั้ง',
      });
    }
    console.error('Update merchant shop status error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// GET /api/v1/shops (ค้นหาและแสดงรายการร้านค้าสถานะ ACTIVE ทั้งหมด - FR-02 พร้อมรองรับ Fuzzy Search)
const getAllShops = async (req, res) => {
  const { search, category, area } = req.query;

  try {
    let queryText = 'SELECT * FROM shops WHERE status = $1';
    const queryParams = ['ACTIVE'];
    let searchParamIdx = null;

    if (search && search.trim()) {
      queryParams.push(search.trim());
      searchParamIdx = queryParams.length;

      // ค้นหาทั้งแบบตรงตัว (ILIKE) และแบบคล้ายคลึง (similarity > 0.25) รวมถึงชื่อสินค้าที่ร้านขาย
      queryText += ` AND (
        name ILIKE '%' || $${searchParamIdx} || '%'
        OR description ILIKE '%' || $${searchParamIdx} || '%'
        OR EXISTS (SELECT 1 FROM shop_menu_items m WHERE m.shop_id = shops.shop_id AND m.name ILIKE '%' || $${searchParamIdx} || '%')
        OR similarity(name, $${searchParamIdx}) > 0.25
        OR similarity(COALESCE(description, ''), $${searchParamIdx}) > 0.20
      )`;
    }

    if (category) {
      queryParams.push(category);
      queryText += ` AND category = $${queryParams.length}`;
    }

    if (area) {
      queryParams.push(area);
      queryText += ` AND area = $${queryParams.length}`;
    }

    // หากมีการค้นหาคำ ให้เรียงผลลัพธ์จากร้านที่มีคะแนนความตรง/ใกล้เคียงสูงสุดขึ้นก่อน
    if (searchParamIdx) {
      queryText += ` ORDER BY GREATEST(
        similarity(name, $${searchParamIdx}),
        similarity(COALESCE(description, ''), $${searchParamIdx})
      ) DESC, created_at DESC`;
    } else {
      queryText += ' ORDER BY created_at DESC';
    }

    const result = await db.query(queryText, queryParams);
    const shops = await attachMenuPreview(result.rows);

    return res.status(200).json({
      success: true,
      total: shops.length,
      shops,
    });
  } catch (error) {
    console.error('Get all shops error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

module.exports = {
  getPublicShopById,
  createShop,
  getShopById,
  getMyShops,
  deleteUnavailableShop,
  resubmitRejectedShop,
  updateMerchantShopStatus,
  getAllShops,
};