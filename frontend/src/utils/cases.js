// คำขอคืนเงิน/ร้องเรียน ต้องตรงกับ backend/src/modules/cases/case.service.js
export const REFUND_WINDOW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export const CASE_TYPE_TEXT = { REFUND: 'ขอคืนเงิน', COMPLAINT: 'ร้องเรียน' };

export const CASE_STATUS = {
  PENDING: { text: 'รอพิจารณา', className: 'status-pending' },
  APPROVED: { text: 'อนุมัติแล้ว', className: 'status-active' },
  REJECTED: { text: 'ไม่อนุมัติ', className: 'status-cancelled' },
  RESOLVED: { text: 'ปิดเรื่องแล้ว', className: 'status-ended' },
};

const hasOpenCase = (cases, paymentId, type) => cases.some((item) => (
  item.payment_id === paymentId && item.case_type === type && item.status === 'PENDING'
));

export function canRequestRefund(payment, cases, now = new Date()) {
  return payment.status === 'SUCCESS' &&
    now.getTime() - new Date(payment.paid_at || payment.created_at).getTime() <= REFUND_WINDOW_DAYS * DAY_MS &&
    !hasOpenCase(cases, payment.payment_id, 'REFUND');
}

export function canComplain(payment, cases) {
  return !hasOpenCase(cases, payment.payment_id, 'COMPLAINT');
}
