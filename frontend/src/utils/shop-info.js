// ลิงก์เปิด Google Maps: ใช้พิกัดถ้ามี ไม่งั้นค้นหาด้วยชื่อร้านและที่อยู่ (ไม่ต้องใช้ API key)
export function mapsUrl(shop) {
  if (!shop) return null;
  const hasPoint = shop.latitude !== null && shop.latitude !== undefined && shop.longitude !== null && shop.longitude !== undefined;
  const query = hasPoint ? `${Number(shop.latitude)},${Number(shop.longitude)}` : [shop.name, shop.address].filter(Boolean).join(' ');
  if (!hasPoint && !shop.address) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function menuPriceText(price) {
  return price === null || price === undefined ? 'ราคาตามจริง' : `${Number(price).toLocaleString('th-TH')} บาท`;
}
