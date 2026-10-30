const { test, describe, before, after, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { db, startServer, signToken } = require('./helpers');
const { validateShopDetails } = require('../src/modules/shops/shop-details');

const MERCHANT_ID = '11111111-1111-4111-8111-111111111111';
const SHOP_A = '33333333-3333-4333-8333-333333333333';
const SHOP_B = '33333333-3333-4333-8333-333333333334';
const merchantToken = signToken({ user_id: MERCHANT_ID, email: 'm@example.com', role: 'MERCHANT', status: 'ACTIVE' });
let api;

before(async () => { api = await startServer(); });
after(async () => { await api.close(); });
afterEach(() => mock.restoreAll());

describe('validateShopDetails', () => {
  test('accepts a full set of details and trims text', () => {
    const { details, errors } = validateShopDetails({
      address: '  12 ถ.มาลัยแมน  ', opening_hours: '07:00–17:00', latitude: '14.0184', longitude: 99.9823,
      menu_items: [{ name: ' ลาเต้ ', price: '50' }, { name: 'ของใช้ในบ้าน', price: null }],
    });
    assert.equal(errors, undefined);
    assert.equal(details.address, '12 ถ.มาลัยแมน');
    assert.equal(details.latitude, 14.0184);
    assert.deepEqual(details.menu_items, [{ name: 'ลาเต้', price: 50 }, { name: 'ของใช้ในบ้าน', price: null }]);
  });

  test('rejects bad coordinates, half coordinates, and invalid menu items', () => {
    assert.ok(validateShopDetails({ latitude: 91, longitude: 100 }).errors);
    assert.ok(validateShopDetails({ latitude: 14 }).errors);
    assert.ok(validateShopDetails({ menu_items: [{ name: '', price: 10 }] }).errors);
    assert.ok(validateShopDetails({ menu_items: [{ name: 'ชา', price: -1 }] }).errors);
    assert.ok(validateShopDetails({ menu_items: Array.from({ length: 31 }, () => ({ name: 'x' })) }).errors);
    assert.ok(validateShopDetails({ address: 'x'.repeat(301) }).errors);
  });
});

describe('shop details endpoints', () => {
  test('the shop list loads menu previews for all shops in one query', async () => {
    const queries = [];
    mock.method(db, 'query', async (sql, params) => {
      queries.push(sql);
      if (sql.startsWith('SELECT * FROM shops WHERE status')) return { rows: [{ shop_id: SHOP_A }, { shop_id: SHOP_B }] };
      if (sql.includes('FROM shop_menu_items')) {
        assert.deepEqual(params[0], [SHOP_A, SHOP_B]);
        return { rows: ['ลาเต้', 'มอคค่า', 'โกโก้', 'ชาเขียว'].map((name, i) => ({ shop_id: SHOP_A, name, price: String(40 + i) })) };
      }
      return { rows: [] };
    });
    const response = await api.request('GET', '/api/v1/shops');
    assert.equal(response.status, 200);
    assert.equal(queries.filter((sql) => sql.includes('FROM shop_menu_items')).length, 1);
    assert.deepEqual(response.body.shops[0].menu_preview.map((item) => item.name), ['ลาเต้', 'มอคค่า', 'โกโก้']);
    assert.deepEqual(response.body.shops[1].menu_preview, []);
  });

  test('the owner replaces the menu in one transaction', async () => {
    mock.method(db, 'query', async (sql) => {
      if (sql.startsWith('SELECT status FROM users')) return { rows: [{ status: 'ACTIVE' }] };
      if (sql.startsWith('SELECT owner_id FROM shops')) return { rows: [{ owner_id: MERCHANT_ID }] };
      return { rows: [] };
    });
    const statements = [];
    mock.method(db.pool, 'connect', async () => ({
      query: async (sql, params) => {
        statements.push({ sql: sql.trim().split(/\s+/).slice(0, 3).join(' '), params });
        return sql.startsWith('UPDATE shops') ? { rows: [{ shop_id: SHOP_A }] } : { rows: [] };
      },
      release() {},
    }));
    const response = await api.request('PUT', `/api/v1/shops/${SHOP_A}/details`, {
      token: merchantToken,
      body: { address: '12 ถ.มาลัยแมน', opening_hours: '07:00–17:00', menu_items: [{ name: 'ลาเต้', price: 50 }, { name: 'มอคค่า', price: 55 }] },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(statements.map((s) => s.sql), [
      'BEGIN', 'UPDATE shops SET', 'DELETE FROM shop_menu_items', 'INSERT INTO shop_menu_items', 'INSERT INTO shop_menu_items', 'COMMIT',
    ]);
    assert.deepEqual(statements[4].params, [SHOP_A, 'มอคค่า', 55, 2]);
  });

  test('invalid details are rejected before touching the database', async () => {
    mock.method(db, 'query', async (sql) => {
      if (sql.startsWith('SELECT status FROM users')) return { rows: [{ status: 'ACTIVE' }] };
      if (sql.startsWith('SELECT owner_id FROM shops')) return { rows: [{ owner_id: MERCHANT_ID }] };
      return { rows: [] };
    });
    const connect = mock.method(db.pool, 'connect', async () => { throw new Error('must not connect'); });
    const response = await api.request('PUT', `/api/v1/shops/${SHOP_A}/details`, { token: merchantToken, body: { latitude: 14 } });
    assert.equal(response.status, 400);
    assert.equal(connect.mock.callCount(), 0);
  });
});
