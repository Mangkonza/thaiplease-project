const { test, describe, before, after, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { db, startServer, signToken } = require('./helpers');
const { loadTemplatesFromInitSql } = require('./fixtures/templates');

const OWNER_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_ID = '99999999-9999-4999-8999-999999999999';
const SHOP_ID = '33333333-3333-4333-8333-333333333333';
const REPORT_ID = '55555555-5555-4555-8555-555555555555';
const AI_BASE = 'https://ai.test/openai/';
const templates = loadTemplatesFromInitSql();
const tokenFor = (role, userId = OWNER_ID) => signToken({ user_id: userId, email: 'o@example.com', role, status: 'ACTIVE' });
const realFetch = globalThis.fetch;

const metricsRow = (orders, newCustomers) => ({
  revenue: String(orders * 150), orders, unique_buyers: orders, new_customers: newCustomers, repeat_customers: orders - newCustomers,
});

const validOutput = () => ({
  summary: 'ยอดขายและลูกค้าใหม่ลดลง',
  problem: 'ลูกค้าใหม่ลดลงจาก 4 เหลือ 1 คน',
  possible_causes: ['เข้าถึงลูกค้าใหม่ได้น้อยลง'],
  suggestions: [
    { rank: 1, template_id: 10, parameters: { discount_percent: 15 }, reason: 'ดึงลูกค้าใหม่', target_kpi: 'new_customer_conversion' },
    { rank: 2, template_id: 1, parameters: { discount_percent: 10, min_spend: 200 }, reason: 'กระตุ้นการซื้อ', target_kpi: 'conversion_rate' },
    { rank: 3, template_id: 3, parameters: { bonus_coin: 30, min_spend: 150 }, reason: 'ให้กลับมาซื้อซ้ำ', target_kpi: 'repeat_rate' },
  ],
});

// ฐานข้อมูลจำลอง: ข้อมูลที่ INSERT ใน transaction จะมองเห็นได้หลัง COMMIT เท่านั้น
function mockDatabase({ owner = OWNER_ID, current = metricsRow(12, 1), previous = metricsRow(18, 4) } = {}) {
  const state = { report: null, suggestions: [], transactions: [] };
  mock.method(db, 'query', async (sql, params) => {
    if (sql.startsWith('SELECT status FROM users')) return { rows: [{ status: 'ACTIVE' }] };
    if (sql.startsWith('SELECT owner_id FROM shops')) return { rows: [{ owner_id: owner }] };
    if (sql.startsWith('SELECT 1 FROM shops')) return { rows: [{}] };
    if (sql.includes('WITH bounds')) return { rows: [params[1] === '2026-10-12' ? current : previous] };
    if (sql.includes('INSERT INTO shop_metrics')) return { rows: [{ metric_id: 'm', created_at: '2026-10-22T10:00:00Z' }] };
    if (sql.includes('FROM promotion_templates WHERE active')) return { rows: templates };
    if (sql.includes('FROM promotion_templates ORDER BY')) return { rows: templates.map((t) => ({ ...t, active: true })) };
    if (sql.includes('FROM ai_reports r JOIN shops')) return { rows: state.report && params[0] === REPORT_ID ? [{ ...state.report, owner_id: owner }] : [] };
    if (sql.includes('FROM ai_reports') && sql.includes('LIMIT 20')) {
      state.listParams = params;
      const matches = state.report && (params.length === 1 || (params[1] === state.report.period_type && params[2] === state.report.period_start));
      return { rows: matches ? [state.report] : [] };
    }
    if (sql.includes('FROM ai_suggestions g')) return { rows: state.suggestions };
    if (sql.startsWith('SELECT * FROM shops WHERE status')) return { rows: [{ shop_id: SHOP_ID, name: 'ร้านกาแฟบ้านสวน' }] };
    throw new Error(`Unexpected query in test: ${sql.slice(0, 80)}`);
  });

  const connect = mock.method(db.pool, 'connect', async () => {
    const tx = { statements: [], pending: { report: null, suggestions: [] }, released: false };
    state.transactions.push(tx);
    return {
      query: async (sql, params) => {
        const statement = sql.trim().split(/\s+/).slice(0, 3).join(' ');
        tx.statements.push(statement);
        if (statement === 'INSERT INTO ai_reports') {
          tx.pending.report = {
            report_id: REPORT_ID, shop_id: params[0], period_type: params[1], period_start: params[2], period_end: params[3],
            model_version: params[4], summary: params[5], problem_summary: params[6],
            possible_causes: JSON.parse(params[7]), metrics_snapshot: JSON.parse(params[8]), created_at: '2026-10-22T10:00:00Z',
          };
          return { rows: [{ report_id: REPORT_ID }] };
        }
        if (statement === 'INSERT INTO ai_suggestions') {
          const t = templates.find((x) => x.template_id === params[1]);
          tx.pending.suggestions.push({ suggestion_id: `s${params[2]}`, rank: params[2], template_id: params[1], template_code: t.code, template_name: t.name, parameters: JSON.parse(params[3]), reason: params[4], target_kpi: params[5], status: 'PROPOSED' });
          return { rows: [] };
        }
        if (statement === 'COMMIT') Object.assign(state, tx.pending);
        return { rows: [] };
      },
      release: () => { tx.released = true; },
    };
  });
  return { state, connect };
}

// AI จำลอง: ตอบตามลำดับใน answers; request อื่น (ไปที่ server ของ test) ส่งต่อให้ fetch จริง
function mockAi(answers) {
  const calls = [];
  mock.method(globalThis, 'fetch', async (url, options) => {
    if (!String(url).startsWith(AI_BASE)) return realFetch(url, options);
    calls.push(JSON.parse(options.body));
    const answer = answers[Math.min(calls.length - 1, answers.length - 1)];
    if (typeof answer === 'number') return new Response('{"error":"unavailable"}', { status: answer });
    const content = typeof answer === 'string' ? answer : JSON.stringify(answer);
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
  });
  return calls;
}

const createReport = (body = { period_type: 'WEEK', period_start: '2026-10-12', period_end: '2026-10-18' }, token = tokenFor('MERCHANT')) =>
  api.request('POST', `/api/v1/shops/${SHOP_ID}/ai-reports`, { token, body });

let api;
before(async () => { api = await startServer(); });
after(async () => { await api.close(); });
beforeEach(() => {
  process.env.AI_BASE_URL = AI_BASE;
  process.env.AI_API_KEY = 'test-key';
  process.env.AI_MODEL = 'primary-model';
  process.env.AI_FALLBACK_MODEL = 'backup-model';
  mock.method(console, 'warn', () => {});
});
afterEach(() => mock.restoreAll());

describe('POST /shops/:shopId/ai-reports', () => {
  test('creates a report with 3 suggestions in one transaction (AT-08)', async () => {
    const { state } = mockDatabase();
    const calls = mockAi([validOutput()]);

    const res = await createReport();
    assert.equal(res.status, 201);
    assert.equal(res.body.report.report_id, REPORT_ID);
    assert.equal(res.body.report.model_version, 'primary-model');
    assert.deepEqual(res.body.report.period, { type: 'WEEK', start: '2026-10-12', end: '2026-10-18' });
    assert.deepEqual(res.body.report.suggestions.map((s) => [s.rank, s.template_code, s.status]),
      [[1, 'NEW_CUSTOMER', 'PROPOSED'], [2, 'PERCENT_DISCOUNT', 'PROPOSED'], [3, 'BONUS_COIN', 'PROPOSED']]);

    assert.equal(calls.length, 1);
    assert.deepEqual(state.transactions[0].statements, ['BEGIN', 'INSERT INTO ai_reports', 'INSERT INTO ai_suggestions', 'INSERT INTO ai_suggestions', 'INSERT INTO ai_suggestions', 'COMMIT']);
    assert.ok(state.transactions[0].released);
    assert.equal(res.body.report.metrics_snapshot.metrics.new_customers, 1);
    assert.equal(res.body.report.metrics_snapshot.comparison.metrics.new_customers, 4);
  });

  test('data sent to the AI contains no shop id or personal data (AT-07)', async () => {
    mockDatabase();
    const calls = mockAi([validOutput()]);
    await createReport();
    const sent = calls[0].messages.map((m) => m.content).join('\n');
    assert.doesNotMatch(sent, new RegExp(SHOP_ID));
    assert.doesNotMatch(sent, /@|user_id|email/);
  });

  test('retries once with the validation errors and saves the corrected answer', async () => {
    mockDatabase();
    const wrong = validOutput();
    wrong.suggestions[2].parameters = { bonus_coin: 50, reward_value: 300 };
    const calls = mockAi([wrong, validOutput()]);

    const res = await createReport();
    assert.equal(res.status, 201);
    assert.equal(calls.length, 2);
    assert.match(calls[1].messages.at(-1).content, /min_spend is required/);
  });

  test('saves nothing when the AI answer is still invalid after the retry (AT-09)', async () => {
    const { connect } = mockDatabase();
    mockAi(['not json at all']);
    const res = await createReport();
    assert.equal(res.status, 502);
    assert.equal(res.body.reason, 'AI_INVALID_OUTPUT');
    assert.equal(connect.mock.callCount(), 0);
  });

  test('AI down returns 503 and shop search still works (AT-16, NFR-07)', async () => {
    const { connect } = mockDatabase();
    const calls = mockAi([503]);
    const res = await createReport();
    assert.equal(res.status, 503);
    assert.equal(res.body.reason, 'AI_UNAVAILABLE');
    assert.deepEqual(calls.map((c) => c.model), ['primary-model', 'backup-model']);
    assert.equal(connect.mock.callCount(), 0);

    const search = await api.request('GET', '/api/v1/shops');
    assert.equal(search.status, 200);
  });

  test('missing AI configuration returns 503 AI_NOT_CONFIGURED', async () => {
    mockDatabase();
    delete process.env.AI_API_KEY;
    const calls = mockAi([validOutput()]);
    const res = await createReport();
    assert.equal(res.status, 503);
    assert.equal(res.body.reason, 'AI_NOT_CONFIGURED');
    assert.equal(calls.length, 0);
  });

  test('no orders in both periods returns 422 without calling the AI', async () => {
    mockDatabase({ current: metricsRow(0, 0), previous: metricsRow(0, 0) });
    const calls = mockAi([validOutput()]);
    const res = await createReport();
    assert.equal(res.status, 422);
    assert.equal(res.body.reason, 'INSUFFICIENT_DATA');
    assert.equal(res.body.metrics.orders, 0);
    assert.equal(calls.length, 0);
  });

  test('period must be a full week or month', async () => {
    mockDatabase();
    mockAi([validOutput()]);
    const notMonday = await createReport({ period_type: 'WEEK', period_start: '2026-10-13', period_end: '2026-10-19' });
    assert.equal(notMonday.status, 400);
    assert.match(notMonday.body.message, /expected 2026-10-12/);
    const wrongEnd = await createReport({ period_type: 'WEEK', period_start: '2026-10-12', period_end: '2026-10-20' });
    assert.equal(wrongEnd.status, 400);
    const badType = await createReport({ period_type: 'YEAR' });
    assert.match(badType.body.message, /^period_type/);
  });

  test('only the owning merchant can create a report', async () => {
    mockDatabase({ owner: OTHER_ID });
    mockAi([validOutput()]);
    assert.equal((await createReport()).status, 403);
    assert.equal((await createReport(undefined, tokenFor('ADMIN'))).status, 403);
  });
});

describe('GET /shops/:shopId/ai-reports (saved reports for the demo)', () => {
  test('lists saved reports of the selected period without calling the AI again', async () => {
    const { state } = mockDatabase();
    const calls = mockAi([validOutput()]);
    await createReport();

    const listUrl = `/api/v1/shops/${SHOP_ID}/ai-reports?period_type=WEEK&period_start=2026-10-12`;
    const res = await api.request('GET', listUrl, { token: tokenFor('MERCHANT') });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.reports.map((r) => [r.report_id, r.period.start, r.model_version]), [[REPORT_ID, '2026-10-12', 'primary-model']]);
    assert.deepEqual(state.listParams, [SHOP_ID, 'WEEK', '2026-10-12']);
    assert.equal(calls.length, 1, 'listing must not call the AI');

    const otherWeek = await api.request('GET', `/api/v1/shops/${SHOP_ID}/ai-reports?period_type=WEEK&period_start=2026-10-05`, { token: tokenFor('MERCHANT') });
    assert.deepEqual(otherWeek.body.reports, []);
  });

  test('rejects a period_start that does not begin a week, and other owners', async () => {
    mockDatabase();
    const notMonday = await api.request('GET', `/api/v1/shops/${SHOP_ID}/ai-reports?period_type=WEEK&period_start=2026-10-14`, { token: tokenFor('MERCHANT') });
    assert.equal(notMonday.status, 400);

    mock.restoreAll();
    mockDatabase({ owner: OTHER_ID });
    assert.equal((await api.request('GET', `/api/v1/shops/${SHOP_ID}/ai-reports`, { token: tokenFor('MERCHANT') })).status, 403);
  });
});

