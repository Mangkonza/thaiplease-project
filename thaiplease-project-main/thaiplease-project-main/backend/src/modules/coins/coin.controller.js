const db = require('../../config/db');

async function getBalance(req, res) {
  try {
    const result = await db.query(
      `SELECT COALESCE(SUM(amount), 0)::integer AS balance
       FROM coin_ledger WHERE user_id = $1`,
      [req.user.user_id]
    );
    return res.json({ success: true, balance: result.rows[0].balance });
  } catch (error) {
    console.error('Get coin balance error:', error);
    return res.status(500).json({ success: false, message: 'Unable to load coin balance' });
  }
}

async function getTransactions(req, res) {
  try {
    const result = await db.query(
      `SELECT ledger_id, payment_id, amount, reason, created_at
       FROM coin_ledger WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 100`,
      [req.user.user_id]
    );
    return res.json({ success: true, transactions: result.rows });
  } catch (error) {
    console.error('Get coin transactions error:', error);
    return res.status(500).json({ success: false, message: 'Unable to load coin transactions' });
  }
}

async function getPayments(req, res) {
  try {
    const result = await db.query(
      `SELECT p.*, s.name AS shop_name
       FROM payments p JOIN shops s ON s.shop_id = p.shop_id
       WHERE p.user_id = $1 ORDER BY p.created_at DESC LIMIT 100`,
      [req.user.user_id]
    );
    return res.json({ success: true, payments: result.rows });
  } catch (error) {
    console.error('Get payment history error:', error);
    return res.status(500).json({ success: false, message: 'Unable to load payment history' });
  }
}

module.exports = { getBalance, getTransactions, getPayments };
