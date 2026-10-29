import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPayUrl, homePathFor, parseShopIdFromQr, uploadUrl } from './payment-links.js';

const SHOP_ID = 'b0000000-0000-4000-8000-000000000002';

test('a shop QR round-trips to its shop id from any origin', () => {
  assert.equal(parseShopIdFromQr(buildPayUrl('http://localhost:8080', SHOP_ID)), SHOP_ID);
  assert.equal(parseShopIdFromQr(`https://192.168.1.20:8080/pay/${SHOP_ID.toUpperCase()}/`), SHOP_ID);
});

test('rejects QR codes that are not ThaiPlease payment links', () => {
  assert.equal(parseShopIdFromQr('https://promptpay.io/0812345678'), null);
  assert.equal(parseShopIdFromQr(`javascript:alert(1)//pay/${SHOP_ID}`), null);
  assert.equal(parseShopIdFromQr(`http://localhost/pay/${SHOP_ID}/extra`), null);
  assert.equal(parseShopIdFromQr('not a url'), null);
  assert.equal(parseShopIdFromQr(null), null);
});

test('each role lands on its own home page', () => {
  assert.equal(homePathFor(null), '/login');
  assert.equal(homePathFor({ role: 'CITIZEN' }), '/shops');
  assert.equal(homePathFor({ role: 'MERCHANT' }), '/merchant/shops');
  assert.equal(homePathFor({ role: 'ADMIN' }), '/admin/shops');
});

test('builds image URLs on the API origin', () => {
  assert.equal(uploadUrl('http://localhost:5000/api/v1', 'shops/a.png', 'http://localhost:5173'), 'http://localhost:5000/uploads/shops/a.png');
  assert.equal(uploadUrl('/api/v1', 'shops/a.png', 'http://localhost:8080'), 'http://localhost:8080/uploads/shops/a.png');
  assert.equal(uploadUrl('/api/v1', null, 'http://localhost:8080'), null);
});
