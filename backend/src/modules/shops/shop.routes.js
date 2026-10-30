const express = require('express');
const router = express.Router();
const shopController = require('./shop.controller');
const { authenticateToken, authorizeRole } = require('../../middlewares/auth.middleware');
const { verifyShopOwner } = require('../../middlewares/shop.middleware');
const { readImageBody, uploadShopImage } = require('./shop-image');
const { updateShopDetails } = require('./shop-details');

// Public route: ประชาชนทั่วไปค้นหาร้านค้าได้ (FR-02)
router.get('/', shopController.getAllShops);

// Protected route: เจ้าของร้านดูรายการร้านของตัวเอง
router.get('/my', authenticateToken, authorizeRole('MERCHANT', 'ADMIN'), shopController.getMyShops);

// Protected route: สร้างร้านค้าใหม่ (เฉพาะ MERCHANT หรือ ADMIN)
router.post('/', authenticateToken, authorizeRole('MERCHANT', 'ADMIN'), shopController.createShop);

// Public storefront details for active shops.
router.get('/public/:shopId', shopController.getPublicShopById);

// Merchants can remove shops that were not approved.
router.delete('/:shopId', authenticateToken, authorizeRole('MERCHANT'), verifyShopOwner, shopController.deleteUnavailableShop);

// Merchants can edit rejected shops and resubmit them for review.
router.put('/:shopId', authenticateToken, authorizeRole('MERCHANT'), verifyShopOwner, shopController.resubmitRejectedShop);
router.patch('/:shopId/status', authenticateToken, authorizeRole('MERCHANT'), verifyShopOwner, shopController.updateMerchantShopStatus);

// Protected route: อ่านข้อมูลร้านค้าตาม shopId (ตรวจสอบสิทธิ์เจ้าของร้านตาม BR-04)
router.get('/:shopId', authenticateToken, verifyShopOwner, shopController.getShopById);

// เจ้าของร้านแก้ที่อยู่ เวลาเปิด พิกัด และรายการสินค้าที่แสดงในหน้าร้านแนะนำ
router.put('/:shopId/details', authenticateToken, authorizeRole('MERCHANT'), verifyShopOwner, updateShopDetails);

// เจ้าของร้านอัปโหลดรูปหน้าร้าน ส่งไฟล์รูปเป็น body ตรงๆ (ไม่ใช่ multipart)
router.put('/:shopId/image', authenticateToken, authorizeRole('MERCHANT', 'ADMIN'), verifyShopOwner, readImageBody, uploadShopImage);

module.exports = router;