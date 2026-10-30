const express = require('express');
const { authenticateToken, authorizeRole } = require('../../middlewares/auth.middleware');
const { verifyShopOwner } = require('../../middlewares/shop.middleware');
const controller = require('./payment-request.controller');

const router = express.Router();
const merchant = [authenticateToken, authorizeRole('MERCHANT'), verifyShopOwner];

router.post('/shops/:shopId/payment-requests', ...merchant, controller.createPaymentRequest);
router.get('/shops/:shopId/payment-requests/:requestId', ...merchant, controller.getShopPaymentRequest);
router.post('/shops/:shopId/payment-requests/:requestId/cancel', ...merchant, controller.cancelPaymentRequest);
router.get('/payment-requests/:requestId', authenticateToken, authorizeRole('CITIZEN'), controller.getCitizenPaymentRequest);

module.exports = router;
