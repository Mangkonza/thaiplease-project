const express = require('express');
const { authenticateToken, authorizeRole } = require('../../middlewares/auth.middleware');
const controller = require('./coin.controller');

const router = express.Router();
router.use(authenticateToken, authorizeRole('CITIZEN'));
router.get('/coins', controller.getBalance);
router.get('/coin-transactions', controller.getTransactions);
router.get('/payments', controller.getPayments);

module.exports = router;
