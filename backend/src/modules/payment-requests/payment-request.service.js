// คำขอรับเงินแบบไทยพลัส: ร้านใส่ยอด ได้ QR ที่ใช้ได้ภายใน 5 นาทีและจ่ายได้ครั้งเดียว
const PAYMENT_REQUEST_TTL_MS = 5 * 60 * 1000;

// สถานะที่ผู้ใช้เห็น: คำขอที่ยังไม่จ่ายแต่เลยเวลาแล้วถือว่าหมดอายุ (ไม่ได้เก็บเป็นสถานะในตาราง)
function requestState(row, now = new Date()) {
  if (row.status !== 'PENDING') return row.status;
  return new Date(row.expires_at) <= now ? 'EXPIRED' : 'PENDING';
}

// ข้อความ error เมื่อคำขอจ่ายไม่ได้แล้ว ใช้ร่วมกันระหว่างหน้าแสดงยอดก่อนจ่ายและการจ่ายจริง
const UNPAYABLE = {
  PAID: { status: 409, code: 'REQUEST_ALREADY_PAID', message: 'This payment request has already been paid' },
  CANCELLED: { status: 409, code: 'REQUEST_CANCELLED', message: 'The shop cancelled this payment request' },
  EXPIRED: { status: 410, code: 'REQUEST_EXPIRED', message: 'This payment request has expired, ask the shop for a new QR' },
};

// อ่านคำขอที่จะจ่าย ถ้า lock = true ต้องเรียกใน transaction เพื่อกันการจ่ายคำขอเดียวกันซ้ำพร้อมกัน
async function loadPayableRequest(client, requestId, { lock = false, now = new Date() } = {}) {
  const result = await client.query(
    `SELECT request_id, shop_id, amount, status, expires_at, payment_id
     FROM payment_requests WHERE request_id = $1${lock ? ' FOR UPDATE' : ''}`,
    [requestId]
  );
  if (!result.rows.length) return { error: { status: 404, code: 'REQUEST_NOT_FOUND', message: 'Payment request not found' } };
  const request = result.rows[0];
  const state = requestState(request, now);
  if (state !== 'PENDING') return { error: UNPAYABLE[state] };
  return { request: { ...request, amount: Number(request.amount) } };
}

function serializeRequest(row, now = new Date()) {
  return {
    request_id: row.request_id,
    shop_id: row.shop_id,
    amount: Number(row.amount),
    status: requestState(row, now),
    expires_at: row.expires_at,
    created_at: row.created_at,
    payment_id: row.payment_id,
    // ให้หน้าเว็บนับถอยหลังตามเวลาของ server ไม่ใช่นาฬิกาของเครื่องผู้ใช้
    server_time: now.toISOString(),
  };
}

module.exports = { PAYMENT_REQUEST_TTL_MS, requestState, loadPayableRequest, serializeRequest };
