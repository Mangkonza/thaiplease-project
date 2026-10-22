const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { resolvePeriod, previousPeriod, bangkokToday } = require('../src/modules/analytics/analytics.period');

describe('resolvePeriod', () => {
  test('week containing a Thursday runs Monday to Sunday', () => {
    assert.deepEqual(resolvePeriod('week', '2026-10-22').period, { type: 'WEEK', start: '2026-10-19', end: '2026-10-25' });
  });

  test('Sunday belongs to the week that started on the Monday before', () => {
    assert.deepEqual(resolvePeriod('week', '2026-10-18').period, { type: 'WEEK', start: '2026-10-12', end: '2026-10-18' });
  });

  test('month covers the whole calendar month, including leap February', () => {
    assert.deepEqual(resolvePeriod('month', '2028-02-10').period, { type: 'MONTH', start: '2028-02-01', end: '2028-02-29' });
  });

  test('period is case-insensitive and defaults to week', () => {
    assert.equal(resolvePeriod('MONTH', '2026-10-01').period.type, 'MONTH');
    assert.equal(resolvePeriod(undefined, '2026-10-01').period.type, 'WEEK');
  });

  test('without date returns the last completed week in Bangkok time', () => {
    const thursdayInBangkok = new Date('2026-10-22T03:00:00Z');
    assert.deepEqual(resolvePeriod('week', undefined, thursdayInBangkok).period, { type: 'WEEK', start: '2026-10-12', end: '2026-10-18' });
  });

  test('Bangkok date is used even when UTC is still the previous day', () => {
    // 2026-10-18T18:00Z = จันทร์ 19 ต.ค. 01:00 เวลาไทย -> สัปดาห์ 12-18 จบแล้ว
    const now = new Date('2026-10-18T18:00:00Z');
    assert.equal(bangkokToday(now), '2026-10-19');
    assert.deepEqual(resolvePeriod('week', undefined, now).period, { type: 'WEEK', start: '2026-10-12', end: '2026-10-18' });
  });

  test('without date returns the previous month, crossing the year', () => {
    assert.deepEqual(resolvePeriod('month', undefined, new Date('2027-01-15T05:00:00Z')).period, { type: 'MONTH', start: '2026-12-01', end: '2026-12-31' });
  });

  test('rejects unknown period and invalid dates', () => {
    assert.match(resolvePeriod('year', '2026-10-01').error, /week' or 'month/);
    assert.match(resolvePeriod('week', '2026-02-30').error, /real date/);
    assert.match(resolvePeriod('week', '22/10/2026').error, /YYYY-MM-DD/);
  });
});

describe('previousPeriod', () => {
  test('previous week is the 7 days before', () => {
    assert.deepEqual(previousPeriod({ type: 'WEEK', start: '2026-10-12', end: '2026-10-18' }), { type: 'WEEK', start: '2026-10-05', end: '2026-10-11' });
  });

  test('previous month of March is February', () => {
    assert.deepEqual(previousPeriod({ type: 'MONTH', start: '2026-03-01', end: '2026-03-31' }), { type: 'MONTH', start: '2026-02-01', end: '2026-02-28' });
  });
});
