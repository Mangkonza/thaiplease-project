const jwt = require('jsonwebtoken');
const db = require('../config/db');

// ตรวจสอบความถูกต้องของ JWT Token และสถานะบัญชีปัจจุบันในฐานข้อมูล
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // รูปแบบ "Bearer <token>"

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access Denied: No token provided',
    });
  }

  let decodedUser;
  try {
    decodedUser = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    // Token ผิดหรือหมดอายุ = ยืนยันตัวตนไม่ผ่าน (401 ตาม SRS 3.5.3)
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token',
    });
  }

  try {
    // JWT ยังไม่หมดอายุแต่บัญชีอาจถูกระงับหลัง Login จึงต้องเช็คสถานะจริงทุกครั้ง (FR-01)
    const result = await db.query('SELECT status FROM users WHERE user_id = $1', [decodedUser.user_id]);

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'User account no longer exists',
      });
    }

    if (result.rows[0].status !== 'ACTIVE') {
      return res.status(403).json({
        success: false,
        message: 'Account is suspended or inactive',
      });
    }

    req.user = decodedUser; // เก็บข้อมูล { user_id, email, role, status } ไว้ใน req.user
    next();
  } catch (error) {
    console.error('Authenticate token error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while verifying account status',
    });
  }
};

// ตรวจสอบสิทธิ์ตามบทบาท (Role Guard)
const authorizeRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: Requires one of [${allowedRoles.join(', ')}] role`,
      });
    }
    next();
  };
};

module.exports = {
  authenticateToken,
  authorizeRole,
};
