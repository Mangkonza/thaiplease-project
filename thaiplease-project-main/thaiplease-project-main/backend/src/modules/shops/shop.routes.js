const express = require('express');
const router = express.Router();
const shopController = require('./shop.controller');
const { authenticateToken, authorizeRole } = require('../../middlewares/auth.middleware');
const { verifyShopOwner } = require('../../middlewares/shop.middleware');

// Public route: ประชาชนทั่วไปค้นหาร้านค้าได้ (FR-02)
router.get('/', shopController.getAllShops);

// Protected route: เจ้าของร้านดูรายการร้านของตัวเอง
router.get('/my', authenticateToken, authorizeRole('MERCHANT', 'ADMIN'), shopController.getMyShops);

// Protected route: สร้างร้านค้าใหม่ (เฉพาะ MERCHANT หรือ ADMIN)
router.post('/', authenticateToken, authorizeRole('MERCHANT', 'ADMIN'), shopController.createShop);

// Public storefront details for active shops.
router.get('/public/:shopId', shopController.getPublicShopById);

// Protected route: อ่านข้อมูลร้านค้าตาม shopId (ตรวจสอบสิทธิ์เจ้าของร้านตาม BR-04)
router.get('/:shopId', authenticateToken, verifyShopOwner, shopController.getShopById);

module.exports = router;