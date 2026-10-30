// ตัวชี้วัดที่ Admin เลือกดูได้ในกราฟสถิติโครงการ
export const METRICS = {
  gross: { label: 'ยอดซื้อ', money: true },
  subsidy: { label: 'รัฐช่วยจ่าย', money: true },
  rights_uses: { label: 'ครั้งที่ใช้สิทธิ์', unit: 'ครั้ง' },
  active_users: { label: 'คนใช้สิทธิ์', unit: 'คน' },
  total_participants: { label: 'ผู้เข้าร่วมสะสม', unit: 'คน' },
  new_participants: { label: 'ผู้เข้าร่วมใหม่', unit: 'คน' },
  orders: { label: 'จำนวนรายการ', unit: 'รายการ' },
};

export const GRANULARITIES = {
  day: { label: 'รายวัน', unit: 'วัน', span: '30 วัน' },
  month: { label: 'รายเดือน', unit: 'เดือน', span: '12 เดือน' },
  year: { label: 'รายปี', unit: 'ปี', span: '5 ปี' },
};

// % เปลี่ยนแปลงเทียบช่วงก่อน; ช่วงก่อนเป็น 0 แล้วคิด % ไม่ได้ คืน null
export function changePercent(current, previous) {
  if (!previous) return current ? null : 0;
  return ((current - previous) / previous) * 100;
}

const asDate = (period) => {
  const [year, month = '01', day = '01'] = period.split('-');
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
};

// ป้ายของช่วงเวลาแบบไทย (พ.ศ.) short ใช้บนแกนกราฟ
export function periodLabel(granularity, period, short = false) {
  const date = asDate(period);
  const options = { timeZone: 'UTC' };
  if (granularity === 'year') return date.toLocaleDateString('th-TH', { ...options, year: 'numeric' }).replace(/^พ\.ศ\.\s*/, '');
  if (granularity === 'month') return date.toLocaleDateString('th-TH', { ...options, month: short ? 'short' : 'long', year: short ? '2-digit' : 'numeric' });
  return date.toLocaleDateString('th-TH', { ...options, day: 'numeric', month: 'short', ...(short ? {} : { year: 'numeric' }) });
}

export function subLabel(subGranularity) {
  return { hour: 'ชั่วโมง', day: 'วัน', month: 'เดือน' }[subGranularity] || '';
}
