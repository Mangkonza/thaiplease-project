const db = require('../config/db');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ตรวจสอบความเป็นเจ้าของร้าน (BR-04, NFR-03)
const verifyShopOwner = async (req, res, next) => {
  const shopId = req.params.shopId || req.body.shop_id;

  if (!shopId) {
    return res.status(400).json({
      success: false,
      message: 'Shop ID is required',
    });
  }

  // ถ้าไม่ใช่ UUID ส่งเข้า PostgreSQL จะ error เป็น 500 จึงต้องตัดตั้งแต่ตรงนี้
  if (!UUID_PATTERN.test(shopId)) {
    return res.status(400).json({
      success: false,
      message: 'Shop ID must be a valid UUID',
    });
  }

  // หากเป็น ADMIN อนุญาตให้ผ่านได้ทันที
  if (req.user && req.user.role === 'ADMIN') {
    return next();
  }

  try {
    const result = await db.query(
      'SELECT owner_id FROM shops WHERE shop_id = $1',
      [shopId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Shop not found',
      });
    }

    const shop = result.rows[0];

    // ตรวจสอบว่า owner_id ของร้านตรงกับ user_id ใน Token หรือไม่
    if (shop.owner_id !== req.user.user_id) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: You are not the owner of this shop',
      });
    }

    next();
  } catch (error) {
    console.error('Verify shop owner error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while verifying shop ownership',
    });
  }
};

module.exports = {
  verifyShopOwner,
  UUID_PATTERN,
};