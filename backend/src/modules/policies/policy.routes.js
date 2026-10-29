const express = require('express');
const { authenticateToken } = require('../../middlewares/auth.middleware');
const controller = require('./policy.controller');

// นโยบายที่ใช้อยู่ ทุก role ที่ login แล้วดูได้ (หน้าจ่ายเงิน, หน้าร้าน, หน้า Admin)
const router = express.Router();
router.get('/current', authenticateToken, controller.getCurrentPolicy);

module.exports = router;
