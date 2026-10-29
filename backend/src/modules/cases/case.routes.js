const express = require('express');
const { authenticateToken, authorizeRole } = require('../../middlewares/auth.middleware');
const { verifyShopOwner } = require('../../middlewares/shop.middleware');
const controller = require('./case.controller');

// คำขอคืนเงินของร้าน เฉพาะเจ้าของร้าน (Admin ใช้ /admin/cases)
const router = express.Router();
const guards = [authenticateToken, authorizeRole('MERCHANT'), verifyShopOwner];
router.get('/shops/:shopId/refund-requests', ...guards, controller.listShopRefunds);
router.post('/shops/:shopId/refund-requests/:caseId/decision', ...guards, controller.decideAsShop);

module.exports = router;
