const jwt = require('jsonwebtoken');

// ตรวจสอบความถูกต้องของ JWT Token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // รูปแบบ "Bearer <token>"

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access Denied: No token provided',
    });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decodedUser) => {
    if (err) {
      return res.status(403).json({
        success: false,
        message: 'Invalid or expired token',
      });
    }

    req.user = decodedUser; // เก็บข้อมูล { user_id, email, role, status } ไว้ใน req.user
    next();
  });
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