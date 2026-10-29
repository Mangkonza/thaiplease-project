const express = require('express');
const { authenticateToken, authorizeRole } = require('../../middlewares/auth.middleware');
const controller = require('./admin.controller');
const policyController = require('../policies/policy.controller');

const router = express.Router();
router.use(authenticateToken, authorizeRole('ADMIN'));
router.get('/shops', controller.listShops);
router.patch('/shops/:shopId/status', controller.updateShopStatus);
router.get('/audit-logs', controller.listAuditLogs);
router.get('/policies', policyController.adminListPolicies);
router.post('/policies', policyController.adminCreatePolicy);

module.exports = router;
