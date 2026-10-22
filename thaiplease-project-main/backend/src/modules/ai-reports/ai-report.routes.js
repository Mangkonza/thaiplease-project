const express = require('express');
const router = express.Router();
const aiReportController = require('./ai-report.controller');
const { authenticateToken, authorizeRole } = require('../../middlewares/auth.middleware');
const { verifyShopOwner } = require('../../middlewares/shop.middleware');

// สร้างรายงานได้เฉพาะ Merchant เจ้าของร้าน (SRS 3.5); อ่านได้ทั้งเจ้าของและ Admin
router.post('/shops/:shopId/ai-reports', authenticateToken, authorizeRole('MERCHANT'), verifyShopOwner, aiReportController.createReport);
router.get('/shops/:shopId/ai-reports', authenticateToken, authorizeRole('MERCHANT', 'ADMIN'), verifyShopOwner, aiReportController.listReports);
router.get('/ai-reports/:reportId', authenticateToken, authorizeRole('MERCHANT', 'ADMIN'), aiReportController.getReport);
router.get('/promotion-templates', authenticateToken, authorizeRole('MERCHANT', 'ADMIN'), aiReportController.getTemplates);

module.exports = router;
