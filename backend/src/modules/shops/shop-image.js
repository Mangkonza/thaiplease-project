const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const express = require('express');
const db = require('../../config/db');

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
// เก็บไฟล์บนดิสก์ ใน Docker เป็น volume แยกเพื่อไม่ให้รูปหายเมื่อ build image ใหม่
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '../../../uploads'));
const SHOP_IMAGE_DIR = 'shops';

// ดูชนิดไฟล์จาก byte แรกของไฟล์ ไม่เชื่อ Content-Type หรือนามสกุลที่ client ส่งมา
function detectImageType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

const rawBody = express.raw({ type: () => true, limit: MAX_IMAGE_BYTES });

// อ่านไฟล์เป็น Buffer; ไฟล์ใหญ่เกินตอบ 413 เป็น JSON แทนหน้า error ของ Express
function readImageBody(req, res, next) {
  rawBody(req, res, (error) => {
    if (!error) return next();
    if (error.type === 'entity.too.large') {
      return res.status(413).json({ success: false, code: 'IMAGE_TOO_LARGE', message: 'Image must be 2 MB or smaller' });
    }
    return next(error);
  });
}

async function uploadShopImage(req, res) {
  const extension = detectImageType(req.body);
  if (!extension) {
    return res.status(415).json({ success: false, code: 'IMAGE_TYPE', message: 'Only JPG, PNG or WEBP images are allowed' });
  }
  const { shopId } = req.params;
  const relativePath = `${SHOP_IMAGE_DIR}/${shopId}-${crypto.randomUUID()}.${extension}`;
  try {
    await fs.mkdir(path.join(UPLOAD_DIR, SHOP_IMAGE_DIR), { recursive: true });
    await fs.writeFile(path.join(UPLOAD_DIR, relativePath), req.body);
    const previous = await db.query('SELECT image_path FROM shops WHERE shop_id = $1', [shopId]);
    const result = await db.query(
      'UPDATE shops SET image_path = $2, updated_at = NOW() WHERE shop_id = $1 RETURNING shop_id, image_path',
      [shopId, relativePath]
    );
    const oldPath = previous.rows[0]?.image_path;
    if (oldPath && oldPath.startsWith(`${SHOP_IMAGE_DIR}/`)) {
      // ลบรูปเก่าไม่สำเร็จไม่ทำให้การอัปโหลดล้ม แต่ต้อง log ไว้
      fs.unlink(path.join(UPLOAD_DIR, oldPath)).catch((error) => {
        if (error.code !== 'ENOENT') console.error(`Remove old shop image ${oldPath} failed:`, error);
      });
    }
    return res.json({ success: true, shop: result.rows[0] });
  } catch (error) {
    console.error('Upload shop image error:', error);
    return res.status(500).json({ success: false, message: 'Unable to save shop image' });
  }
}

module.exports = { UPLOAD_DIR, MAX_IMAGE_BYTES, detectImageType, readImageBody, uploadShopImage };
