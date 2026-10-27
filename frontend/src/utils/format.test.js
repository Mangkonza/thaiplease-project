import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatNumber, formatChange, formatPeriod, formatDateTime, bangkokToday, shiftDate,
  describeParameters, describeKpi, aiErrorMessage,
  campaignKpiKind, formatCampaignMetric, formatUplift,
} from './format.js';

describe('campaign result units follow the promotion template (D-04)', () => {
  test('KPI kind comes from the template code, not from free-text target_kpi', () => {
    assert.equal(campaignKpiKind('PERCENT_DISCOUNT'), 'rate');
    assert.equal(campaignKpiKind('BONUS_COIN'), 'frequency');
    assert.equal(campaignKpiKind('MIN_SPEND_REWARD'), 'aov');
  });

  test('rate uplift is already in percentage points and is not multiplied again', () => {
    // ค่าจริงจากการทดสอบ: treatment 0.6667, control 0.7143 -> uplift -4.7619 จุด %
    assert.equal(formatUplift(-4.7619, 'PERCENT_DISCOUNT'), '-4.76 จุด %');
    assert.equal(formatUplift(12.5, 'NEW_CUSTOMER'), '+12.5 จุด %');
  });

  test('group metrics show rates as percent and other KPIs with their units', () => {
    assert.equal(formatCampaignMetric(0.6667, 'PERCENT_DISCOUNT'), '66.67%');
    assert.equal(formatCampaignMetric(1.25, 'FREQUENCY_REWARD'), '1.25 ครั้ง/คน');
    assert.equal(formatCampaignMetric(160.4166, 'MIN_SPEND_REWARD'), '160.42 บาท');
    assert.equal(formatUplift(50, 'MIN_SPEND_REWARD'), '+50 บาท');
  });

  test('missing values say they could not be calculated', () => {
    assert.equal(formatCampaignMetric(null, 'PERCENT_DISCOUNT'), 'คำนวณไม่ได้');
    assert.equal(formatUplift(null, 'PERCENT_DISCOUNT'), 'คำนวณไม่ได้');
  });
});

describe('numbers', () => {
  test('formats with thousands separator and up to 2 decimals', () => {
    assert.equal(formatNumber(1925), '1,925');
    assert.equal(formatNumber(160.4166), '160.42');
  });

  test('null means "no value" (AOV with 0 orders, SRS 2.7)', () => {
    assert.equal(formatNumber(null), '—');
    assert.equal(formatChange(null), '—');
  });

  test('change shows an explicit sign', () => {
    assert.equal(formatChange(3.87), '+3.87%');
    assert.equal(formatChange(-30.76), '-30.76%');
    assert.equal(formatChange(0), '0%');
  });
});

describe('dates', () => {
  test('week label uses a compact Thai range', () => {
    assert.equal(formatPeriod({ type: 'WEEK', start: '2026-10-12', end: '2026-10-18' }), '12–18 ต.ค. 2569');
    assert.equal(formatPeriod({ type: 'WEEK', start: '2026-09-28', end: '2026-10-04' }), '28 ก.ย. – 4 ต.ค. 2569');
  });

  test('month label is month name and Buddhist year', () => {
    assert.equal(formatPeriod({ type: 'MONTH', start: '2026-10-01', end: '2026-10-31' }), 'ตุลาคม 2569');
  });

  test('timestamps are shown in Bangkok time', () => {
    assert.equal(formatDateTime('2026-10-22T10:05:00Z'), '22 ต.ค. 2569 17:05');
  });

  test('today follows Bangkok, not UTC', () => {
    assert.equal(bangkokToday(new Date('2026-10-18T18:00:00Z')), '2026-10-19');
  });

  test('shiftDate moves across months', () => {
    assert.equal(shiftDate('2026-10-01', -1), '2026-09-30');
    assert.equal(shiftDate('2026-10-18', 1), '2026-10-19');
  });
});

describe('AI report text', () => {
  test('describes template parameters in Thai, in a stable order', () => {
    assert.deepEqual(describeParameters({ min_spend: 150, discount_percent: 5 }), ['ส่วนลด 5%', 'ยอดซื้อขั้นต่ำ 150 บาท']);
    assert.deepEqual(describeParameters({ target_days: ['MON', 'TUE'], discount_percent: 10 }), ['ส่วนลด 10%', 'เฉพาะวัน MON, TUE']);
  });

  test('unknown parameter keys are still shown, not hidden', () => {
    assert.deepEqual(describeParameters({ surprise: 1 }), ['surprise: 1']);
  });

  test('known KPI codes get Thai labels, unknown ones are shown as-is', () => {
    assert.equal(describeKpi('new_customer_conversion'), 'อัตราลูกค้าใหม่');
    assert.equal(describeKpi('something_else'), 'something_else');
  });

  test('error messages follow SRS 3.6.4 by reason', () => {
    assert.match(aiErrorMessage({ reason: 'INSUFFICIENT_DATA' }), /ยังไม่เพียงพอ/);
    assert.match(aiErrorMessage({ reason: 'AI_UNAVAILABLE' }), /การทำรายการอื่นยังใช้งานได้/);
    assert.match(aiErrorMessage({ reason: 'AI_INVALID_OUTPUT' }), /ไม่บันทึกผล/);
    assert.equal(aiErrorMessage({ message: 'boom' }), 'สร้างรายงานไม่สำเร็จ: boom');
    assert.equal(aiErrorMessage(undefined), 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ โปรดลองอีกครั้ง');
  });
});
