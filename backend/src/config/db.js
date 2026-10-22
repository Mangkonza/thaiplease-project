const { Pool } = require('pg');
require('dotenv').config();

// ไม่ใส่ค่า default ของ credential ในโค้ด ต้องมาจาก backend/.env เท่านั้น
const missingEnv = ['DB_USER', 'DB_PASSWORD', 'DB_NAME'].filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
  throw new Error(
    `Missing required database environment variables: ${missingEnv.join(', ')}. ` +
      'Copy backend/.env.example to backend/.env and fill in the values.'
  );
}

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL Database');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle database client', err);
  process.exit(-1);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};