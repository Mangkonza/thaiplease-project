// คำนวณช่วงเวลา WEEK (จันทร์-อาทิตย์) และ MONTH (เดือนปฏิทิน) ตามเวลาไทย
// ทำงานกับวันที่รูปแบบ 'YYYY-MM-DD' ทั้งหมด เพื่อไม่ให้ timezone ของเครื่องที่รัน server มีผล

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000; // ประเทศไทยไม่มี daylight saving
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PERIOD_TYPES = { week: 'WEEK', month: 'MONTH' };

const toDate = (isoDate) => new Date(`${isoDate}T00:00:00Z`);
const toIso = (date) => date.toISOString().slice(0, 10);
const addDays = (isoDate, days) => {
  const date = toDate(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return toIso(date);
};

function bangkokToday(now = new Date()) {
  return toIso(new Date(now.getTime() + BANGKOK_OFFSET_MS));
}

function isValidIsoDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const date = toDate(value);
  return !Number.isNaN(date.getTime()) && toIso(date) === value; // ตัดวันที่ไม่มีจริง เช่น 2026-02-30
}

// คืนช่วงเวลาที่มีวัน isoDate อยู่
function periodContaining(periodType, isoDate) {
  if (periodType === 'WEEK') {
    const mondayOffset = (toDate(isoDate).getUTCDay() + 6) % 7; // จันทร์ = 0
    const start = addDays(isoDate, -mondayOffset);
    return { type: 'WEEK', start, end: addDays(start, 6) };
  }
  const [year, month] = isoDate.split('-').map(Number);
  const start = toIso(new Date(Date.UTC(year, month - 1, 1)));
  const end = toIso(new Date(Date.UTC(year, month, 0)));
  return { type: 'MONTH', start, end };
}

function previousPeriod(period) {
  return periodContaining(period.type, addDays(period.start, -1));
}

/**
 * แปลง query ?period=week|month&date=YYYY-MM-DD เป็นช่วงเวลา
 * ไม่ระบุ date = ช่วงล่าสุดที่จบไปแล้ว (เช่น สัปดาห์ที่แล้ว) เพื่อให้ตัวเลขที่ส่งให้ AI ครบทั้งช่วง
 * @returns {{ period?: {type, start, end}, error?: string }}
 */
function resolvePeriod(periodParam = 'week', dateParam, now = new Date()) {
  const periodType = PERIOD_TYPES[String(periodParam).toLowerCase()];
  if (!periodType) {
    return { error: "period must be 'week' or 'month'" };
  }

  if (dateParam === undefined) {
    return { period: previousPeriod(periodContaining(periodType, bangkokToday(now))) };
  }

  if (!isValidIsoDate(dateParam)) {
    return { error: 'date must be a real date in YYYY-MM-DD format' };
  }
  return { period: periodContaining(periodType, dateParam) };
}

module.exports = {
  resolvePeriod,
  previousPeriod,
  periodContaining,
  bangkokToday,
  addDays,
};
