const db = require('../../config/db');
const { UUID_PATTERN } = require('../../middlewares/shop.middleware');
const { PAYMENT_REQUEST_TTL_MS, serializeRequest } = require('./payment-request.service');

const MAX_AMOUNT = 9999999999.99;
const isValidAmount = (amount) => Number.isFinite(amount) && amount > 0 && amount <= MAX_AMOUNT &&
  Math.abs(Math.round(amount * 100) - amount * 100) <= 1e-8;

const REQUEST_COLUMNS = 'request_id, shop_id, amount, status, expires_at, created_at, payment_id';

// ร้านใส่ยอดแล้วสร้างคำขอรับเงิน (verifyShopOwner ตรวจความเป็นเจ้าของร้านแล้ว)
async function createPaymentRequest(req, res) {
  const amount = Number(req.body.amount);
  if (!isValidAmount(amount)) {
    return res.status(400).json({ success: false, message: 'amount must be a positive number with at most 2 decimals' });
  }
  try {
    const shop = await db.query('SELECT status FROM shops WHERE shop_id = $1', [req.params.shopId]);
    if (!shop.rows.length) return res.status(404).json({ success: false, message: 'Shop not found' });
    if (shop.rows[0].status !== 'ACTIVE') {
      return res.status(409).json({ success: false, message: 'Shop is not available for payments' });
    }
    const now = new Date();
    const result = await db.query(
      `INSERT INTO payment_requests (shop_id, amount, created_by, expires_at)
       VALUES ($1, $2, $3, $4) RETURNING ${REQUEST_COLUMNS}`,
      [req.params.shopId, amount, req.user.user_id, new Date(now.getTime() + PAYMENT_REQUEST_TTL_MS)]
    );
    return res.status(201).json({ success: true, request: serializeRequest(result.rows[0], now) });
  } catch (error) {
    console.error('Create payment request error:', error);
    return res.status(500).json({ success: false, message: 'Unable to create payment request' });
  }
}

// ร้านถามสถานะคำขอซ้ำ ๆ เพื่อรู้ว่าลูกค้าจ่ายแล้ว
async function getShopPaymentRequest(req, res) {
  const { shopId, requestId } = req.params;
  if (!UUID_PATTERN.test(requestId)) return res.status(400).json({ success: false, message: 'requestId must be a UUID' });
  try {
    const result = await db.query(
      `SELECT r.request_id, r.shop_id, r.amount, r.status, r.expires_at, r.created_at, r.payment_id,
              p.gross_amount, p.citizen_paid, p.government_subsidy, p.coupon_discount, p.paid_at
       FROM payment_requests r LEFT JOIN payments p ON p.payment_id = r.payment_id
       WHERE r.request_id = $1 AND r.shop_id = $2`,
      [requestId, shopId]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Payment request not found' });
    const row = result.rows[0];
    const payment = row.payment_id ? {
      gross_amount: Number(row.gross_amount),
      citizen_paid: Number(row.citizen_paid),
      government_subsidy: Number(row.government_subsidy),
      coupon_discount: Number(row.coupon_discount),
      paid_at: row.paid_at,
    } : null;
    return res.json({ success: true, request: { ...serializeRequest(row), payment } });
  } catch (error) {
    console.error('Get shop payment request error:', error);
    return res.status(500).json({ success: false, message: 'Unable to load payment request' });
  }
}

// ร้านยกเลิกคำขอที่ยังไม่มีคนจ่าย เช่น ใส่ยอดผิด
async function cancelPaymentRequest(req, res) {
  const { shopId, requestId } = req.params;
  if (!UUID_PATTERN.test(requestId)) return res.status(400).json({ success: false, message: 'requestId must be a UUID' });
  try {
    const result = await db.query(
      `UPDATE payment_requests SET status = 'CANCELLED'
       WHERE request_id = $1 AND shop_id = $2 AND status = 'PENDING'
       RETURNING ${REQUEST_COLUMNS}`,
      [requestId, shopId]
    );
    if (!result.rows.length) {
      return res.status(409).json({ success: false, message: 'Only unpaid payment requests can be cancelled' });
    }
    return res.json({ success: true, request: serializeRequest(result.rows[0]) });
  } catch (error) {
    console.error('Cancel payment request error:', error);
    return res.status(500).json({ success: false, message: 'Unable to cancel payment request' });
  }
}

// ลูกค้าสแกน QR แล้วเห็นร้านและยอดที่ร้านใส่ไว้
async function getCitizenPaymentRequest(req, res) {
  const { requestId } = req.params;
  if (!UUID_PATTERN.test(requestId)) return res.status(404).json({ success: false, message: 'Payment request not found' });
  try {
    const result = await db.query(
      `SELECT r.request_id, r.shop_id, r.amount, r.status, r.expires_at, r.created_at, r.payment_id,
              s.name AS shop_name, s.category AS shop_category, s.area AS shop_area, s.image_path AS shop_image_path
       FROM payment_requests r JOIN shops s ON s.shop_id = r.shop_id
       WHERE r.request_id = $1`,
      [requestId]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Payment request not found' });
    const row = result.rows[0];
    return res.json({
      success: true,
      request: {
        ...serializeRequest(row),
        // ลูกค้าคนอื่นไม่ต้องรู้ว่ารายการไหนจ่ายแล้ว
        payment_id: undefined,
        shop: { shop_id: row.shop_id, name: row.shop_name, category: row.shop_category, area: row.shop_area, image_path: row.shop_image_path },
      },
    });
  } catch (error) {
    console.error('Get payment request error:', error);
    return res.status(500).json({ success: false, message: 'Unable to load payment request' });
  }
}

module.exports = { createPaymentRequest, getShopPaymentRequest, cancelPaymentRequest, getCitizenPaymentRequest };
