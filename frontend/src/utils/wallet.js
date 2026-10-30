import { formatBaht } from './format.js';

export const PIN_LENGTH = 6;
export const QUICK_TOPUPS = [100, 300, 500, 1000];

export const WALLET_REASON_TEXT = {
  OPENING: 'ยอดเริ่มต้น',
  TOPUP: 'เติมเงิน',
  PAYMENT: 'จ่ายเงิน',
  REFUND: 'คืนเงิน',
};

// แปลง error ที่ backend ส่ง code มาเป็นข้อความภาษาไทยที่บอกว่าต้องทำอะไรต่อ
export function walletErrorMessage(body, fallback) {
  switch (body?.code) {
    case 'PIN_INCORRECT':
      return `PIN ไม่ถูกต้อง เหลือโอกาสอีก ${body.attempts_left} ครั้ง`;
    case 'PIN_LOCKED':
      return `ใส่ PIN ผิดหลายครั้ง ระบบล็อกการจ่ายเงินถึง ${new Date(body.locked_until).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' })} น.`;
    case 'PIN_NOT_SET':
      return 'กรุณาตั้ง PIN 6 หลักก่อนจ่ายเงิน';
    case 'INSUFFICIENT_BALANCE':
      return `ยอดเงินในกระเป๋าไม่พอ มี ${formatBaht(body.balance)} แต่ต้องจ่าย ${formatBaht(body.required)}`;
    case 'CURRENT_PIN_REQUIRED':
      return 'กรุณาใส่ PIN เดิมก่อนเปลี่ยน PIN';
    case 'IMAGE_TOO_LARGE':
      return 'รูปต้องมีขนาดไม่เกิน 2 MB';
    case 'IMAGE_TYPE':
      return 'รองรับเฉพาะรูป JPG, PNG หรือ WEBP';
    default:
      return body?.message || fallback;
  }
}
