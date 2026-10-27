const express = require('express');
const { authenticateToken, authorizeRole } = require('../../middlewares/auth.middleware');
const { createPayment, quotePayment } = require('./payment.controller');

const router = express.Router();
router.post('/quote', authenticateToken, authorizeRole('CITIZEN'), quotePayment);
router.post('/', authenticateToken, authorizeRole('CITIZEN'), createPayment);

module.exports = router;
