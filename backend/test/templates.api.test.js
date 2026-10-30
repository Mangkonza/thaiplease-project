const { test, describe, before, after, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { db, startServer, signToken } = require('./helpers');
const { buildParameterSchema, validateTemplateInput } = require('../src/modules/templates/template.service');

const adminToken = signToken({ user_id: '11111111-1111-4111-8111-111111111111', email: 'a@example.com', role: 'ADMIN', status: 'ACTIVE' });
const merchantToken = signToken({ user_id: '22222222-2222-4222-8222-222222222222', email: 'm@example.com', role: 'MERCHANT', status: 'ACTIVE' });
let api;

before(async () => { api = await startServer(); });
after(async () => { await api.close(); });
afterEach(() => mock.restoreAll());

const VALID = {
  code: 'MONDAY_DEAL', mechanic: 'DAY_BASED', name: 'ลดวันจันทร์', description: 'ลดเฉพาะวันจันทร์', target_kpi: 'revenue_by_day',
};

describe('template rules', () => {
  test('narrows a mechanic range but never widens it', () => {
    const narrowed = buildParameterSchema('PERCENT_DISCOUNT', { discount_percent: { minimum: 5, maximum: 20 } });
    assert.deepEqual(narrowed.errors, []);
    assert.deepEqual(narrowed.schema.properties.discount_percent, { type: 'number', minimum: 5, maximum: 20 });
    assert.deepEqual(narrowed.schema.required, ['discount_percent', 'min_spend']);

    assert.match(buildParameterSchema('PERCENT_DISCOUNT', { discount_percent: { maximum: 150 } }).errors[0], /within 1..100/);
    assert.match(buildParameterSchema('PERCENT_DISCOUNT', { discount_percent: { minimum: 30, maximum: 10 } }).errors[0], /not be greater/);
    assert.match(buildParameterSchema('BONUS_COIN', { bonus_coin: { maximum: 2.5 } }).errors[0], /integer/);
    assert.match(buildParameterSchema('TIME_BASED', { start_time: { minimum: 1 } }).errors[0], /not a numeric parameter/);
    assert.match(buildParameterSchema('UNKNOWN', {}).errors[0], /mechanic must be one of/);
  });

  test('new templates need a code, a known mechanic, a name and a KPI', () => {
    assert.deepEqual(validateTemplateInput(VALID, { creating: true }), []);
    const errors = validateTemplateInput({ code: 'x', mechanic: 'NOPE', name: '' }, { creating: true });
    assert.equal(errors.length, 4);
    assert.deepEqual(validateTemplateInput({ name: 'ชื่อใหม่' }, { creating: false }), []);
  });
});

// ตาราง promotion_templates จำลอง: id 1-3 เปิดอยู่ (ขั้นต่ำพอดี 3 แบบ) และ id 4 ปิดอยู่
function mockTemplates({ activeOthers = 2, used = 0 } = {}) {
  mock.method(db, 'query', async (sql) => (sql.startsWith('SELECT status FROM users') ? { rows: [{ status: 'ACTIVE' }] } : { rows: [] }));
  const statements = [];
  mock.method(db.pool, 'connect', async () => ({
    query: async (sql, params) => {
      statements.push({ sql, params });
      if (sql.includes('COUNT(*)::integer AS count FROM promotion_templates')) return { rows: [{ count: activeOthers }] };
      if (sql.includes('AS used')) return { rows: [{ used }] };
      if (sql.includes('FROM promotion_templates t WHERE t.template_id') || sql.includes('FROM promotion_templates WHERE template_id')) {
        return { rows: [{ template_id: params[0], code: 'PERCENT_DISCOUNT', mechanic: 'PERCENT_DISCOUNT', name: 'ส่วนลด', description: null, target_kpi: 'aov', parameter_schema: {}, active: true, archived_at: null }] };
      }
      if (sql.includes('INSERT INTO promotion_templates') || sql.includes('UPDATE promotion_templates AS t')) {
        return { rows: [{ template_id: 11, code: params[0], active: true }] };
      }
      return { rows: [] };
    },
    release() {},
  }));
  return statements;
}

describe('admin template API', () => {
  test('creates a template from a mechanic with narrowed limits', async () => {
    const statements = mockTemplates();
    const response = await api.request('POST', '/api/v1/admin/templates', {
      token: adminToken, body: { ...VALID, mechanic: 'PERCENT_DISCOUNT', limits: { discount_percent: { maximum: 15 } } },
    });
    assert.equal(response.status, 201);
    const insert = statements.find((s) => s.sql.includes('INSERT INTO promotion_templates'));
    assert.equal(insert.params[1], 'PERCENT_DISCOUNT');
    assert.equal(JSON.parse(insert.params[5]).properties.discount_percent.maximum, 15);
    assert.ok(statements.some((s) => s.sql.includes('LOCK TABLE promotion_templates')));
  });

  test('refuses to turn off a template when fewer than 3 would stay active', async () => {
    const statements = mockTemplates({ activeOthers: 2 });
    const response = await api.request('PATCH', '/api/v1/admin/templates/1', { token: adminToken, body: { active: false } });
    assert.equal(response.status, 409);
    assert.match(response.body.message, /At least 3/);
    assert.ok(!statements.some((s) => s.sql.includes('UPDATE promotion_templates AS t')));
  });

  test('a used template is archived instead of deleted', async () => {
    const statements = mockTemplates({ activeOthers: 5, used: 2 });
    const response = await api.request('DELETE', '/api/v1/admin/templates/1', { token: adminToken });
    assert.equal(response.status, 200);
    assert.equal(response.body.result, 'ARCHIVED');
    assert.ok(statements.some((s) => s.sql.includes('archived_at = now()')));
    assert.ok(!statements.some((s) => s.sql.startsWith('DELETE FROM promotion_templates')));
  });

  test('an unused template is deleted', async () => {
    const statements = mockTemplates({ activeOthers: 5, used: 0 });
    const response = await api.request('DELETE', '/api/v1/admin/templates/1', { token: adminToken });
    assert.equal(response.body.result, 'DELETED');
    assert.ok(statements.some((s) => s.sql.startsWith('DELETE FROM promotion_templates')));
  });

  test('merchants cannot manage templates', async () => {
    mockTemplates();
    const response = await api.request('POST', '/api/v1/admin/templates', { token: merchantToken, body: VALID });
    assert.equal(response.status, 403);
  });
});
