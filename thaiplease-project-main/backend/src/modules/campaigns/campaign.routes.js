const express = require('express');
const { authenticateToken, authorizeRole } = require('../../middlewares/auth.middleware');
const { verifyShopOwner } = require('../../middlewares/shop.middleware');
const controller = require('./campaign.controller');

const router = express.Router();
const campaignRoles = [authenticateToken, authorizeRole('MERCHANT', 'ADMIN')];

router.post('/ai-suggestions/:suggestionId/select', ...campaignRoles, verifyShopOwner, controller.selectSuggestion);
router.post('/campaigns', ...campaignRoles, verifyShopOwner, controller.createCampaign);
router.get('/campaigns/:campaignId/result', ...campaignRoles, controller.verifyCampaignAccess, controller.getCampaignResult);
router.post('/campaigns/:campaignId/activate', ...campaignRoles, controller.verifyCampaignAccess, controller.activateCampaign);
router.post('/campaigns/:campaignId/end', ...campaignRoles, controller.verifyCampaignAccess, controller.endCampaign);
router.post('/campaigns/:campaignId/evaluate', ...campaignRoles, controller.verifyCampaignAccess, controller.evaluate);
router.patch('/campaigns/:campaignId', ...campaignRoles, controller.verifyCampaignAccess, controller.updateCampaign);
router.get('/campaigns/:campaignId', ...campaignRoles, controller.verifyCampaignAccess, controller.getCampaign);
router.get('/shops/:shopId/campaigns', ...campaignRoles, verifyShopOwner, controller.getShopCampaigns);

module.exports = router;
