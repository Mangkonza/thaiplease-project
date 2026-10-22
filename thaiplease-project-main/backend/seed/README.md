# Seed data (development & demo only)

`seed.sql` ถูกสร้างจาก `backend/scripts/generate-seed.js` ห้ามแก้ไฟล์ SQL ด้วยมือ ให้แก้ที่ตัว generator แล้วสร้างใหม่

## บัญชีทดสอบ

ทุกบัญชีใช้รหัสผ่าน `Test1234!`

| Email | Role | Status | หมายเหตุ |
|---|---|---|---|
| `admin@thaiplease.test` | ADMIN | ACTIVE | |
| `merchant.a@thaiplease.test` | MERCHANT | ACTIVE | เจ้าของร้านกาแฟบ้านสวน (ร้าน story) และบ้านสวนเบเกอรี่ (SUSPENDED) |
| `merchant.b@thaiplease.test` | MERCHANT | ACTIVE | เจ้าของข้าวมันไก่ป้าแดง และขนมไทยแม่ศรี (PENDING) |
| `citizen01@thaiplease.test` … `citizen80@thaiplease.test` | CITIZEN | ACTIVE | pool สำหรับแบ่ง Treatment/Control (D-02) |
| `suspended@thaiplease.test` | CITIZEN | SUSPENDED | ใช้ทดสอบ AT-02 (ได้ 403) |

## ข้อมูลที่ได้

- ร้าน: ACTIVE 2, PENDING 1, SUSPENDED 1 (คำอธิบายร้านเขียนแบบร้านจริง เพื่อไม่ให้หน้าเว็บเฉลย story ก่อน AI วิเคราะห์)
- Payment ย้อนหลัง 8 สัปดาห์ (จันทร์-อาทิตย์) จบที่ `--end`
- **Story ของร้านกาแฟบ้านสวน:** สัปดาห์ล่าสุดลูกค้าใหม่เหลือ 1 คน (ก่อนหน้า 3-6 คน/สัปดาห์) และยอดขาย/ออเดอร์ลดลงจากสัปดาห์ก่อน → AI ควรเห็นปัญหาลูกค้าใหม่ลดลง
- Citizen ที่ไม่เคยซื้อร้านกาแฟบ้านสวน ≥ 40 คน ทำให้โปร NEW_CUSTOMER ผ่านเกณฑ์ ≥ 20 คนต่อกลุ่ม (D-05)
- มี payment `REFUNDED` 2 รายการ (มี coin บวกและรายการลบคืน ตาม BR-08) และ `FAILED` 1 รายการ สำหรับทดสอบนิยาม Revenue
- Coin ledger: 1 coin ต่อ 25 บาท (BR-09)

ID คงที่ทุกครั้ง เช่น ร้านกาแฟบ้านสวน = `b0000000-0000-4000-8000-000000000001` (ดู `ID` ใน generator)

## สร้างไฟล์ใหม่

ใช้ `--end` เป็นวันอาทิตย์สุดท้ายของข้อมูล ถ้าไม่ใส่จะใช้วันอาทิตย์ล่าสุดที่จบไปแล้ว
ก่อน demo ควรสร้างใหม่ให้สัปดาห์ล่าสุดเป็นสัปดาห์ที่แล้ว

```bash
npm run seed:generate -- --end 2026-10-18
```

## ใส่ข้อมูลลงฐานข้อมูล

ต้องรัน `init.sql` (สร้างตาราง) ไปแล้ว และตาราง `users`, `shops`, `payments`, `coin_ledger` ต้องยังว่าง
ไฟล์อยู่ใน transaction เดียว ถ้าล้มจะไม่มีข้อมูลค้างครึ่งทาง

PowerShell (รันจากโฟลเดอร์ `backend`):

```powershell
Get-Content seed\seed.sql -Raw -Encoding utf8 | docker exec -i thaiplease_postgres psql -U thaiplease_user -d thaiplease_db -v ON_ERROR_STOP=1
```

ถ้าต้องการล้างแล้วเริ่มใหม่: `docker compose down -v` จะลบข้อมูลทั้งหมดในฐานข้อมูล แล้ว `docker compose up -d` จะรัน `init.sql` ใหม่
