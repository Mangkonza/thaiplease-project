const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { validateSchema } = require('../src/modules/ai-reports/schema.validator');
const { loadTemplatesFromInitSql } = require('./fixtures/templates');

describe('validateSchema', () => {
  test('supports every keyword used by the 10 real template schemas in init.sql', () => {
    for (const template of loadTemplatesFromInitSql()) {
      // ต้องไม่ throw (ไม่มี keyword ที่ไม่รองรับ) และต้องรายงาน required ที่ขาด
      const errors = validateSchema({}, template.parameter_schema);
      assert.deepEqual(errors, template.parameter_schema.required.map((key) => `$.${key} is required`), template.code);
    }
  });

  test('checks type, integer, minimum and maximum', () => {
    const schema = {
      type: 'object',
      properties: { percent: { type: 'number', minimum: 1, maximum: 100 }, coins: { type: 'integer', minimum: 1 } },
    };
    assert.deepEqual(validateSchema({ percent: 150, coins: 2.5 }, schema), ['$.percent must be <= 100', '$.coins must be integer']);
    assert.deepEqual(validateSchema({ percent: '10' }, schema), ['$.percent must be number']);
    assert.deepEqual(validateSchema({ percent: 0 }, schema), ['$.percent must be >= 1']);
    assert.deepEqual(validateSchema({ percent: 10, coins: 3 }, schema), []);
  });

  test('checks array items', () => {
    const schema = { type: 'array', items: { type: 'string' } };
    assert.deepEqual(validateSchema(['MON', 2], schema), ['$[1] must be string']);
  });

  test('unknown keys pass by default but fail with additionalProperties: false', () => {
    const schema = { type: 'object', properties: { a: { type: 'number' } } };
    assert.deepEqual(validateSchema({ a: 1, b: 2 }, schema), []);
    assert.deepEqual(validateSchema({ a: 1, b: 2 }, { ...schema, additionalProperties: false }), ['$.b is not allowed']);
  });

  test('throws on keywords it does not support instead of silently passing', () => {
    assert.throws(() => validateSchema('x', { type: 'string', enum: ['a'] }), /Unsupported JSON Schema keyword\(s\) at \$: enum/);
  });
});
