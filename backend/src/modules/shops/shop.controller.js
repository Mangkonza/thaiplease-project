const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const db = require('../../config/db');
const { UUID_PATTERN } = require('../../middlewares/shop.middleware');
const { attachMenuPreview, getMenuItems } = require('./shop-details');

function getAuthenticatedCitizen(req) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded && decoded.role === 'CITIZEN' ? decoded : null;
  } catch (err) {
    return null;
  }
}

function formatCampaignBenefit(mechanic, params, defaultName) {
  if (!params) return defaultName;
  switch (mechanic) {
    case 'PERCENT_DISCOUNT':
    case 'TIME_BASED':
    case 'DAY_BASED':
    case 'NEW_CUSTOMER':
      return params.discount_percent ? `ลด ${params.discount_percent}%` : defaultName;
    case 'FIXED_DISCOUNT':
    case 'COMEBACK_REWARD':
      return params.discount_amount ? `ลด ${params.discount_amount} บาท` : defaultName;
    case 'BONUS_COIN':
      return params.bonus_coin ? `รับเหรียญเพิ่ม +${params.bonus_coin}` : defaultName;
    case 'COIN_MULTIPLIER':
      return params.multiplier ? `รับเหรียญ x${params.multiplier}` : defaultName;
    case 'MIN_SPEND_REWARD':
      return params.reward_value ? `ลด ${params.reward_value} บาท` : defaultName;
    case 'FREQUENCY_REWARD':
      return params.reward_coins ? `รับเหรียญ +${params.reward_coins}` : defaultName;
    default:
      return defaultName;
  }
}

