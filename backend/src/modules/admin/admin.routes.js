const express = require('express');
const { authenticateToken, authorizeRole } = require('../../middlewares/auth.middleware');
const controller = require('./admin.controller');

const router = express.Router();
router.use(authenticateToken, authorizeRole('ADMIN'));
router.get('/shops', controller.listShops);
router.patch('/shops/:shopId/status', controller.updateShopStatus);
router.get('/audit-logs', controller.listAuditLogs);

module.exports = router;
