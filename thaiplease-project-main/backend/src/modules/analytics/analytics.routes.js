const express = require('express');
const router = express.Router();
const analyticsController = require('./analytics.controller');
const { authenticateToken, authorizeRole } = require('../../middlewares/auth.middleware');
const { verifyShopOwner } = require('../../middlewares/shop.middleware');

// เจ้าของร้านหรือ Admin เท่านั้น (UC-02, BR-04)
const guards = [authenticateToken, authorizeRole('MERCHANT', 'ADMIN'), verifyShopOwner];

router.get('/:shopId/metrics', ...guards, analyticsController.getMetrics);
router.get('/:shopId/dashboard', ...guards, analyticsController.getDashboard);

module.exports = router;
