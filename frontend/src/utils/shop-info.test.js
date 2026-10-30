import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapsUrl, menuPriceText } from './shop-info.js';

test('opens Google Maps at the shop coordinates when they exist', () => {
  assert.equal(mapsUrl({ name: 'ร้าน', address: 'x', latitude: '14.018420', longitude: '99.982310' }),
    'https://www.google.com/maps/search/?api=1&query=14.01842%2C99.98231');
});

test('falls back to searching the name and address, and has no link without either location', () => {
  assert.equal(mapsUrl({ name: 'ร้าน A', address: 'ถนน B', latitude: null, longitude: null }),
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('ร้าน A ถนน B')}`);
  assert.equal(mapsUrl({ name: 'ร้าน A', address: null, latitude: null, longitude: null }), null);
  assert.equal(mapsUrl(null), null);
});

test('shows a price or a note when the shop did not set one', () => {
  assert.equal(menuPriceText(1500), '1,500 บาท');
  assert.equal(menuPriceText(null), 'ราคาตามจริง');
});
