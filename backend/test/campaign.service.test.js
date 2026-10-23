const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { quoteCampaignBenefit, recordRedemption, validateCampaignParameters } = require('../src/modules/campaigns/campaign.service');

describe('campaign payment integration', () => {
  test('quotes a treatment-group percentage discount within the campaign window', async () => {
    const calls = [];
    const client = {
      query: async (sql, params) => {
        calls.push({ sql, params });
        return { rows: [{
          campaign_id: 'campaign-1',
          template_id: 1,
          template_code: 'PERCENT_DISCOUNT',
          parameters: { discount_percent: 10, min_spend: 100 },
          group_type: 'TREATMENT',
        }] };
      },
    };
    const benefit = await quoteCampaignBenefit(client, {
      shopId: 'shop-1',
      userId: 'user-1',
      grossAmount: 200,
      paidAt: new Date('2026-10-23T00:00:00Z'),
    });

    assert.equal(calls.length, 1);
    assert.equal(benefit.discountAmount, 20);
    assert.equal(benefit.bonusCoins, 0);
    assert.equal(benefit.benefitValue, 20);
  });

  test('returns no benefit when the member is outside the treatment group', async () => {
    const client = { query: async () => ({ rows: [] }) };
    const benefit = await quoteCampaignBenefit(client, {
      shopId: 'shop-1', userId: 'user-1', grossAmount: 200, paidAt: new Date(),
    });
    assert.equal(benefit, null);
  });

  test('records a redemption using the payment transaction client', async () => {
    let params;
    const client = {
      query: async (_sql, values) => {
        params = values;
        return { rows: [{ redemption_id: 'redemption-1' }] };
      },
    };
    const result = await recordRedemption(client, {
      campaignId: 'campaign-1', userId: 'user-1', paymentId: 'payment-1', benefitValue: 12.5,
    });
    assert.deepEqual(result, { redemptionId: 'redemption-1' });
    assert.deepEqual(params, ['campaign-1', 'user-1', 'payment-1', 12.5]);
  });
});

test('campaign parameters must satisfy the promotion schema', () => {
  assert.throws(
    () => validateCampaignParameters(
      { discount_percent: 101, min_spend: 50 },
      {
        type: 'object',
        properties: {
          discount_percent: { type: 'number', minimum: 1, maximum: 100 },
          min_spend: { type: 'number', minimum: 0 },
        },
        required: ['discount_percent', 'min_spend'],
      }
    ),
    { status: 400 }
  );
});
