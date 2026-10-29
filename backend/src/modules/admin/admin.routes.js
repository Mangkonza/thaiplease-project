const express = require('express');
const { authenticateToken, authorizeRole } = require('../../middlewares/auth.middleware');
const controller = require('./admin.controller');
const policyController = require('../policies/policy.controller');
const caseController = require('../cases/case.controller');
const missionController = require('../missions/mission.controller');
const budgetController = require('../budget/budget.controller');
const coinApproval = require('../campaigns/coin-approval.controller');

const router = express.Router();
router.use(authenticateToken, authorizeRole('ADMIN'));
router.get('/shops', controller.listShops);
router.patch('/shops/:shopId/status', controller.updateShopStatus);
router.get('/audit-logs', controller.listAuditLogs);
router.get('/policies', policyController.adminListPolicies);
router.post('/policies', policyController.adminCreatePolicy);
router.get('/cases', caseController.listAllCases);
router.post('/cases/:caseId/decision', caseController.decideAsAdmin);
router.get('/missions', missionController.adminListMissions);
router.post('/missions', missionController.adminCreateMission);
router.post('/missions/:missionId/close', missionController.adminCloseMission);
router.get('/budget', budgetController.adminBudget);
router.post('/shops/:shopId/payouts', budgetController.adminCreatePayout);
router.get('/campaign-approvals', coinApproval.adminListCoinApprovals);
router.post('/campaigns/:campaignId/approval', coinApproval.adminDecideCoinApproval);

module.exports = router;
