const db = require('../../config/db');

const MENU_PREVIEW = 3;
const MAX_MENU_ITEMS = 30;

// รายการสินค้าตัวอย่างของหลายร้านในคำสั่งเดียว (กัน N+1 ในหน้ารายการร้าน)
async function attachMenuPreview(shops) {
  if (!shops.length) return shops;
  const result = await db.query(
    `SELECT shop_id, name, price FROM shop_menu_items
     WHERE shop_id = ANY($1::uuid[]) ORDER BY shop_id, sort_order, name`,
    [shops.map((shop) => shop.shop_id)]
  );
  const byShop = new Map();
  for (const row of result.rows) {
    const items = byShop.get(row.shop_id) || [];
    if (items.length < MENU_PREVIEW) items.push({ name: row.name, price: row.price === null ? null : Number(row.price) });
    byShop.set(row.shop_id, items);
  }
  return shops.map((shop) => ({ ...shop, menu_preview: byShop.get(shop.shop_id) || [] }));
}

async function getMenuItems(shopId) {
  const result = await db.query(
    'SELECT name, price FROM shop_menu_items WHERE shop_id = $1 ORDER BY sort_order, name',
    [shopId]
  );
  return result.rows.map((row) => ({ name: row.name, price: row.price === null ? null : Number(row.price) }));
}

const optionalText = (value, max) => {
  if (value === undefined || value === null) return { value: null };
  if (typeof value !== 'string') return { error: true };
  const text = value.trim();
  if (text.length > max) return { error: true };
  return { value: text || null };
};

const optionalNumber = (value, min, max) => {
  if (value === undefined || value === null || value === '') return { value: null };
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) return { error: true };
  return { value: number };
};

// ตรวจข้อมูลที่ร้านส่งมา คืน { details } หรือ { errors }
function validateShopDetails(body = {}) {
  const errors = [];
  const address = optionalText(body.address, 300);
  if (address.error) errors.push('address must be text up to 300 characters');
  const hours = optionalText(body.opening_hours, 100);
  if (hours.error) errors.push('opening_hours must be text up to 100 characters');
  const latitude = optionalNumber(body.latitude, -90, 90);
  const longitude = optionalNumber(body.longitude, -180, 180);
  if (latitude.error || longitude.error) errors.push('latitude must be -90..90 and longitude -180..180');
  else if ((latitude.value === null) !== (longitude.value === null)) errors.push('latitude and longitude must be given together');

  const rawItems = body.menu_items === undefined ? [] : body.menu_items;
  const menuItems = [];
  if (!Array.isArray(rawItems) || rawItems.length > MAX_MENU_ITEMS) {
    errors.push(`menu_items must be a list of at most ${MAX_MENU_ITEMS} items`);
  } else {
    rawItems.forEach((item, index) => {
      const name = typeof item?.name === 'string' ? item.name.trim() : '';
      const price = optionalNumber(item?.price, 0, 99999999.99);
      if (!name || name.length > 120) errors.push(`menu_items[${index}].name is required (up to 120 characters)`);
      if (price.error) errors.push(`menu_items[${index}].price must be a number of at least 0`);
      menuItems.push({ name, price: price.value });
    });
  }
  if (errors.length) return { errors };
  return {
    details: {
      address: address.value, opening_hours: hours.value,
      latitude: latitude.value, longitude: longitude.value, menu_items: menuItems,
    },
  };
}

// PUT /shops/:shopId/details เจ้าของร้านแก้ที่อยู่ เวลาเปิด พิกัด และรายการสินค้าทั้งชุด
async function updateShopDetails(req, res) {
  const { details, errors } = validateShopDetails(req.body);
  if (errors) return res.status(400).json({ success: false, message: errors.join('; ') });

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const updated = await client.query(
      `UPDATE shops SET address = $2, opening_hours = $3, latitude = $4, longitude = $5, updated_at = now()
       WHERE shop_id = $1 RETURNING shop_id`,
      [req.params.shopId, details.address, details.opening_hours, details.latitude, details.longitude]
    );
    if (!updated.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Shop not found' });
    }
    await client.query('DELETE FROM shop_menu_items WHERE shop_id = $1', [req.params.shopId]);
    for (const [index, item] of details.menu_items.entries()) {
      await client.query(
        'INSERT INTO shop_menu_items (shop_id, name, price, sort_order) VALUES ($1, $2, $3, $4)',
        [req.params.shopId, item.name, item.price, index + 1]
      );
    }
    await client.query('COMMIT');
    return res.json({ success: true, details });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update shop details error:', error);
    return res.status(500).json({ success: false, message: 'Unable to update shop details' });
  } finally {
    client.release();
  }
}

module.exports = { attachMenuPreview, getMenuItems, validateShopDetails, updateShopDetails };
