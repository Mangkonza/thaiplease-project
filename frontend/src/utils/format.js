// ตัวช่วยแสดงผลหน้า Dashboard และ AI Report (ไม่มี JSX จึง test ด้วย node --test ได้)

const toUtcDate = (isoDate) => new Date(`${isoDate}T00:00:00Z`);

const shortDate = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const monthYear = new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const dateTime = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' });

export function formatNumber(value, maximumFractionDigits = 2) {
  if (value === null || value === undefined) return '—';
  return Number(value).toLocaleString('th-TH', { maximumFractionDigits });
}

export function formatChange(percent) {
  if (percent === null || percent === undefined) return '—';
  const sign = percent > 0 ? '+' : '';
  return `${sign}${formatNumber(percent)}%`;
}

// WEEK: "12–18 ต.ค. 2569", MONTH: "ตุลาคม 2569"
export function formatPeriod(period) {
  if (period.type === 'MONTH') return monthYear.format(toUtcDate(period.start));
  return shortDate.formatRange(toUtcDate(period.start), toUtcDate(period.end));
}

export function formatDateTime(isoTimestamp) {
  return dateTime.format(new Date(isoTimestamp));
}

export function bangkokToday(now = new Date()) {
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
}

export function shiftDate(isoDate, days) {
  const date = toUtcDate(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// ลำดับและข้อความของ parameter ตาม parameter_schema ของ promotion_templates
const PARAMETER_TEXT = {
  discount_percent: (v) => `ส่วนลด ${formatNumber(v)}%`,
  discount_amount: (v) => `ลด ${formatNumber(v)} บาท`,
  max_discount: (v) => `ลดสูงสุด ${formatNumber(v)} บาท`,
  min_spend: (v) => `ยอดซื้อขั้นต่ำ ${formatNumber(v)} บาท`,
  bonus_coin: (v) => `รับเพิ่ม ${formatNumber(v)} Coin`,
  multiplier: (v) => `Coin x${formatNumber(v)}`,
  reward_value: (v) => `รางวัลมูลค่า ${formatNumber(v)} บาท`,
  inactive_days: (v) => `ลูกค้าที่หายไป ${formatNumber(v)} วันขึ้นไป`,
  required_orders: (v) => `ซื้อครบ ${formatNumber(v)} ครั้ง`,
  reward_coins: (v) => `รับ ${formatNumber(v)} Coin`,
  start_time: (v) => `ตั้งแต่ ${v} น.`,
  end_time: (v) => `ถึง ${v} น.`,
  target_days: (v) => `เฉพาะวัน ${v.join(', ')}`,
};

export function describeParameters(parameters = {}) {
  const known = Object.keys(PARAMETER_TEXT).filter((key) => key in parameters);
  const unknown = Object.keys(parameters).filter((key) => !(key in PARAMETER_TEXT));
  return [
    ...known.map((key) => PARAMETER_TEXT[key](parameters[key])),
    ...unknown.map((key) => `${key}: ${JSON.stringify(parameters[key])}`),
  ];
}

const KPI_TEXT = {
  conversion_rate: 'อัตราการซื้อ',
  new_customer_conversion: 'อัตราลูกค้าใหม่',
  reactivation_rate: 'อัตราลูกค้าเก่ากลับมาซื้อ',
  repeat_rate: 'อัตราการซื้อซ้ำ',
  purchase_frequency: 'ความถี่การซื้อ',
  aov: 'ยอดเฉลี่ยต่อออเดอร์',
  revenue: 'ยอดขาย',
  orders: 'จำนวนออเดอร์',
};

export function describeKpi(kpi) {
  return KPI_TEXT[kpi] || kpi;
}

// ข้อความตาม SRS 3.6.4 แยกตาม reason ที่ backend ส่งมา
export function aiErrorMessage(responseBody) {
  switch (responseBody?.reason) {
    case 'INSUFFICIENT_DATA':
      return 'ข้อมูลช่วงเวลานี้ยังไม่เพียงพอสำหรับสร้างคำแนะนำ';
    case 'AI_UNAVAILABLE':
    case 'AI_NOT_CONFIGURED':
      return 'รายงาน AI ยังไม่พร้อมใช้งาน โปรดลองอีกครั้ง (การทำรายการอื่นยังใช้งานได้ตามปกติ)';
    case 'AI_INVALID_OUTPUT':
      return 'AI ตอบกลับในรูปแบบที่ตรวจสอบไม่ผ่าน ระบบจึงไม่บันทึกผล โปรดลองอีกครั้ง';
    default:
      return responseBody?.message
        ? `สร้างรายงานไม่สำเร็จ: ${responseBody.message}`
        : 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ โปรดลองอีกครั้ง';
  }
}
