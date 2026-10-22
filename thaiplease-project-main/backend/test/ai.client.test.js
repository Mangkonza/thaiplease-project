const { test, describe, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { chatJson, AiUnavailableError } = require('../src/modules/ai-reports/ai.client');

const KEY = 'test-secret-key';
const SECONDARY_KEY = 'secondary-secret-key';
const reply = (content, status = 200) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status });
const modelOf = (options) => JSON.parse(options.body).model;

let warn;
beforeEach(() => {
  process.env.AI_BASE_URL = 'https://ai.test/v1/openai';
  process.env.AI_API_KEY = KEY;
  process.env.AI_MODEL = 'primary-model';
  process.env.AI_FALLBACK_MODEL = 'backup-model';
  process.env.AI_TIMEOUT_MS = '1000';
  delete process.env.AI_SECONDARY_BASE_URL;
  delete process.env.AI_SECONDARY_API_KEY;
  delete process.env.AI_SECONDARY_MODEL;
  warn = mock.method(console, 'warn', () => {});
});
afterEach(() => mock.restoreAll());

const useSecondaryProvider = () => {
  process.env.AI_SECONDARY_BASE_URL = 'https://secondary.test/openai/v1';
  process.env.AI_SECONDARY_API_KEY = SECONDARY_KEY;
  process.env.AI_SECONDARY_MODEL = 'secondary-model';
};

const request = () => chatJson({ messages: [{ role: 'user', content: 'hi' }], schema: { type: 'object' } });

describe('chatJson', () => {
  test('sends an OpenAI-compatible request with JSON schema and temperature 0', async () => {
    const fetchMock = mock.method(globalThis, 'fetch', async () => reply('{"ok":true}'));
    const result = await request();
    assert.deepEqual(result, { content: '{"ok":true}', model: 'primary-model' });

    const [url, options] = fetchMock.mock.calls[0].arguments;
    assert.equal(url, 'https://ai.test/v1/openai/chat/completions'); // เติม / ให้เองถ้า base URL ไม่มี
    assert.equal(options.headers.Authorization, `Bearer ${KEY}`);
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'primary-model');
    assert.equal(body.temperature, 0);
    assert.equal(body.response_format.type, 'json_schema');
  });

  test('falls back to the backup model when the primary is overloaded (503)', async () => {
    const fetchMock = mock.method(globalThis, 'fetch', async (url, options) =>
      modelOf(options) === 'primary-model' ? new Response('{"error":"high demand"}', { status: 503 }) : reply('{"ok":true}'));
    const result = await request();
    assert.equal(result.model, 'backup-model');
    assert.equal(fetchMock.mock.callCount(), 2);
    // สาเหตุที่โมเดลหลักล้มต้องถูก log แม้ตัวสำรองจะสำเร็จ
    assert.equal(warn.mock.callCount(), 1);
    assert.match(warn.mock.calls[0].arguments[0], /AI model primary-model failed after \d+ ms: HTTP 503/);
  });

  test('uses the secondary provider with its own URL and key when the primary provider is down', async () => {
    useSecondaryProvider();
    const fetchMock = mock.method(globalThis, 'fetch', async (url) =>
      url.startsWith('https://secondary.test/') ? reply('{"ok":true}') : new Response('overloaded', { status: 503 }));
    const result = await request();
    assert.equal(result.model, 'secondary-model');
    assert.deepEqual(fetchMock.mock.calls.map((call) => modelOf(call.arguments[1])), ['primary-model', 'backup-model', 'secondary-model']);

    const [url, options] = fetchMock.mock.calls[2].arguments;
    assert.equal(url, 'https://secondary.test/openai/v1/chat/completions');
    assert.equal(options.headers.Authorization, `Bearer ${SECONDARY_KEY}`);
  });

  test('on 401 skips the rest of that provider and never leaks the key', async () => {
    const fetchMock = mock.method(globalThis, 'fetch', async () => new Response(`invalid key ${KEY}`, { status: 401 }));
    await assert.rejects(request(), (error) => {
      assert.ok(error instanceof AiUnavailableError);
      assert.equal(error.reason, 'AI_UNAVAILABLE');
      assert.match(error.message, /primary-model: HTTP 401 invalid key \*\*\*/);
      assert.doesNotMatch(error.message, new RegExp(KEY));
      return true;
    });
    assert.equal(fetchMock.mock.callCount(), 1);
  });

  test('a 401 from the primary provider still lets the secondary provider answer', async () => {
    useSecondaryProvider();
    const fetchMock = mock.method(globalThis, 'fetch', async (url) =>
      url.startsWith('https://secondary.test/') ? reply('{"ok":true}') : new Response('bad key', { status: 401 }));
    const result = await request();
    assert.equal(result.model, 'secondary-model');
    assert.deepEqual(fetchMock.mock.calls.map((call) => modelOf(call.arguments[1])), ['primary-model', 'secondary-model']);
  });

  test('a secondary provider without a key is skipped', async () => {
    useSecondaryProvider();
    process.env.AI_SECONDARY_API_KEY = '';
    const fetchMock = mock.method(globalThis, 'fetch', async () => new Response('overloaded', { status: 503 }));
    await assert.rejects(request(), /primary-model: HTTP 503 overloaded \| backup-model: HTTP 503 overloaded$/);
    assert.equal(fetchMock.mock.callCount(), 2);
  });

  test('reports timeouts of every model', async () => {
    mock.method(globalThis, 'fetch', async () => {
      const error = new Error('aborted');
      error.name = 'TimeoutError';
      throw error;
    });
    await assert.rejects(request(), /primary-model: timeout after 1000 ms \| backup-model: timeout after 1000 ms/);
  });

  test('treats an empty answer as a failure of that model', async () => {
    mock.method(globalThis, 'fetch', async () => reply(''));
    await assert.rejects(request(), /response has no message content/);
  });

  test('missing configuration fails fast without calling the network', async () => {
    delete process.env.AI_API_KEY;
    const fetchMock = mock.method(globalThis, 'fetch', async () => reply('{}'));
    await assert.rejects(request(), (error) => error.reason === 'AI_NOT_CONFIGURED');
    assert.equal(fetchMock.mock.callCount(), 0);
  });
});
