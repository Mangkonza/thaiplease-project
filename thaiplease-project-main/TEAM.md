# ThaiPlease: แผนงานทีม

เอกสารอ้างอิงหลัก: **SRS v1.2** ถ้าโค้ดกับเอกสารไม่ตรงกัน ให้ยึดข้อตัดสินใจในไฟล์นี้ แล้วแก้ SRS ให้ตรง

## เริ่มต้นใช้งาน (ทุกคน)

1. เปิด Docker Desktop แล้วรัน `docker compose up -d` ที่โฟลเดอร์นี้ (สร้างตารางจาก `docker/postgres/init.sql`)
2. คัดลอก `backend/.env.example` เป็น `backend/.env` (ถ้าไม่มีไฟล์นี้ backend จะไม่ยอมเริ่ม)
   - PostgreSQL ใน Docker เปิดที่ port **5433** บนเครื่อง (`DB_PORT=5433`) เพื่อไม่ชนกับ PostgreSQL ที่ติดตั้งบน Windows ซึ่งใช้ 5432
   - ถ้ามี `.env` เก่าที่ยังเป็น `DB_PORT=5432` จะเจอ `password authentication failed` เพราะไปต่อ PostgreSQL ผิดตัว
3. `cd backend` แล้วรัน `npm ci`
4. ใส่ seed data ตาม [backend/seed/README.md](backend/seed/README.md) (บัญชีทดสอบอยู่ในไฟล์นั้น)
5. `npm test` ต้องผ่านทั้งหมดก่อน push ทุกครั้ง; `npm run dev` เพื่อรัน API ที่ `http://localhost:5000`

Test ใช้ `node:test` (มากับ Node) และ mock `db.query` ทำให้รันได้โดยไม่ต้องมีฐานข้อมูล ดูตัวอย่างใน `backend/test/`

## ข้อตัดสินใจ

| # | เรื่อง | ข้อตัดสินใจ |
|---|---|---|
| D-01 | ขอบเขต | ให้คะแนนจากเอกสารและ demo; demo ต้องเดินครบ 1 วงจร Metrics → AI → 3 ข้อเสนอ → เลือก 1 → Campaign → Payment/Redemption → Evaluate; FR-12 ถึง FR-14 เป็น Future Work |
| D-02 | แบ่ง Treatment/Control | ตอน activate นำ Citizen ที่ ACTIVE ทุกคนมาแบ่ง: `hash(user_id + campaign_id)` < `treatment_ratio` → TREATMENT; ทำใน transaction เดียวกับการเปลี่ยนสถานะเป็น ACTIVE |
| D-03 | Metrics | คำนวณ on-demand จาก `payments` (SUCCESS) ทุกครั้งที่เปิด Dashboard แล้ว upsert ลง `shop_metrics` |
| D-04 | KPI | 5 สูตรแยกตามโปร (ตารางด้านล่าง) เก็บ mapping เป็น constant ในโค้ด ไม่แก้ schema |
| D-05 | ตัดสินผล | กฎ 6 ข้อด้านล่าง เป็นเกณฑ์สาธิต ไม่ใช่สถิติ |
| D-06 | Demo | seed (มีแล้ว), สคริปต์ `simulate-purchases` ที่ยิง `POST /payments` จริง, และ `POST /campaigns/:id/end` |
| D-07 | AI | ผ่าน client รูปแบบ OpenAI-compatible ลองตามลำดับ: `AI_MODEL` → `AI_FALLBACK_MODEL` (Gemini free tier: `gemini-3.5-flash-lite` → `gemini-flash-lite-latest`) → `AI_SECONDARY_MODEL` (Groq `openai/gpt-oss-120b`, ใช้เมื่อใส่ `AI_SECONDARY_API_KEY`); timeout 45 วินาทีต่อโมเดล; แต่ละคนใช้ key ของตัวเอง ห้าม commit; backend ตรวจ JSON ที่ AI ตอบกลับ ถ้าไม่ผ่านให้แก้ 1 ครั้ง ถ้ายังไม่ผ่านหรือ AI ล่มห้ามบันทึกผล; free tier นำข้อมูลไปพัฒนาผลิตภัณฑ์ จึงส่งเฉพาะ metrics ระดับร้าน ไม่ส่ง shop_id (NFR-04) |
| D-08 | แคมเปญซ้อน | 1 ร้านมีแคมเปญ ACTIVE ได้ 1 ตัว ถ้า activate ซ้อนได้ HTTP 409 |
| D-09 | Payment | ส่วนลด, redemption และ coin อยู่ใน `POST /payments` transaction เดียว; ไม่มี endpoint redemption สาธารณะ |
| D-10 | อนุมัติร้าน | ร้านใหม่เป็น `PENDING` → Admin อนุมัติเป็น `ACTIVE` หรือปฏิเสธเป็น `SUSPENDED` (เก็บเหตุผลใน `audit_logs.detail`) |

