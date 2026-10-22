// ตรวจตัวเลขในข้อความของ AI กับข้อมูลที่ส่งให้ AI (SRS 3.4.2, BR-07)
// คำนวณตอนอ่านรายงานจาก metrics_snapshot ที่บันทึกไว้ จึงใช้กับรายงานเก่าได้และไม่ต้องแก้ schema
// เป็นการตรวจแบบแจ้งเตือน ไม่ปฏิเสธรายงาน เพราะการดึงตัวเลขจากข้อความภาษาไทยอาจจับผิดได้

const NUMBER_PATTERN = /\d+(?:,\d{3})*(?:\.\d+)?/g;
const DAY_MS = 24 * 60 * 60 * 1000;

const round = (value, decimals) => Math.round(value * 10 ** decimals) / 10 ** decimals;
const daysInPeriod = (period) => Math.round((Date.parse(period.end) - Date.parse(period.start)) / DAY_MS) + 1;

// ค่าที่ AI อ้างได้: ตัวชี้วัดทั้งสองช่วง, ผลต่าง, % เปลี่ยนแปลง, วันที่ของช่วง และค่าในข้อเสนอ
function referenceValues(snapshot, suggestions) {
  const values = new Set();
  const add = (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) values.add(Math.abs(value));
  };

  const current = snapshot.metrics || {};
  const previous = snapshot.comparison?.metrics || {};
  for (const key of new Set([...Object.keys(current), ...Object.keys(previous)])) {
    add(current[key]);
    add(previous[key]);
    if (typeof current[key] === 'number' && typeof previous[key] === 'number') add(current[key] - previous[key]);
  }
  Object.values(snapshot.change_percent || {}).forEach(add);
  // repeat_rate เก็บเป็นทศนิยม แต่ AI มักเขียนเป็นเปอร์เซ็นต์ เช่น 0.9167 = 91.67%
  [current.repeat_rate, previous.repeat_rate].forEach((rate) => add(typeof rate === 'number' ? rate * 100 : null));

  for (const period of [snapshot.period, snapshot.comparison?.period].filter(Boolean)) {
    for (const isoDate of [period.start, period.end]) {
      const [year, month, day] = isoDate.split('-').map(Number);
      [year, year + 543, month, day].forEach(add); // ปี ค.ศ. และ พ.ศ.
    }
    add(daysInPeriod(period));
  }

  add(suggestions.length);
  for (const suggestion of suggestions) {
    add(suggestion.rank);
    Object.values(suggestion.parameters || {}).forEach(add);
  }
  return [...values];
}

// ตัวเลขที่เขียนไว้ตรงกับค่าอ้างอิงเมื่อปัดเป็นจำนวนทศนิยมเท่ากัน เช่น "33.3" ตรงกับ 33.33 แต่ "30" ไม่ตรงกับ 30.76
function isSupported(written, references) {
  const decimals = (written.split('.')[1] || '').length;
  const value = Number(written.replace(/,/g, ''));
  return references.some((reference) => Math.abs(round(reference, decimals) - value) < 1e-9);
}

/**
 * @returns {{ checked: number, unverified: string[] }} จำนวนตัวเลข (ไม่ซ้ำ) ที่พบ และตัวเลขที่หาที่มาไม่ได้
 */
function checkReportNumbers(report) {
  const suggestions = report.suggestions || [];
  const texts = [report.summary, report.problem, ...(report.possible_causes || []), ...suggestions.map((s) => s.reason)];
  const written = [...new Set(texts.filter(Boolean).flatMap((text) => text.match(NUMBER_PATTERN) || []))];
  const references = referenceValues(report.metrics_snapshot || {}, suggestions);
  return {
    checked: written.length,
    unverified: written.filter((number) => !isSupported(number, references)),
  };
}

module.exports = { checkReportNumbers };
