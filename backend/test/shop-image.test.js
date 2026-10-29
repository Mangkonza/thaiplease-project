const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

// ต้องตั้งก่อนโหลด app เพื่อให้ไฟล์ test ไม่ไปเขียนลงโฟลเดอร์ uploads จริง
const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'thaiplease-uploads-'));
process.env.UPLOAD_DIR = uploadDir;

const { test, describe, before, after, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { db, startServer, signToken } = require('./helpers');
const { detectImageType } = require('../src/modules/shops/shop-image');

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const SHOP_ID = '33333333-3333-4333-8333-333333333333';
const token = signToken({ user_id: OWNER_ID, email: 'merchant@example.com', role: 'MERCHANT', status: 'ACTIVE' });
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
let api;

before(async () => { api = await startServer(); });
after(async () => {
  await api.close();
  fs.rmSync(uploadDir, { recursive: true, force: true });
});
afterEach(() => mock.restoreAll());

function mockShop({ owner = OWNER_ID } = {}) {
  const updates = [];
  mock.method(db, 'query', async (sql, params) => {
    if (sql.startsWith('SELECT status FROM users')) return { rows: [{ status: 'ACTIVE' }] };
    if (sql.includes('SELECT owner_id FROM shops')) return { rows: [{ owner_id: owner }] };
    if (sql.includes('SELECT image_path FROM shops')) return { rows: [{ image_path: null }] };
    if (sql.includes('UPDATE shops SET image_path')) {
      updates.push(params);
      return { rows: [{ shop_id: SHOP_ID, image_path: params[1] }] };
    }
    return { rows: [] };
  });
  return updates;
}

const upload = (body, contentType = 'image/png') => fetch(`${api.baseUrl}/api/v1/shops/${SHOP_ID}/image`, {
  method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType }, body,
});

describe('shop image', () => {
  test('detects JPG, PNG and WEBP from the file bytes', () => {
    assert.equal(detectImageType(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(12)])), 'jpg');
    assert.equal(detectImageType(PNG), 'png');
    assert.equal(detectImageType(Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'binary')), 'webp');
    assert.equal(detectImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);
  });

  test('saves the file and stores its path for the owner', async () => {
    const updates = mockShop();
    const response = await upload(PNG);
    assert.equal(response.status, 200);
    const [, imagePath] = updates[0];
    assert.match(imagePath, new RegExp(`^shops/${SHOP_ID}-[0-9a-f-]{36}\\.png$`));
    assert.deepEqual(fs.readFileSync(path.join(uploadDir, imagePath)), PNG);

    const served = await fetch(`${api.baseUrl}/uploads/${imagePath}`);
    assert.equal(served.status, 200);
    assert.equal(served.headers.get('content-type'), 'image/png');
  });

  test('rejects a file that is not an image even if it claims to be one', async () => {
    const updates = mockShop();
    const response = await upload(Buffer.from('<script>alert(1)</script>'), 'image/png');
    assert.equal(response.status, 415);
    assert.equal(updates.length, 0);
  });

  test('rejects images larger than 2 MB', async () => {
    mockShop();
    const response = await upload(Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]));
    assert.equal(response.status, 413);
    assert.equal((await response.json()).code, 'IMAGE_TOO_LARGE');
  });

  test('another merchant cannot change the shop image', async () => {
    const updates = mockShop({ owner: '99999999-9999-4999-8999-999999999999' });
    const response = await upload(PNG);
    assert.equal(response.status, 403);
    assert.equal(updates.length, 0);
  });
});
