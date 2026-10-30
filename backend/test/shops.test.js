const { test, describe, before, after, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { db, startServer, signToken } = require('./helpers');

const OWNER_ID = '22222222-2222-4222-8222-222222222222';
const SHOP_ID = '33333333-3333-4333-8333-333333333333';
const tokenFor = (role) => signToken({ user_id: OWNER_ID, email: 'o@example.com', role, status: 'ACTIVE' });

let api;
before(async () => { api = await startServer(); });
after(async () => { await api.close(); });
afterEach(() => mock.restoreAll());

describe('POST /shops (C-3)', () => {
  test('new shop is created with PENDING status', async () => {
    let insertSql;
    mock.method(db, 'query', async (sql, params) => {
      if (sql.startsWith('SELECT status FROM users')) return { rows: [{ status: 'ACTIVE' }] };
      insertSql = sql;
      return { rows: [{ shop_id: SHOP_ID, owner_id: params[0], name: params[1], status: 'PENDING' }] };
    });
    const res = await api.request('POST', '/api/v1/shops', { token: tokenFor('MERCHANT'), body: { name: 'ร้านกาแฟ A' } });
    assert.equal(res.status, 201);
    assert.match(insertSql, /'PENDING'/);
    assert.doesNotMatch(insertSql, /'ACTIVE'/);
  });
});

describe('GET /shops/my rejection reason', () => {
  test('includes the latest admin rejection reason with owned shops', async () => {
    let listSql;
    mock.method(db, 'query', async (sql) => {
      if (sql.startsWith('SELECT status FROM users')) return { rows: [{ status: 'ACTIVE' }] };
      listSql = sql;
      return {
        rows: [{
          shop_id: SHOP_ID,
          owner_id: OWNER_ID,
          status: 'SUSPENDED',
          rejection_reason: 'กรุณาเพิ่มข้อมูลใบอนุญาตร้านค้า',
        }],
      };
    });

    const res = await api.request('GET', '/api/v1/shops/my', { token: tokenFor('MERCHANT') });
    assert.equal(res.status, 200);
    assert.equal(res.body.shops[0].rejection_reason, 'กรุณาเพิ่มข้อมูลใบอนุญาตร้านค้า');
    assert.ok(listSql.includes("al.action = 'SHOP_REJECTED'"));
    assert.ok(listSql.includes("al.detail ->> 'reason'"));
  });
});

describe('GET /shops/:shopId UUID validation (C-4)', () => {
  for (const role of ['MERCHANT', 'ADMIN']) {
    test(`non-UUID shopId returns 400 for ${role} without querying shops`, async () => {
      const query = mock.method(db, 'query', async () => ({ rows: [{ status: 'ACTIVE' }] }));
      const res = await api.request('GET', '/api/v1/shops/not-a-uuid', { token: tokenFor(role) });
      assert.equal(res.status, 400);
      assert.equal(res.body.message, 'Shop ID must be a valid UUID');
      // มีแค่ query เช็คสถานะ user จาก authenticateToken
      assert.equal(query.mock.callCount(), 1);
    });
  }

  test('valid UUID of another owner still returns 403', async () => {
    mock.method(db, 'query', async (sql) => {
      if (sql.startsWith('SELECT status FROM users')) return { rows: [{ status: 'ACTIVE' }] };
      return { rows: [{ owner_id: '99999999-9999-4999-8999-999999999999' }] };
    });
    const res = await api.request('GET', `/api/v1/shops/${SHOP_ID}`, { token: tokenFor('MERCHANT') });
    assert.equal(res.status, 403);
  });
});

describe('DELETE /shops/:shopId rejected shops', () => {
  test('merchant can delete an owned suspended shop', async () => {
    let deleteSql;
    mock.method(db, 'query', async (sql) => {
      if (sql.startsWith('SELECT status FROM users')) return { rows: [{ status: 'ACTIVE' }] };
      if (sql.startsWith('SELECT owner_id FROM shops')) return { rows: [{ owner_id: OWNER_ID }] };
      deleteSql = sql;
      return { rows: [{ shop_id: SHOP_ID }] };
    });

    const res = await api.request('DELETE', `/api/v1/shops/${SHOP_ID}`, { token: tokenFor('MERCHANT') });
    assert.equal(res.status, 200);
    assert.ok(deleteSql.includes("owner_id = $2 AND status IN ('PENDING', 'SUSPENDED', 'CLOSED')"));
  });

  test('merchant cannot delete a shop that is active or pending', async () => {
    mock.method(db, 'query', async (sql) => {
      if (sql.startsWith('SELECT status FROM users')) return { rows: [{ status: 'ACTIVE' }] };
      if (sql.startsWith('SELECT owner_id FROM shops')) return { rows: [{ owner_id: OWNER_ID }] };
      if (sql.startsWith('DELETE FROM shops')) return { rows: [] };
      return { rows: [{ status: 'ACTIVE' }] };
    });

    const res = await api.request('DELETE', `/api/v1/shops/${SHOP_ID}`, { token: tokenFor('MERCHANT') });
    assert.equal(res.status, 409);
  });

  test('merchant can permanently delete a closed shop', async () => {
    mock.method(db, 'query', async (sql) => {
      if (sql.startsWith('SELECT status FROM users')) return { rows: [{ status: 'ACTIVE' }] };
      if (sql.startsWith('SELECT owner_id FROM shops')) return { rows: [{ owner_id: OWNER_ID }] };
      return { rows: [{ shop_id: SHOP_ID }] };
    });

    const res = await api.request('DELETE', `/api/v1/shops/${SHOP_ID}`, { token: tokenFor('MERCHANT') });
    assert.equal(res.status, 200);
  });

  test('merchant can cancel a pending shop request', async () => {
    let deleteSql;
    mock.method(db, 'query', async (sql) => {
      if (sql.startsWith('SELECT status FROM users')) return { rows: [{ status: 'ACTIVE' }] };
      if (sql.startsWith('SELECT owner_id FROM shops')) return { rows: [{ owner_id: OWNER_ID }] };
      deleteSql = sql;
      return { rows: [{ shop_id: SHOP_ID }] };
    });

    const res = await api.request('DELETE', `/api/v1/shops/${SHOP_ID}`, { token: tokenFor('MERCHANT') });
    assert.equal(res.status, 200);
    assert.ok(deleteSql.includes("'PENDING'"));
  });

  test('returns a conflict when transactions prevent shop deletion', async () => {
    mock.method(db, 'query', async (sql) => {
      if (sql.startsWith('SELECT status FROM users')) return { rows: [{ status: 'ACTIVE' }] };
      if (sql.startsWith('SELECT owner_id FROM shops')) return { rows: [{ owner_id: OWNER_ID }] };
      const error = new Error('foreign key violation');
      error.code = '23503';
      throw error;
    });

    const res = await api.request('DELETE', `/api/v1/shops/${SHOP_ID}`, { token: tokenFor('MERCHANT') });
    assert.equal(res.status, 409);
    assert.match(res.body.message, /มีข้อมูลธุรกรรม/);
  });
});

describe('PUT /shops/:shopId rejected shop resubmission', () => {
  test('updates a rejected shop and returns it to pending review', async () => {
    let updateSql;
    mock.method(db, 'query', async (sql) => {
      if (sql.startsWith('SELECT status FROM users')) return { rows: [{ status: 'ACTIVE' }] };
      if (sql.startsWith('SELECT owner_id FROM shops')) return { rows: [{ owner_id: OWNER_ID }] };
      updateSql = sql;
      return { rows: [{ shop_id: SHOP_ID, status: 'PENDING' }] };
    });

    const res = await api.request('PUT', `/api/v1/shops/${SHOP_ID}`, {
      token: tokenFor('MERCHANT'),
      body: { name: 'ร้านที่แก้ไขแล้ว', category: 'คาเฟ่', area: 'กำแพงแสน' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.shop.status, 'PENDING');
    assert.ok(updateSql.includes("status = 'PENDING'"));
    assert.ok(updateSql.includes("status = 'SUSPENDED'"));
  });

  test('rejects an empty shop name before updating', async () => {
    const query = mock.method(db, 'query', async (sql) => {
      if (sql.startsWith('SELECT status FROM users')) return { rows: [{ status: 'ACTIVE' }] };
      if (sql.startsWith('SELECT owner_id FROM shops')) return { rows: [{ owner_id: OWNER_ID }] };
      throw new Error('Shop should not be updated');
    });

    const res = await api.request('PUT', `/api/v1/shops/${SHOP_ID}`, {
      token: tokenFor('MERCHANT'),
      body: { name: '   ' },
    });
    assert.equal(res.status, 400);
    assert.equal(query.mock.callCount(), 2);
  });
});

describe('PATCH /shops/:shopId/status', () => {
  for (const [status, priorStatus] of [['CLOSED', 'ACTIVE'], ['ACTIVE', 'CLOSED']]) {
    test(`merchant can change a shop from ${priorStatus} to ${status}`, async () => {
      let updateSql;
      mock.method(db, 'query', async (sql) => {
        if (sql.startsWith('SELECT status FROM users')) return { rows: [{ status: 'ACTIVE' }] };
        if (sql.startsWith('SELECT owner_id FROM shops')) return { rows: [{ owner_id: OWNER_ID }] };
        updateSql = sql;
        return { rows: [{ shop_id: SHOP_ID, status }] };
      });

      const res = await api.request('PATCH', `/api/v1/shops/${SHOP_ID}/status`, {
        token: tokenFor('MERCHANT'),
        body: { status },
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.shop.status, status);
      assert.ok(updateSql.includes('status = $4'));
    });
  }

  test('explains when the database migration for closed shops has not been applied', async () => {
    mock.method(db, 'query', async (sql) => {
      if (sql.startsWith('SELECT status FROM users')) return { rows: [{ status: 'ACTIVE' }] };
      if (sql.startsWith('SELECT owner_id FROM shops')) return { rows: [{ owner_id: OWNER_ID }] };
      const error = new Error('invalid input value for enum shop_status');
      error.code = '22P02';
      throw error;
    });

    const res = await api.request('PATCH', `/api/v1/shops/${SHOP_ID}/status`, {
      token: tokenFor('MERCHANT'),
      body: { status: 'CLOSED' },
    });
    assert.equal(res.status, 409);
    assert.match(res.body.message, /10_shop_closure\.sql/);
  });
});
