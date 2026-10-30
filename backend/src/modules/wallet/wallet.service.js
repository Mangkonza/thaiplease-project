const bcrypt = require('bcrypt');

const MAX_TOPUP = 10000;
const PIN_PATTERN = /^\d{6}$/;
const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCK_MINUTES = 15;
const SALT_ROUNDS = 10;

const isValidTopup = (amount) => Number.isFinite(amount) && amount > 0 && amount <= MAX_TOPUP &&
  Math.abs(Math.round(amount * 100) - amount * 100) <= 1e-8;

async function getBalance(client, userId) {
  const result = await client.query(
    'SELECT COALESCE(SUM(amount), 0) AS balance FROM wallet_ledger WHERE user_id = $1',
    [userId]
  );
  return Number(result.rows[0]?.balance ?? 0);
}

const hashPin = (pin) => bcrypt.hash(pin, SALT_ROUNDS);

// ตรวจ PIN และนับครั้งที่ผิด ผิดครบ 5 ครั้งล็อก 15 นาที
// ต้องเรียกใน transaction; ถ้าคืน error ผู้เรียกต้อง COMMIT เพื่อเก็บจำนวนครั้งที่ผิดไว้
async function verifyPin(client, userId, pin, now = new Date()) {
  const result = await client.query(
    'SELECT pin_hash, pin_failed_attempts, pin_locked_until FROM users WHERE user_id = $1 FOR UPDATE',
    [userId]
  );
  const user = result.rows[0];
  if (!user || !user.pin_hash) {
    return { error: { status: 409, code: 'PIN_NOT_SET', message: 'Set a 6-digit PIN before paying' } };
  }
  if (user.pin_locked_until && new Date(user.pin_locked_until) > now) {
    return { error: { status: 423, code: 'PIN_LOCKED', message: 'PIN is locked after too many wrong attempts', locked_until: user.pin_locked_until } };
  }
  if (await bcrypt.compare(pin, user.pin_hash)) {
    if (user.pin_failed_attempts > 0) {
      await client.query('UPDATE users SET pin_failed_attempts = 0, pin_locked_until = NULL WHERE user_id = $1', [userId]);
    }
    return { ok: true };
  }

  const attempts = Number(user.pin_failed_attempts) + 1;
  if (attempts >= PIN_MAX_ATTEMPTS) {
    const lockedUntil = new Date(now.getTime() + PIN_LOCK_MINUTES * 60 * 1000);
    await client.query('UPDATE users SET pin_failed_attempts = 0, pin_locked_until = $2 WHERE user_id = $1', [userId, lockedUntil]);
    return { error: { status: 423, code: 'PIN_LOCKED', message: 'PIN is locked after too many wrong attempts', locked_until: lockedUntil } };
  }
  await client.query('UPDATE users SET pin_failed_attempts = $2 WHERE user_id = $1', [userId, attempts]);
  return { error: { status: 403, code: 'PIN_INCORRECT', message: 'Incorrect PIN', attempts_left: PIN_MAX_ATTEMPTS - attempts } };
}

module.exports = { MAX_TOPUP, PIN_PATTERN, isValidTopup, getBalance, hashPin, verifyPin };