### D-04: KPI ตามประเภทโปร

ทุกสูตรคิดแยกตามกลุ่ม นับเฉพาะ payment `SUCCESS` ของร้านนั้นในช่วงแคมเปญ
Baseline = สูตรเดียวกัน แต่คิดจากช่วงก่อนแคมเปญที่ยาวเท่ากัน

| KPI | สูตร (ต่อกลุ่ม) | Template | หน่วย Uplift |
|---|---|---|---|
| `conversion_rate` | คนที่ซื้อ ÷ คนในกลุ่ม (#8/#9 นับเฉพาะออเดอร์ในเวลา/วันที่โปรกำหนด) | 1, 2, 8, 9 | จุด % |
| `new_customer_conversion` | คนที่ไม่เคยซื้อร้านนี้แล้วมาซื้อ ÷ คนในกลุ่มที่ไม่เคยซื้อ | 10 | จุด % |
| `reactivation_rate` | คนที่หายไป ≥ `inactive_days` แล้วกลับมาซื้อ ÷ คนในกลุ่มที่หายไป | 6 | จุด % |
| `aov` | ยอดสุทธิรวม ÷ จำนวนออเดอร์ | 5 | บาท |
| `purchase_frequency` | จำนวนออเดอร์ ÷ คนในกลุ่ม | 3, 4, 7 | ครั้ง/คน |

### D-05: กฎตัดสินผล (ตรวจตามลำดับ)

1. ยังไม่ถึง `end_at` → ปฏิเสธ (HTTP 409)
2. กลุ่มใดมีคนในฐาน KPI < 20 → `INCONCLUSIVE`
3. `redemption_count` < 3 → `INCONCLUSIVE`
4. คิด KPI ไม่ได้ (เช่น หารด้วยศูนย์) → `INCONCLUSIVE`
5. Uplift > 0 → `SUCCESS`
6. Uplift ≤ 0 → `FAILED`

## การแบ่งงาน

แต่ละคนดูแลโฟลเดอร์ของตัวเอง (backend, หน้าเว็บ, test และหัวข้อใน SRS ของ module นั้น)

| | **B: Analytics & AI** (ทรงวุฒิ) | **A: Payment & ร้านค้า** | **C: Campaign & Evaluation** |
|---|---|---|---|
| โฟลเดอร์ | `modules/analytics/`, `modules/ai-reports/` | `modules/payments/`, `modules/coins/`, `modules/admin/`, `scripts/simulate-purchases.js` | `modules/campaigns/` |
| API | `GET /shops/:id/dashboard`, `GET /shops/:id/metrics`, `POST /shops/:id/ai-reports`, `GET /shops/:id/ai-reports`, `GET /ai-reports/:id`, `GET /promotion-templates` | `POST /payments`, `GET /users/me/coins`, `GET /users/me/coin-transactions`, `GET /users/me/payments`, `PATCH /admin/shops/:id/status` | `POST /ai-suggestions/:id/select`, `POST/PATCH/GET /campaigns`, `POST /campaigns/:id/activate`, `POST /campaigns/:id/end`, `POST /campaigns/:id/evaluate`, `GET /campaigns/:id/result`, `GET /shops/:id/campaigns`, `GET /admin/audit-logs` |
| ตารางที่เขียน | `shop_metrics`, `ai_reports`, `ai_suggestions` | `payments`, `coin_ledger`, `shops.status` | `campaigns`, `campaign_assignments`, `promotion_redemptions`, `campaign_results`, `audit_logs` |
| หน้าเว็บ | Dashboard, AI Report, หน้า Admin ทั้งหมด (อนุมัติร้าน, Audit logs, แม่แบบโปรโมชัน) | Citizen (ค้นร้าน, จ่ายเงิน, coin), สร้างร้าน | Campaign Setup, Campaign Result, ปุ่มเลือกข้อเสนอ |
| Acceptance test | AT-06, 07, 08, 09, 16 | AT-04, 05, 19, 20 | AT-10 ถึง 15, 17 |
| หัวข้อ SRS v1.2 | 2.7, 3.4.1-3.4.2, UC-02, UC-03, ตัวอย่าง 3.5.1 | 1.3, FR-02/GAP-01, UC-07, UC-08, UC-09, UC อนุมัติร้าน | 3.4.3, GAP-04/05, UC-04, UC-05, UC-06, UC-10 |
| เริ่มได้ทันที | คำนวณ metrics จาก seed; ทดลอง Ollama; เขียนตัวตรวจ JSON ตาม `parameter_schema` | `POST /payments` โดยเรียก stub ใน `campaign.service.js` | สูตร KPI, กฎ D-05 และ hash D-02 เป็น pure function พร้อม unit test |

### สัญญาระหว่างคน (อย่าเปลี่ยนโดยไม่คุยกัน)

- **A ↔ C:** [`backend/src/modules/campaigns/campaign.service.js`](backend/src/modules/campaigns/campaign.service.js)
  - A เรียก `quoteCampaignBenefit()` ก่อน INSERT payments และ `recordRedemption()` หลัง INSERT ภายใน transaction เดียวกัน
  - ตอนนี้ stub คืน `null` (ไม่มีแคมเปญ) A จึงพัฒนาได้เลย; C เติม logic จริงในไฟล์เดียวกันโดยไม่เปลี่ยน signature
- **B → C:** ผ่านตาราง `ai_suggestions` เท่านั้น (`status = 'PROPOSED'`, `rank` 1-3, `parameters` ผ่าน `parameter_schema`) C ใส่แถวทดสอบเองได้โดยไม่ต้องรอ B
- **ทุกคน:** auth middleware (`authenticateToken`, `authorizeRole`, `verifyShopOwner`); token ผิด = 401, สิทธิ์ไม่พอ/บัญชีถูกระงับ = 403

### กติกา Git

- branch ต่อคน เช่น `feature/ai-reports`, `feature/payments`, `feature/campaigns` แล้ว merge ผ่าน Pull Request
- ไฟล์ที่ใช้ร่วมกันมีแค่ `backend/src/app.js` (เพิ่มบรรทัด `app.use` ของตัวเอง) และ `frontend/src/App.jsx` (เพิ่ม route) แก้ให้น้อยที่สุดเพื่อลด conflict
- ห้าม commit `.env`; `npm test` ต้องผ่านก่อนเปิด PR

## Checklist ก่อน demo (ส่วน AI)

1. **ให้ข้อมูลเป็นปัจจุบัน:** ค่าเริ่มต้นของหน้า Dashboard คือ "สัปดาห์ล่าสุดที่จบแล้ว" จึงต้องสร้าง seed ใหม่ให้ `--end` เป็นวันอาทิตย์ก่อนวัน demo แล้วใส่ลงฐานข้อมูลที่ว่าง ตาม [backend/seed/README.md](backend/seed/README.md)
2. **แผน ก:** ก่อนขึ้น demo 10–30 นาที login `merchant.a@thaiplease.test` → ร้านกาแฟบ้านสวน → กด "วิเคราะห์ด้วย AI" ให้มีรายงานบันทึกไว้ ตอน demo เปิดหน้าเดิมแล้วรายงานจะขึ้นทันที ถ้าเน็ตดีค่อยกด "วิเคราะห์ใหม่" ถ้า AI ล่ม หน้าเว็บแสดงข้อความแจ้งและยังแสดงรายงานที่บันทึกไว้
3. **แผน ข:** สมัคร key ที่ [console.groq.com](https://console.groq.com/) แล้ววางต่อท้าย `AI_SECONDARY_API_KEY=` ใน `backend/.env` (ต้องมีชื่อตัวแปรนำหน้า) จากนั้น restart backend
4. `npm test` ทั้งใน `backend/` และ `frontend/` ต้องผ่าน

## ยังเปิดอยู่

- D-07: ทดสอบ Groq จริงแล้ว (22 ต.ค. 2026): ตอบ 3–5 วินาที ผ่านการตรวจ และระบบสลับจาก Gemini ไป Groq เองเมื่อ Gemini ล้มทั้งสองโมเดล; ยังต้องเขียนเรื่องการส่งข้อมูลออกนอกระบบใน SRS 3.4.1 (B)
- SRS 3.4.2 ตรวจตัวเลขที่ AI อ้างแบบแจ้งเตือน (`number_check` ตอนอ่านรายงาน) ไม่ปฏิเสธรายงาน ต้องเขียนวิธีตรวจนี้ลง SRS (B)
- Citizen ที่ login แล้วถูกพาไป `/dashboard` ซึ่งเรียก `/shops/my` ได้ 403 แล้วถูก logout ทันที ต้องมีหน้าสำหรับ Citizen แยก (A)
- หน้า Dashboard แสดง badge สถานะร้านเป็นสีเขียวเสมอ ต้องแยกสี PENDING/SUSPENDED (A)
