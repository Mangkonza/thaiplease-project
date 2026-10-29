const express = require('express');
const { authenticateToken, authorizeRole } = require('../../middlewares/auth.middleware');
const controller = require('./coin.controller');
const { getMySubsidy } = require('../policies/policy.controller');
const { getMyCoupons, redeemCoupon } = require('../coupons/coupon.controller');
const { createCase, listMyCases } = require('../cases/case.controller');
const { listMyMissions, acceptMission } = require('../missions/mission.controller');
const wallet = require('../wallet/wallet.controller');

const router = express.Router();
router.use(authenticateToken, authorizeRole('CITIZEN'));
router.get('/coins', controller.getBalance);
router.get('/coin-transactions', controller.getTransactions);
router.get('/payments', controller.getPayments);
router.get('/subsidy', getMySubsidy);
router.get('/coupons', getMyCoupons);
router.post('/coupons', redeemCoupon);
router.get('/cases', listMyCases);
router.post('/cases', createCase);
router.get('/missions', listMyMissions);
router.post('/missions/:missionId/accept', acceptMission);
router.get('/wallet', wallet.getWallet);
router.post('/wallet/topups', wallet.topUp);
router.put('/pin', wallet.setPin);
router.get('/payments/:paymentId', wallet.getSlip);

module.exports = router;
