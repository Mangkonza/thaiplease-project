const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const PAY_PATH = new RegExp(`^/pay/(${UUID})/?$`, 'i');

// ข้อความใน QR รับเงิน: ลิงก์ /pay/<requestId> ของคำขอรับเงินที่ร้านใส่ยอดไว้ (ใช้ได้ 5 นาที)
export function buildPayUrl(origin, requestId) {
  return `${origin}/pay/${requestId}`;
}

// อ่าน id ของคำขอรับเงินจากข้อความที่สแกนได้ ยอมรับทุก origin เพราะเครื่องที่สร้าง QR อาจเปิดเว็บด้วยที่อยู่ต่างจากเครื่องที่สแกน
export function parsePaymentRequestIdFromQr(text) {
  if (typeof text !== 'string') return null;
  let url;
  try {
    url = new URL(text.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  const match = url.pathname.match(PAY_PATH);
  return match ? match[1].toLowerCase() : null;
}

// หน้าแรกของแต่ละบทบาท: ร้านค้าและผู้ดูแลเข้าหน้าจัดการของตัวเองทันที
export function homePathFor(user) {
  if (!user) return '/login';
  if (user.role === 'MERCHANT') return '/merchant/shops';
  if (user.role === 'ADMIN') return '/admin/shops';
  return '/home';
}

// รูปถูกเสิร์ฟจาก backend ที่ /uploads ซึ่งตอนพัฒนาอยู่คนละ origin กับหน้าเว็บ
export function uploadUrl(apiBaseUrl, imagePath, pageOrigin) {
  if (!imagePath) return null;
  const origin = new URL(apiBaseUrl, pageOrigin).origin;
  return `${origin}/uploads/${imagePath}`;
}
