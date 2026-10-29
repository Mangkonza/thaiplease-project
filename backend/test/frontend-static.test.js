const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// ต้องตั้งก่อน require app (node --test รันแต่ละไฟล์แยก process จึงไม่กระทบไฟล์อื่น)
const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'thaiplease-dist-'));
fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>ThaiPlease</title>');
fs.writeFileSync(path.join(dist, 'app.js'), 'console.log(1)');
process.env.FRONTEND_DIST = dist;
const { startServer } = require('./helpers');

let baseUrl;
let close;
before(async () => {
  const api = await startServer();
  close = api.close;
  baseUrl = api.baseUrl;
});
after(async () => {
  await close();
  fs.rmSync(dist, { recursive: true, force: true });
});

test('serves built files and falls back to index.html for React routes', async () => {
  const file = await fetch(`${baseUrl}/app.js`);
  assert.equal(file.status, 200);
  assert.equal(await file.text(), 'console.log(1)');

  const route = await fetch(`${baseUrl}/merchant/shops/abc/dashboard`);
  assert.equal(route.status, 200);
  assert.match(await route.text(), /<title>ThaiPlease<\/title>/);
});

test('unknown API paths still return the JSON 404', async () => {
  const response = await fetch(`${baseUrl}/api/v1/does-not-exist`);
  assert.equal(response.status, 404);
  assert.equal((await response.json()).message, 'API Endpoint Not Found');
});
