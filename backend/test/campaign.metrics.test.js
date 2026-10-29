const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { campaignKpi, evaluateCampaign } = require('../src/modules/campaigns/campaign.metrics');

const campaign = {
  template_code: 'PERCENT_DISCOUNT',
  parameters: { discount_percent: 10, min_spend: 100 },
  start_at: '2026-01-08T00:00:00.000Z',
  end_at: '2026-01-15T00:00:00.000Z',
};

function assignments(treatmentSize = 20, controlSize = 20) {
  return [
    ...Array.from({ length: treatmentSize }, (_, index) => ({ user_id: `t${index}`, group_type: 'TREATMENT' })),
    ...Array.from({ length: controlSize }, (_, index) => ({ user_id: `c${index}`, group_type: 'CONTROL' })),
  ];
}

function paymentsFor(userIds, day) {
  return userIds.map((user_id) => ({
    user_id,
    status: 'SUCCESS',
    paid_at: `2026-01-${day}T12:00:00.000Z`,
    net_amount: '100.00',
  }));
}

describe('evaluateCampaign', () => {
  test('marks a campaign successful when treatment uplift is positive', () => {
    const assigned = assignments();
    const payments = [
      ...paymentsFor(assigned.slice(0, 4).map((item) => item.user_id), '10'),
      ...paymentsFor(assigned.slice(20, 22).map((item) => item.user_id), '10'),
    ];
    const result = evaluateCampaign({
      campaign,
      assignments: assigned,
      payments,
      redemptions: 3,
      now: new Date('2026-01-16T00:00:00.000Z'),
    });

    assert.equal(result.result_status, 'SUCCESS');
    assert.equal(result.treatment_size, 20);
    assert.equal(result.control_size, 20);
    assert.equal(result.redemption_count, 3);
    assert.equal(result.uplift, 10);
  });

  test('baseline covers the 7 days before start even when the campaign lasted only minutes', () => {
    const assigned = assignments();
    const shortCampaign = { ...campaign, start_at: '2026-01-08T00:00:00.000Z', end_at: '2026-01-08T00:02:00.000Z' };
    // treatment 5 คนซื้อ 3 วันก่อนเริ่ม: อยู่ในช่วงค่าฐาน 7 วัน แต่ไม่อยู่ในช่วง 2 นาทีก่อนเริ่ม
    const payments = paymentsFor(assigned.slice(0, 5).map((item) => item.user_id), '05');
    const result = evaluateCampaign({
      campaign: shortCampaign,
      assignments: assigned,
      payments,
      redemptions: 3,
      now: new Date('2026-01-08T00:05:00.000Z'),
    });

    assert.equal(result.baseline_metric, 0.25);
  });

  test('returns inconclusive when either cohort has fewer than 20 eligible users', () => {
    const result = evaluateCampaign({
      campaign,
      assignments: assignments(19, 20),
      payments: [],
      redemptions: 10,
      now: new Date('2026-01-16T00:00:00.000Z'),
    });
    assert.equal(result.result_status, 'INCONCLUSIVE');
    assert.match(result.explanation, /at least 20/);
  });

  test('returns inconclusive when fewer than three redemptions were recorded', () => {
    const result = evaluateCampaign({
      campaign,
      assignments: assignments(),
      payments: [],
      redemptions: 2,
      now: new Date('2026-01-16T00:00:00.000Z'),
    });
    assert.equal(result.result_status, 'INCONCLUSIVE');
    assert.match(result.explanation, /3 campaign redemptions/);
  });

  test('rejects evaluation before the configured end time', () => {
    assert.throws(
      () => evaluateCampaign({
        campaign, assignments: assignments(), payments: [], redemptions: 3,
        now: new Date('2026-01-14T23:59:00.000Z'),
      }),
      { status: 409, message: 'Campaign has not reached its end time' }
    );
  });

  test('reactivation KPI excludes customers who never purchased before the campaign', () => {
    const assigned = assignments(3, 3);
    const payments = [
      { user_id: 't0', status: 'SUCCESS', paid_at: '2025-11-20T12:00:00.000Z', net_amount: '100' },
      { user_id: 't1', status: 'SUCCESS', paid_at: '2026-01-01T12:00:00.000Z', net_amount: '100' },
      { user_id: 'c0', status: 'SUCCESS', paid_at: '2025-11-20T12:00:00.000Z', net_amount: '100' },
      { user_id: 'c1', status: 'SUCCESS', paid_at: '2026-01-01T12:00:00.000Z', net_amount: '100' },
      { user_id: 't0', status: 'SUCCESS', paid_at: '2026-01-10T12:00:00.000Z', net_amount: '100' },
      { user_id: 'c0', status: 'SUCCESS', paid_at: '2026-01-10T12:00:00.000Z', net_amount: '100' },
    ];
    const metrics = campaignKpi({
      templateCode: 'COMEBACK_REWARD',
      parameters: { inactive_days: 30 },
      assignments: assigned,
      payments,
      start: new Date(campaign.start_at),
      end: new Date(campaign.end_at),
    });
    assert.equal(metrics.TREATMENT.eligible, 1);
    assert.equal(metrics.CONTROL.eligible, 1);
    assert.equal(metrics.TREATMENT.metric, 1);
  });
});
