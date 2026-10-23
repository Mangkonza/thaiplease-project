const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { checkReportNumbers } = require('../src/modules/ai-reports/ai-report.numbers');

// ตัวเลขจริงของร้านกาแฟบ้านสวน สัปดาห์ 12-18 ต.ค. 2026 (seed --end 2026-10-18)
const metricsSnapshot = {
  period: { type: 'WEEK', start: '2026-10-12', end: '2026-10-18' },
  metrics: { revenue: 1925, orders: 12, unique_buyers: 12, new_customers: 1, repeat_customers: 11, aov: 160.42, purchase_frequency: 1, repeat_rate: 0.9167 },
  comparison: {
    period: { type: 'WEEK', start: '2026-10-05', end: '2026-10-11' },
    metrics: { revenue: 2780, orders: 18, unique_buyers: 18, new_customers: 4, repeat_customers: 14, aov: 154.44, purchase_frequency: 1, repeat_rate: 0.7778 },
  },
  change_percent: { revenue: -30.76, orders: -33.33, unique_buyers: -33.33, new_customers: -75, repeat_customers: -21.43, aov: 3.87, purchase_frequency: 0, repeat_rate: 17.86 },
};

const suggestions = [
  { rank: 1, parameters: { discount_percent: 10, max_discount: 50 }, reason: '' },
  { rank: 2, parameters: { discount_percent: 5, min_spend: 150 }, reason: '' },
  { rank: 3, parameters: { bonus_coin: 10, min_spend: 160 }, reason: '' },
];

const reportWith = (texts) => ({
  metrics_snapshot: metricsSnapshot,
  summary: texts.summary || '',
  problem: texts.problem || '',
  possible_causes: texts.causes || [],
  suggestions: suggestions.map((s, i) => ({ ...s, reason: (texts.reasons || [])[i] || '' })),
});

describe('checkReportNumbers (SRS 3.4.2)', () => {
  test('real Gemini report from the demo: every number traces back to the data', () => {
    const result = checkReportNumbers(reportWith({
      summary: 'ยอดขายสัปดาห์นี้ลดลงเหลือ 1925 บาท และจำนวนคำสั่งซื้อลดลงเหลือ 12 ออเดอร์',
      problem: 'รายได้รวมและจำนวนลูกค้าใหม่ลดลงอย่างมากจากสัปดาห์ก่อนหน้า โดยลูกค้าใหม่ลดลง 75 เปอร์เซ็นต์',
      causes: ['ลูกค้าใหม่ลดลงทำให้คำสั่งซื้อรวมลดลง', 'จำนวนผู้ซื้อที่ไม่ซ้ำกันลดลง 33.33 เปอร์เซ็นต์'],
      reasons: [
        'ช่วยดึงดูดลูกค้าใหม่ให้ตัดสินใจซื้อครั้งแรกได้ง่ายขึ้นเนื่องจากลูกค้าใหม่ลดลง 75 เปอร์เซ็นต์',
        'กระตุ้นยอดขายรวมที่ลดลง 30.76 เปอร์เซ็นต์ และเพิ่มคำสั่งซื้อที่ลดลง 33.33 เปอร์เซ็นต์',
        'รักษาฐานลูกค้าเดิมที่มีอยู่ 11 รายให้กลับมาซื้อซ้ำอย่างต่อเนื่อง',
      ],
    }));
    assert.deepEqual(result, { checked: 6, unverified: [] });
  });

  test('flags a number that does not exist in the data', () => {
    const result = checkReportNumbers(reportWith({ summary: 'ยอดขายสัปดาห์นี้ 5,000 บาท ลดลง 30.76%' }));
    assert.deepEqual(result, { checked: 2, unverified: ['5,000'] });
  });

  test('accepts differences between the two periods and the previous values', () => {
    const result = checkReportNumbers(reportWith({ problem: 'ยอดขายลดลง 855 บาท ลูกค้าใหม่เหลือ 1 คนจาก 4 คน' }));
    assert.deepEqual(result.unverified, []);
  });

  test('accepts rounding to fewer decimals but not truncation', () => {
    assert.deepEqual(checkReportNumbers(reportWith({ summary: 'ลดลง 33.3% และ AOV ประมาณ 160 บาท' })).unverified, []);
    assert.deepEqual(checkReportNumbers(reportWith({ summary: 'ยอดขายลดลง 30%' })).unverified, ['30']);
  });

  test('accepts period dates (Buddhist year), rates written as percent and suggestion parameters', () => {
    const result = checkReportNumbers(reportWith({
      summary: 'สัปดาห์ 12–18 ต.ค. 2569 อัตราซื้อซ้ำ 91.67%',
      reasons: ['ส่วนลด 10% สูงสุด 50 บาท', 'ซื้อครบ 150 บาท ลด 5%', 'รับ 10 Coin เมื่อซื้อครบ 160 บาท'],
    }));
    assert.deepEqual(result.unverified, []);
  });

  test('a comma after a number is punctuation, not a thousands separator', () => {
    const result = checkReportNumbers(reportWith({ summary: 'ยอดขาย 1925, ออเดอร์ 12' }));
    assert.deepEqual(result, { checked: 2, unverified: [] });
  });

  test('a report without numbers has nothing to check', () => {
    assert.deepEqual(checkReportNumbers(reportWith({ summary: 'ลูกค้าใหม่ลดลง' })), { checked: 0, unverified: [] });
  });
});
