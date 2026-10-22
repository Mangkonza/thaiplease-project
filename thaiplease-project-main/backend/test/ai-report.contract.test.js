const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const contract = require('../src/modules/ai-reports/ai-report.contract');
const { loadTemplatesFromInitSql } = require('./fixtures/templates');

const templates = loadTemplatesFromInitSql();

const dashboard = {
  period: { type: 'WEEK', start: '2026-10-12', end: '2026-10-18' },
  metrics: { revenue: 1925, orders: 12, unique_buyers: 12, new_customers: 1, repeat_customers: 11, aov: 160.42, purchase_frequency: 1, repeat_rate: 0.9167 },
  comparison: {
    period: { type: 'WEEK', start: '2026-10-05', end: '2026-10-11' },
    metrics: { revenue: 2780, orders: 18, unique_buyers: 18, new_customers: 4, repeat_customers: 14, aov: 154.44, purchase_frequency: 1, repeat_rate: 0.7778 },
  },
  change_percent: { revenue: -30.76, new_customers: -75 },
  calculated_at: '2026-10-22T10:00:00.000Z',
};

const validOutput = () => ({
  summary: 'ยอดขายและลูกค้าใหม่ลดลงเมื่อเทียบกับสัปดาห์ก่อน',
  problem: 'ลูกค้าใหม่ลดลงจาก 4 เหลือ 1 คน',
  possible_causes: ['ร้านเข้าถึงลูกค้าใหม่ได้น้อยลง'],
  suggestions: [
    { rank: 2, template_id: 1, parameters: { discount_percent: 10, min_spend: 200 }, reason: 'กระตุ้นการซื้อ', target_kpi: 'conversion_rate' },
    { rank: 1, template_id: 10, parameters: { discount_percent: 15 }, reason: 'ดึงลูกค้าใหม่', target_kpi: 'new_customer_conversion' },
    { rank: 3, template_id: 3, parameters: { bonus_coin: 30, min_spend: 150 }, reason: 'ให้กลับมาซื้อซ้ำ', target_kpi: 'repeat_rate' },
  ],
});

const check = (output) => contract.validateAiOutput(JSON.stringify(output), templates);

describe('buildAiPayload (NFR-04, AT-07)', () => {
  test('sends only aggregated metrics and templates, no shop or personal identifiers', () => {
    const payload = contract.buildAiPayload({ ...dashboard, shop_id: 'b0000000-0000-4000-8000-000000000001' }, templates);
    assert.deepEqual(Object.keys(payload).sort(), ['allowed_promotion_templates', 'change_percent', 'comparison', 'metrics', 'period']);
    const json = JSON.stringify(payload);
    assert.doesNotMatch(json, /shop_id|user_id|email|owner|@/);
    assert.equal(payload.allowed_promotion_templates.length, 10);
  });
});

describe('buildResponseSchema', () => {
  test('parameters list the keys of every template, with array item types', () => {
    const schema = contract.buildResponseSchema(templates);
    const parameters = schema.properties.suggestions.items.properties.parameters.properties;
    assert.deepEqual(parameters.discount_percent, { type: 'number' });
    assert.deepEqual(parameters.bonus_coin, { type: 'integer' });
    assert.deepEqual(parameters.target_days, { type: 'array', items: { type: 'string' } });
  });
});

describe('validateAiOutput (BR-02, AT-08, AT-09)', () => {
  test('accepts a valid answer and sorts suggestions by rank', () => {
    const { errors, report } = check(validOutput());
    assert.deepEqual(errors, []);
    assert.deepEqual(report.suggestions.map((s) => s.template_id), [10, 1, 3]);
  });

  test('rejects the real Gemini mistake: BONUS_COIN with reward_value instead of min_spend', () => {
    const output = validOutput();
    output.suggestions[2].parameters = { bonus_coin: 50, reward_value: 300 };
    const { errors, report } = check(output);
    assert.equal(report, undefined);
    assert.deepEqual(errors, [
      '$.suggestions[2].parameters (BONUS_COIN).min_spend is required',
      '$.suggestions[2].parameters (BONUS_COIN).reward_value is not allowed',
    ]);
  });

  test('rejects parameters outside minimum / maximum', () => {
    const output = validOutput();
    output.suggestions[0].parameters.discount_percent = 150;
    assert.deepEqual(check(output).errors, ['$.suggestions[0].parameters (PERCENT_DISCOUNT).discount_percent must be <= 100']);
  });

  test('requires exactly 3 suggestions', () => {
    const output = validOutput();
    output.suggestions.pop();
    assert.match(check(output).errors.join('\n'), /exactly 3 items, got 2/);
  });

  test('rejects duplicate ranks and duplicate templates', () => {
    const output = validOutput();
    output.suggestions[2] = { ...output.suggestions[0], rank: 1 };
    const errors = check(output).errors.join('\n');
    assert.match(errors, /ranks must be 1, 2 and 3/);
    assert.match(errors, /different template_id values/);
  });

  test('rejects a template that is not in the allowed active list', () => {
    const output = validOutput();
    output.suggestions[1].template_id = 99;
    assert.match(check(output).errors.join('\n'), /template_id 99 is not an allowed active template/);
    const withoutTemplate10 = templates.filter((t) => t.template_id !== 10);
    assert.match(contract.validateAiOutput(JSON.stringify(validOutput()), withoutTemplate10).errors.join('\n'), /template_id 10/);
  });

  test('rejects missing fields, empty text and non-JSON', () => {
    const output = validOutput();
    delete output.summary;
    assert.deepEqual(check(output).errors, ['$.summary is required']);
    assert.deepEqual(check({ ...validOutput(), problem: '  ' }).errors, ['$.problem must not be empty']);
    assert.match(contract.validateAiOutput('not json', templates).errors[0], /not valid JSON/);
  });

  test('accepts JSON wrapped in a markdown code fence', () => {
    const fenced = '```json\n' + JSON.stringify(validOutput()) + '\n```';
    assert.deepEqual(contract.validateAiOutput(fenced, templates).errors, []);
  });

  test('retry messages carry the previous answer and the validation errors', () => {
    const messages = contract.buildMessages({ metrics: {} });
    const retry = contract.buildRetryMessages(messages, '{"bad":true}', ['$.summary is required']);
    assert.equal(retry.length, 4);
    assert.equal(retry[2].role, 'assistant');
    assert.match(retry[3].content, /\$\.summary is required/);
  });
});