describe('GET /ai-reports/:reportId', () => {
  test('owner and admin can read the saved report, another merchant cannot', async () => {
    mockDatabase();
    mockAi([validOutput()]);
    await createReport();

    const own = await api.request('GET', `/api/v1/ai-reports/${REPORT_ID}`, { token: tokenFor('MERCHANT') });
    assert.equal(own.status, 200);
    assert.equal(own.body.report.suggestions.length, 3);
    assert.equal(own.body.report.problem, 'ลูกค้าใหม่ลดลงจาก 4 เหลือ 1 คน');

    assert.equal((await api.request('GET', `/api/v1/ai-reports/${REPORT_ID}`, { token: tokenFor('ADMIN', OTHER_ID) })).status, 200);
    assert.equal((await api.request('GET', `/api/v1/ai-reports/${REPORT_ID}`, { token: tokenFor('MERCHANT', OTHER_ID) })).status, 403);
  });

  test('unknown report returns 404 and a bad id returns 400', async () => {
    mockDatabase();
    assert.equal((await api.request('GET', `/api/v1/ai-reports/${REPORT_ID}`, { token: tokenFor('MERCHANT') })).status, 404);
    assert.equal((await api.request('GET', '/api/v1/ai-reports/abc', { token: tokenFor('MERCHANT') })).status, 400);
  });
});

describe('GET /promotion-templates', () => {
  test('lists the 10 templates for merchants and rejects citizens', async () => {
    mockDatabase();
    const res = await api.request('GET', '/api/v1/promotion-templates', { token: tokenFor('MERCHANT') });
    assert.equal(res.status, 200);
    assert.equal(res.body.templates.length, 10);
    assert.equal((await api.request('GET', '/api/v1/promotion-templates', { token: tokenFor('CITIZEN') })).status, 403);
  });
});
