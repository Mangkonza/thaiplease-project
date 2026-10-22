const express = require('express');
const { authenticateToken, authorizeRole } = require('../../middlewares/auth.middleware');
const { createPayment } = require('./payment.controller');

const router = express.Router();
router.post('/', authenticateToken, authorizeRole('CITIZEN'), createPayment);

module.exports = router;
