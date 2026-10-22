const { validateSchema } = require('../ai-reports/schema.validator');

const TIME_ZONE = 'Asia/Bangkok';
const BAHT_PER_COIN = 25;

function weekdayInBangkok(date) {
  return new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, weekday: 'long' })
    .format(date).toLowerCase();
}

function timeInBangkok(date) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(date);
}

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

function percentDiscount(amount, percent) {
  return Math.min(amount, Number((amount * Number(percent) / 100).toFixed(2)));
}

async function quoteCampaignBenefit(client, { shopId, userId, grossAmount, paidAt }) {
  const result = await client.query(
    `SELECT c.campaign_id, c.template_id, c.parameters, t.code AS template_code, a.group_type
     FROM campaigns c
     JOIN promotion_templates t ON t.template_id = c.template_id
     JOIN campaign_assignments a ON a.campaign_id = c.campaign_id AND a.user_id = $2
     WHERE c.shop_id = $1 AND c.status = 'ACTIVE'
       AND c.start_at <= $3 AND c.end_at >= $3
       AND a.group_type = 'TREATMENT'
     ORDER BY c.activated_at DESC LIMIT 1 FOR UPDATE OF a`,
    [shopId, userId, paidAt]
  );
  if (!result.rows.length) return null;

  const campaign = result.rows[0];
  const parameters = campaign.parameters;
  let discountAmount = 0;
  let bonusCoins = 0;
  const prior = async (sql, values) => (await client.query(sql, values)).rows;

  switch (campaign.template_code) {
    case 'PERCENT_DISCOUNT':
      if (grossAmount >= Number(parameters.min_spend)) {
        discountAmount = percentDiscount(grossAmount, parameters.discount_percent);
      }
      break;
    case 'FIXED_DISCOUNT':
      if (grossAmount >= Number(parameters.min_spend)) {
        discountAmount = Math.min(grossAmount, Number(parameters.discount_amount));
      }
      break;
    case 'BONUS_COIN':
      if (grossAmount >= Number(parameters.min_spend)) bonusCoins = Number(parameters.bonus_coin);
      break;
    case 'COIN_MULTIPLIER': {
      const regular = Math.floor(grossAmount / BAHT_PER_COIN);
      bonusCoins = Math.floor(regular * Number(parameters.multiplier)) - regular;
      break;
    }
    case 'MIN_SPEND_REWARD':
      if (grossAmount >= Number(parameters.min_spend)) {
        discountAmount = Math.min(grossAmount, Number(parameters.reward_value));
      }
      break;
    case 'COMEBACK_REWARD': {
      const previous = await prior(
        `SELECT MAX(paid_at) AS last_paid_at FROM payments
         WHERE shop_id = $1 AND user_id = $2 AND status = 'SUCCESS' AND paid_at < $3`,
        [shopId, userId, paidAt]
      );
      const lastPaid = previous[0] && previous[0].last_paid_at;
      const gapDays = lastPaid ? (new Date(paidAt) - new Date(lastPaid)) / 86400000 : Infinity;
      if (lastPaid && gapDays >= Number(parameters.inactive_days)) {
        discountAmount = Math.min(grossAmount, Number(parameters.discount_amount));
      }
      break;
    }
    case 'FREQUENCY_REWARD': {
      const previous = await prior(
        `SELECT COUNT(*)::integer AS order_count FROM payments
         WHERE shop_id = $1 AND user_id = $2 AND status = 'SUCCESS'
           AND paid_at >= (SELECT start_at FROM campaigns WHERE campaign_id = $3)
           AND paid_at < $4`,
        [shopId, userId, campaign.campaign_id, paidAt]
      );
      if ((Number(previous[0].order_count) + 1) % Number(parameters.required_orders) === 0) {
        bonusCoins = Number(parameters.reward_coins);
      }
      break;
    }
    case 'TIME_BASED': {
      const current = timeInBangkok(new Date(paidAt));
      const start = String(parameters.start_time);
      const end = String(parameters.end_time);
      const inTime = start <= end ? current >= start && current <= end : current >= start || current <= end;
      if (inTime) discountAmount = percentDiscount(grossAmount, parameters.discount_percent);
      break;
    }
    case 'DAY_BASED': {
      const today = weekdayInBangkok(new Date(paidAt));
      const days = parameters.target_days.map(canonicalWeekday);
      if (days.includes(today)) discountAmount = percentDiscount(grossAmount, parameters.discount_percent);
      break;
    }
    case 'NEW_CUSTOMER': {
      const previous = await prior(
        `SELECT 1 FROM payments
         WHERE shop_id = $1 AND user_id = $2 AND status = 'SUCCESS' AND paid_at < $3 LIMIT 1`,
        [shopId, userId, paidAt]
      );
      if (!previous.length) discountAmount = percentDiscount(grossAmount, parameters.discount_percent);
      break;
    }
    default:
      throw new Error(`Unsupported promotion template: ${campaign.template_code}`);
  }

  if (discountAmount <= 0 && bonusCoins <= 0) return null;
  return {
    campaignId: campaign.campaign_id,
    templateCode: campaign.template_code,
    discountAmount,
    bonusCoins,
    benefitValue: discountAmount,
  };
}

async function recordRedemption(client, { campaignId, userId, paymentId, benefitValue }) {
  const result = await client.query(
    `INSERT INTO promotion_redemptions (campaign_id, user_id, payment_id, benefit_value)
     VALUES ($1, $2, $3, $4) RETURNING redemption_id`,
    [campaignId, userId, paymentId, benefitValue]
  );
  return { redemptionId: result.rows[0].redemption_id };
}

function validateCampaignParameters(parameters, schema) {
  const errors = validateSchema(parameters, schema);
  if (errors.length) {
    const error = new Error(errors.join('; '));
    error.status = 400;
    throw error;
  }
  if (parameters.start_time !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(parameters.start_time)) {
    const error = new Error('start_time and end_time must use HH:mm format');
    error.status = 400;
    throw error;
  }
  if (parameters.end_time !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(parameters.end_time)) {
    const error = new Error('start_time and end_time must use HH:mm format');
    error.status = 400;
    throw error;
  }
  return parameters;
}

module.exports = { quoteCampaignBenefit, recordRedemption, validateCampaignParameters };