function formatCampaignInstruction(mechanic, params) {
  if (!params) return 'สแกน QR และชำระเงินที่ร้านเพื่อรับสิทธิ์โปรโมชันอัตโนมัติ';
  switch (mechanic) {
    case 'PERCENT_DISCOUNT': {
      const min = params.min_spend ? `มียอดซื้อตั้งแต่ ${params.min_spend} บาทขึ้นไป` : 'ไม่กำหนดยอดซื้อขั้นต่ำ';
      return `เมื่อสแกนจ่ายที่ร้านและ${min} ระบบจะคิดส่วนลดให้ทันที ${params.discount_percent}% ในส่วนที่คุณจ่าย`;
    }
    case 'FIXED_DISCOUNT': {
      const min = params.min_spend ? `มียอดซื้อตั้งแต่ ${params.min_spend} บาทขึ้นไป` : 'ไม่กำหนดยอดซื้อขั้นต่ำ';
      return `เมื่อสแกนจ่ายที่ร้านและ${min} ระบบจะลดค่าใช้จ่ายทันที ${params.discount_amount} บาท ในส่วนที่คุณจ่าย`;
    }
    case 'BONUS_COIN': {
      const min = params.min_spend ? `มียอดซื้อตั้งแต่ ${params.min_spend} บาทขึ้นไป` : 'ไม่กำหนดยอดซื้อขั้นต่ำ';
      return `เมื่อสแกนจ่ายที่ร้านและ${min} รับเหรียญโบนัสพิเศษเพิ่มทันที ${params.bonus_coin} coin`;
    }
    case 'COIN_MULTIPLIER':
      return `เมื่อสแกนจ่ายที่ร้าน รับเหรียญสะสมเพิ่มทันที ${params.multiplier} เท่าจากยอดปกติ`;
    case 'MIN_SPEND_REWARD':
      return `เมื่อสแกนจ่ายที่ร้านโดยมียอดซื้อตั้งแต่ ${params.min_spend} บาทขึ้นไป รับส่วนลดทันที ${params.reward_value} บาท`;
    case 'COMEBACK_REWARD':
      return `สิทธิพิเศษสำหรับลูกค้าที่ไม่ได้มาซื้อเกิน ${params.inactive_days} วัน รับส่วนลด ${params.discount_amount} บาท เมื่อสแกนจ่าย`;
    case 'FREQUENCY_REWARD':
      return `สะสมการซื้อที่ร้านครบทุกๆ ${params.required_orders} ครั้ง รับเหรียญรางวัลพิเศษ ${params.reward_coins} coin`;
    case 'TIME_BASED':
      return `สแกนจ่ายในช่วงเวลาพิเศษ ${params.start_time} - ${params.end_time} น. รับส่วนลดทันที ${params.discount_percent}%`;
    case 'DAY_BASED':
      return `สแกนจ่ายในวันที่กำหนด (${(params.target_days || []).join(', ')}) รับส่วนลดทันที ${params.discount_percent}%`;
    case 'NEW_CUSTOMER':
      return `สำหรับลูกค้าใหม่ที่ยังไม่เคยใช้จ่ายที่ร้านนี้ รับส่วนลดพิเศษทันที ${params.discount_percent}% เมื่อสแกนจ่ายครั้งแรก`;
    default:
      return 'สแกน QR และชำระเงินที่ร้านเพื่อรับสิทธิ์โปรโมชันอัตโนมัติ';
  }
}

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

    let activeCampaign = null;
    const citizen = getAuthenticatedCitizen(req);
    if (citizen) {
      const now = new Date();
      const campaignResult = await db.query(
        `SELECT c.campaign_id, c.shop_id, c.name AS campaign_name, c.parameters, c.treatment_ratio,
                c.start_at, c.end_at,
                t.name AS template_name, t.mechanic AS template_code,
                a.group_type
         FROM campaigns c
         JOIN promotion_templates t ON t.template_id = c.template_id
         LEFT JOIN campaign_assignments a ON a.campaign_id = c.campaign_id AND a.user_id = $2
         WHERE c.shop_id = $1 AND c.status = 'ACTIVE'
           AND c.start_at <= $3 AND c.end_at >= $3
         ORDER BY c.activated_at DESC
         LIMIT 1`,
        [shopId, citizen.user_id, now]
      );
      if (campaignResult.rows.length) {
        const row = campaignResult.rows[0];
        let isEligible = false;
        if (row.group_type === 'TREATMENT') {
          isEligible = true;
        } else if (!row.group_type) {
          const hash = crypto.createHash('sha256').update(`${citizen.user_id}${row.campaign_id}`).digest();
          const value = hash.readUInt32BE(0) / 0x100000000;
          if (value < Number(row.treatment_ratio || 0.5)) {
            isEligible = true;
          }
        }
        if (isEligible) {
          activeCampaign = {
            campaign_id: row.campaign_id,
            name: row.campaign_name,
            template_code: row.template_code,
            template_name: row.template_name,
            parameters: row.parameters,
            start_at: row.start_at,
            end_at: row.end_at,
            benefit_text: formatCampaignBenefit(row.template_code, row.parameters, row.campaign_name),
            instruction_text: formatCampaignInstruction(row.template_code, row.parameters),
          };
        }
      }
    }

    return res.json({
      success: true,
      shop: {
        ...result.rows[0],
        menu_items: await getMenuItems(shopId),
        active_campaign: activeCampaign,
      },
    });
  } catch (error) {
    console.error('Get public shop error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// POST /api/v1/shops (สร้างร้านค้าใหม่โดย Merchant; ร้านใหม่ต้องรอ Admin อนุมัติก่อนเป็น ACTIVE)
const createShop = async (req, res) => {
  const { name, category, area, description, menu_items } = req.body;
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
    const shop = result.rows[0];

    if (Array.isArray(menu_items) && menu_items.length > 0) {
      for (const [index, item] of menu_items.entries()) {
        const itemName = typeof item?.name === 'string' ? item.name.trim() : '';
        if (itemName) {
          const itemPrice = item?.price !== undefined && item?.price !== null && item?.price !== '' ? Number(item.price) : null;
          await db.query(
            'INSERT INTO shop_menu_items (shop_id, name, price, sort_order) VALUES ($1, $2, $3, $4)',
            [shop.shop_id, itemName, itemPrice, index]
          );
        }
      }
    }

    return res.status(201).json({
      success: true,
      message: 'Shop created and pending admin approval',
      shop,
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

    let userCampaignsByShop = new Map();
    const citizen = getAuthenticatedCitizen(req);
    if (citizen) {
      const now = new Date();
      const campaignResult = await db.query(
        `SELECT c.campaign_id, c.shop_id, c.name AS campaign_name, c.parameters, c.treatment_ratio,
                t.name AS template_name, t.mechanic AS template_code,
                a.group_type
         FROM campaigns c
         JOIN promotion_templates t ON t.template_id = c.template_id
         LEFT JOIN campaign_assignments a ON a.campaign_id = c.campaign_id AND a.user_id = $1
         WHERE c.status = 'ACTIVE'
           AND c.start_at <= $2 AND c.end_at >= $2
         ORDER BY c.activated_at DESC`,
        [citizen.user_id, now]
      );

      for (const row of campaignResult.rows) {
        if (userCampaignsByShop.has(row.shop_id)) continue;
        let isEligible = false;
        if (row.group_type === 'TREATMENT') {
          isEligible = true;
        } else if (!row.group_type) {
          const hash = crypto.createHash('sha256').update(`${citizen.user_id}${row.campaign_id}`).digest();
          const value = hash.readUInt32BE(0) / 0x100000000;
          if (value < Number(row.treatment_ratio || 0.5)) {
            isEligible = true;
          }
        }
        if (isEligible) {
          userCampaignsByShop.set(row.shop_id, {
            campaign_id: row.campaign_id,
            name: row.campaign_name,
            template_code: row.template_code,
            template_name: row.template_name,
            parameters: row.parameters,
            benefit_text: formatCampaignBenefit(row.template_code, row.parameters, row.campaign_name),
            instruction_text: formatCampaignInstruction(row.template_code, row.parameters),
          });
        }
      }
    }

    const shopsWithCampaigns = shops.map((shop) => ({
      ...shop,
      active_campaign: userCampaignsByShop.get(shop.shop_id) || null,
    }));

    // หากไม่มีการค้นหาคำ ให้จัดเรียงร้านที่ประชาชนมีสิทธิ์ใช้แคมเปญขึ้นก่อนเสมอ
    if (!searchParamIdx) {
      shopsWithCampaigns.sort((a, b) => {
        const aActive = a.active_campaign ? 1 : 0;
        const bActive = b.active_campaign ? 1 : 0;
        if (bActive !== aActive) return bActive - aActive;
        return (new Date(b.created_at || 0).getTime()) - (new Date(a.created_at || 0).getTime());
      });
    }

    return res.status(200).json({
      success: true,
      total: shopsWithCampaigns.length,
      shops: shopsWithCampaigns,
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
