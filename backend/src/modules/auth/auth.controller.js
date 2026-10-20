const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../../config/db');

// POST /api/v1/auth/register (เพิ่มเพื่อใช้สร้างผู้ใช้ใหม่ตาม GAP-01)
const register = async (req, res) => {
  const { email, password, display_name, role } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required' });
  }

  // อนุญาตให้สมัครเป็น CITIZEN หรือ MERCHANT (ADMIN ไม่อนุญาตให้สมัครแบบ Public)
  const userRole = role === 'MERCHANT' ? 'MERCHANT' : 'CITIZEN';

  try {
    // ตรวจสอบว่ามีอีเมลนี้อยู่แล้วหรือไม่
    const existing = await db.query('SELECT user_id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Email is already registered' });
    }

    // แฮชรหัสผ่านด้วย bcrypt
    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);

    const result = await db.query(
      `INSERT INTO users (email, password_hash, display_name, role, status)
       VALUES ($1, $2, $3, $4, 'ACTIVE')
       RETURNING user_id, email, display_name, role, status, created_at`,
      [email, password_hash, display_name || null, userRole]
    );

    const newUser = result.rows[0];

    return res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user: newUser,
    });
  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// POST /api/v1/auth/login (FR-01 ตามข้อกำหนด SRS)
const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required' });
  }

  try {
    const result = await db.query(
      'SELECT user_id, email, password_hash, display_name, role, status FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const user = result.rows[0];

    // ตรวจสอบสถานะการใช้งาน (ต้อง ACTIVE เท่านั้น)
    if (user.status !== 'ACTIVE') {
      return res.status(403).json({ success: false, message: 'Account is suspended or inactive' });
    }

    // ตรวจสอบรหัสผ่าน
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    // สร้าง JWT Token
    const payload = {
      user_id: user.user_id,
      email: user.email,
      role: user.role,
      status: user.status,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '1d',
    });

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        user_id: user.user_id,
        email: user.email,
        display_name: user.display_name,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// GET /api/v1/auth/me (ดูข้อมูลบัญชีตัวเองจาก Token)
const getMe = async (req, res) => {
  try {
    const result = await db.query(
      'SELECT user_id, email, display_name, role, status, created_at FROM users WHERE user_id = $1',
      [req.user.user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.status(200).json({
      success: true,
      user: result.rows[0],
    });
  } catch (error) {
    console.error('Get profile error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

module.exports = {
  register,
  login,
  getMe,
};