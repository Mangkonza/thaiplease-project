// นับถอยหลังตามเวลาของ server: เครื่องลูกค้าอาจตั้งนาฬิกาไม่ตรง จึงเก็บส่วนต่างตอนโหลดข้อมูลไว้ชดเชย
export function clockOffset(serverTime, clientTimeAtFetch) {
  const server = new Date(serverTime).getTime();
  return Number.isFinite(server) ? server - clientTimeAtFetch : 0;
}

export function secondsLeft(expiresAt, offset, clientNow) {
  const ms = new Date(expiresAt).getTime() - (clientNow + offset);
  return Math.max(0, Math.ceil(ms / 1000));
}

export function formatCountdown(seconds) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}
