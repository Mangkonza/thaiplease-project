const { test, describe, before, after, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { db, startServer, signToken } = require('./helpers');

const USER_ID = '11111111-1111-4111-8111-111111111111';
const merchantToken = () => signToken({ user_id: USER_ID, email: 'm@example.com', role: 'MERCHANT', status: 'ACTIVE' });

let api;
before(async () => { api = await startServer(); });
after(async () => { await api.close(); });
afterEach(() => mock.restoreAll());

describe('authenticateToken (C-1, C-2)', () => {
  test('missing token returns 401', async () => {
    const res = await api.request('GET', '/api/v1/auth/me');
    assert.equal(res.status, 401);
  });

  test('invalid token returns 401, not 403', async () => {
    const res = await api.request('GET', '/api/v1/auth/me', { token: 'not-a-real-token' });
    assert.equal(res.status, 401);
    assert.equal(res.body.message, 'Invalid or expired token');
  });

  test('expired token returns 401', async () => {
    const token = signToken({ user_id: USER_ID, role: 'MERCHANT' }, { expiresIn: -10 });
    const res = await api.request('GET', '/api/v1/auth/me', { token });
    assert.equal(res.status, 401);
  });

  test('valid token of a user suspended after login returns 403', async () => {
    mock.method(db, 'query', async () => ({ rows: [{ status: 'SUSPENDED' }] }));
    const res = await api.request('GET', '/api/v1/auth/me', { token: merchantToken() });
    assert.equal(res.status, 403);
    assert.equal(res.body.message, 'Account is suspended or inactive');
  });

  test('valid token of a deleted user returns 401', async () => {
    mock.method(db, 'query', async () => ({ rows: [] }));
    const res = await api.request('GET', '/api/v1/auth/me', { token: merchantToken() });
    assert.equal(res.status, 401);
  });

  test('valid token of an active user reaches the controller', async () => {
    mock.method(db, 'query', async (sql) => {
      if (sql.startsWith('SELECT status FROM users')) return { rows: [{ status: 'ACTIVE' }] };
      return { rows: [{ user_id: USER_ID, email: 'm@example.com', role: 'MERCHANT', status: 'ACTIVE' }] };
    });
    const res = await api.request('GET', '/api/v1/auth/me', { token: merchantToken() });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.user_id, USER_ID);
  });
});

describe('register validation (C-6)', () => {
  test('rejects an invalid email with 400 before touching the database', async () => {
    const query = mock.method(db, 'query', async () => ({ rows: [] }));
    const res = await api.request('POST', '/api/v1/auth/register', {
      body: { email: 'not-an-email', password: 'secret123' },
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.message, 'Email format is invalid');
    assert.equal(query.mock.callCount(), 0);
  });

  test('rejects a password shorter than 6 characters', async () => {
    const res = await api.request('POST', '/api/v1/auth/register', {
      body: { email: 'a@example.com', password: '12345' },
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.message, 'Password must be at least 6 characters');
  });

  test('rejects a display name longer than 150 characters', async () => {
    const res = await api.request('POST', '/api/v1/auth/register', {
      body: { email: 'a@example.com', password: 'secret123', display_name: 'x'.repeat(151) },
    });
    assert.equal(res.status, 400);
  });

  test('accepts a valid registration and never stores ADMIN role', async () => {
    let insertParams;
    mock.method(db, 'query', async (sql, params) => {
      if (sql.startsWith('SELECT user_id FROM users')) return { rows: [] };
      insertParams = params;
      return { rows: [{ user_id: USER_ID, email: params[0], role: params[3], status: 'ACTIVE' }] };
    });
    const res = await api.request('POST', '/api/v1/auth/register', {
      body: { email: 'a@example.com', password: 'secret123', role: 'ADMIN' },
    });
    assert.equal(res.status, 201);
    assert.equal(insertParams[3], 'CITIZEN');
    assert.notEqual(insertParams[1], 'secret123', 'password must be stored as a hash');
  });
});
