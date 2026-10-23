const DAY_MS = 86400000;
const RATE_TEMPLATES = new Set([
  'PERCENT_DISCOUNT', 'FIXED_DISCOUNT', 'TIME_BASED', 'DAY_BASED',
  'NEW_CUSTOMER', 'COMEBACK_REWARD',
]);

function canonicalWeekday(value) {
  const day = String(value).trim().toLowerCase();
  const weekdays = {
    monday: 'monday', mon: 'monday', 'จันทร์': 'monday',
    tuesday: 'tuesday', tue: 'tuesday', 'อังคาร': 'tuesday',
    wednesday: 'wednesday', wed: 'wednesday', 'พุธ': 'wednesday',
    thursday: 'thursday', thu: 'thursday', 'พฤหัสบดี': 'thursday',
    friday: 'friday', fri: 'friday', 'ศุกร์': 'friday',
    saturday: 'saturday', sat: 'saturday', 'เสาร์': 'saturday',
    sunday: 'sunday', sun: 'sunday', 'อาทิตย์': 'sunday',
  };
  return weekdays[day] || day;
}

function inRange(date, start, end, templateCode, parameters) {
  const paidAt = new Date(date);
  if (paidAt < start || paidAt > end) return false;
  if (templateCode === 'TIME_BASED') {
    const time = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).format(paidAt);
    const from = parameters.start_time;
    const to = parameters.end_time;
    return from <= to ? time >= from && time <= to : time >= from || time <= to;
  }
  if (templateCode === 'DAY_BASED') {
    const day = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Bangkok', weekday: 'long' })
      .format(paidAt).toLowerCase();
    return parameters.target_days.some((item) => canonicalWeekday(item) === day);
  }
  return true;
}

function campaignKpi({ templateCode, parameters, assignments, payments, start, end }) {
  const members = assignments.filter((item) => item.group_type === 'TREATMENT' || item.group_type === 'CONTROL');
  const paymentsInRange = payments.filter((payment) =>
    payment.status === 'SUCCESS' &&
    inRange(payment.paid_at, start, end, templateCode, parameters)
  );

  let eligibleMembers = members;
  if (templateCode === 'NEW_CUSTOMER') {
    eligibleMembers = members.filter((member) =>
      !payments.some((p) => p.status === 'SUCCESS' && p.user_id === member.user_id && new Date(p.paid_at) < start)
    );
  } else if (templateCode === 'COMEBACK_REWARD') {
    const threshold = new Date(start.getTime() - Number(parameters.inactive_days) * DAY_MS);
    eligibleMembers = members.filter((member) => {
      const prior = payments
        .filter((p) => p.status === 'SUCCESS' && p.user_id === member.user_id && new Date(p.paid_at) < start)
        .map((p) => new Date(p.paid_at))
        .sort((a, b) => b - a)[0];
      return prior && prior <= threshold;
    });
  }

  const totals = {};
  for (const group of ['TREATMENT', 'CONTROL']) {
    const groupMembers = eligibleMembers.filter((item) => item.group_type === group);
    const memberIds = new Set(groupMembers.map((item) => item.user_id));
    const orders = paymentsInRange.filter((item) => memberIds.has(item.user_id));
    const buyers = new Set(orders.map((item) => item.user_id)).size;
    const revenue = orders.reduce((sum, item) => sum + Number(item.net_amount), 0);
    const metric = templateCode === 'MIN_SPEND_REWARD'
      ? (orders.length ? revenue / orders.length : null)
      : templateCode === 'PERCENT_DISCOUNT' || templateCode === 'FIXED_DISCOUNT' ||
        templateCode === 'TIME_BASED' || templateCode === 'DAY_BASED' || templateCode === 'NEW_CUSTOMER' ||
        templateCode === 'COMEBACK_REWARD'
        ? (groupMembers.length ? buyers / groupMembers.length : null)
        : templateCode === 'COIN_MULTIPLIER' || templateCode === 'BONUS_COIN' ||
          templateCode === 'FREQUENCY_REWARD'
          ? (groupMembers.length ? orders.length / groupMembers.length : null)
          : (orders.length ? revenue / orders.length : null);
    totals[group] = { metric, eligible: groupMembers.length, orders: orders.length };
  }

  return totals;
}

function evaluateCampaign({ campaign, assignments, payments, redemptions, now = new Date() }) {
  const start = new Date(campaign.start_at);
  const end = new Date(campaign.end_at);
  if (now < end) {
    const error = new Error('Campaign has not reached its end time');
    error.status = 409;
    throw error;
  }

  const duration = end.getTime() - start.getTime();
  const baseline = campaignKpi({
    templateCode: campaign.template_code,
    parameters: campaign.parameters,
    assignments,
    payments,
    start: new Date(start.getTime() - duration),
    end: new Date(start.getTime() - 1),
  });
  const current = campaignKpi({
    templateCode: campaign.template_code,
    parameters: campaign.parameters,
    assignments,
    payments,
    start,
    end,
  });
  const sampleSize = current.TREATMENT.eligible + current.CONTROL.eligible;
  const redemptionCount = Number(redemptions);
  let status;
  let uplift = null;
  let explanation;

  if (current.TREATMENT.eligible < 20 || current.CONTROL.eligible < 20) {
    status = 'INCONCLUSIVE';
    explanation = 'Each campaign group needs at least 20 eligible users.';
  } else if (redemptionCount < 3) {
    status = 'INCONCLUSIVE';
    explanation = 'At least 3 campaign redemptions are required.';
  } else if (current.TREATMENT.metric === null || current.CONTROL.metric === null ||
             baseline.TREATMENT.metric === null || baseline.CONTROL.metric === null) {
    status = 'INCONCLUSIVE';
    explanation = 'The campaign KPI could not be calculated for both periods.';
  } else {
    const rawUplift = current.TREATMENT.metric - current.CONTROL.metric;
    uplift = RATE_TEMPLATES.has(campaign.template_code) ? rawUplift * 100 : rawUplift;
    status = uplift > 0 ? 'SUCCESS' : 'FAILED';
    explanation = `Treatment ${current.TREATMENT.metric.toFixed(4)}; control ${current.CONTROL.metric.toFixed(4)}; uplift ${uplift.toFixed(4)}.`;
  }

  return {
    baseline_metric: baseline.TREATMENT.metric,
    treatment_metric: current.TREATMENT.metric,
    control_metric: current.CONTROL.metric,
    uplift,
    sample_size: sampleSize,
    treatment_size: current.TREATMENT.eligible,
    control_size: current.CONTROL.eligible,
    redemption_count: redemptionCount,
    result_status: status,
    explanation,
  };
}

module.exports = { campaignKpi, evaluateCampaign };
