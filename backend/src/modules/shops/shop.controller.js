const db = require('../../config/db');
const { UUID_PATTERN } = require('../../middlewares/shop.middleware');

// Public storefront view is limited to approved shops; the existing owner endpoint remains protected.
const getPublicShopById = async (req, res) => {
  const { shopId } = req.params;
  if (!UUID_PATTERN.test(shopId)) {
    return res.status(400).json({ success: false, message: 'Shop ID must be a valid UUID' });
  }
  try {
    const result = await db.query(
      `SELECT shop_id, name, category, area, description, status, image_path
       FROM shops WHERE shop_id = $1 AND status = 'ACTIVE'`,
      [shopId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Shop not found' });
    }
    return res.json({ success: true, shop: result.rows[0] });
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
      shop: result.rows[0],
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
      'SELECT * FROM shops WHERE owner_id = $1 ORDER BY created_at DESC',
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

      // ค้นหาทั้งแบบตรงตัว (ILIKE) และแบบคล้ายคลึง (similarity > 0.25)
      queryText += ` AND (
        name ILIKE '%' || $${searchParamIdx} || '%'
        OR description ILIKE '%' || $${searchParamIdx} || '%'
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

    return res.status(200).json({
      success: true,
      total: result.rows.length,
      shops: result.rows,
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
  getAllShops,
};