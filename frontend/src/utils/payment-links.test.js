import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPayUrl, homePathFor, parsePaymentRequestIdFromQr, uploadUrl } from './payment-links.js';

const REQUEST_ID = 'b0000000-0000-4000-8000-000000000002';

test('a payment QR round-trips to its request id from any origin', () => {
  assert.equal(parsePaymentRequestIdFromQr(buildPayUrl('http://localhost:8080', REQUEST_ID)), REQUEST_ID);
  assert.equal(parsePaymentRequestIdFromQr(`https://192.168.1.20:8080/pay/${REQUEST_ID.toUpperCase()}/`), REQUEST_ID);
});

test('rejects QR codes that are not ThaiPlease payment links', () => {
  assert.equal(parsePaymentRequestIdFromQr('https://promptpay.io/0812345678'), null);
  assert.equal(parsePaymentRequestIdFromQr(`javascript:alert(1)//pay/${REQUEST_ID}`), null);
  assert.equal(parsePaymentRequestIdFromQr(`http://localhost/pay/${REQUEST_ID}/extra`), null);
  assert.equal(parsePaymentRequestIdFromQr('not a url'), null);
  assert.equal(parsePaymentRequestIdFromQr(null), null);
});

test('each role lands on its own home page', () => {
  assert.equal(homePathFor(null), '/login');
  assert.equal(homePathFor({ role: 'CITIZEN' }), '/home');
  assert.equal(homePathFor({ role: 'MERCHANT' }), '/merchant/shops');
  assert.equal(homePathFor({ role: 'ADMIN' }), '/admin/shops');
});

test('builds image URLs on the API origin', () => {
  assert.equal(uploadUrl('http://localhost:5000/api/v1', 'shops/a.png', 'http://localhost:5173'), 'http://localhost:5000/uploads/shops/a.png');
  assert.equal(uploadUrl('/api/v1', 'shops/a.png', 'http://localhost:8080'), 'http://localhost:8080/uploads/shops/a.png');
  assert.equal(uploadUrl('/api/v1', null, 'http://localhost:8080'), null);
});
