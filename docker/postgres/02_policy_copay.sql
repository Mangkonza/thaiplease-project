-- เฟส 1: นโยบายโครงการแบบมีเวอร์ชัน + รัฐช่วยจ่าย (D-11, D-12, D-14, D-17)
-- เขียนให้รันซ้ำได้ เพื่อใช้ทั้งตอนสร้าง DB ใหม่ (docker-entrypoint-initdb.d) และอัปเดต DB เดิม:
--   docker exec -i thaiplease_postgres psql -U thaiplease_user -d thaiplease_db < docker/postgres/02_policy_copay.sql

-- นโยบายแก้ไม่ได้ แก้แล้วเกิดแถวใหม่ เวอร์ชันล่าสุดคือนโยบายที่ใช้อยู่ payment อ้างเวอร์ชันที่ใช้คำนวณไว้
CREATE TABLE IF NOT EXISTS project_policies (
    policy_version SERIAL PRIMARY KEY,
    copay_percent NUMERIC(5,2) NOT NULL CHECK (copay_percent BETWEEN 0 AND 100),
    daily_cap NUMERIC(12,2) NOT NULL CHECK (daily_cap >= 0),
    monthly_cap NUMERIC(12,2) NOT NULL CHECK (monthly_cap >= daily_cap),
    lifetime_cap NUMERIC(12,2) NOT NULL CHECK (lifetime_cap >= monthly_cap),
    baht_per_coin INTEGER NOT NULL CHECK (baht_per_coin >= 1),
    coupon_coin_cost INTEGER NOT NULL CHECK (coupon_coin_cost >= 1),
    coupon_value NUMERIC(12,2) NOT NULL CHECK (coupon_value > 0),
    coupon_min_spend NUMERIC(12,2) NOT NULL CHECK (coupon_min_spend >= coupon_value),
    coupon_valid_days INTEGER NOT NULL CHECK (coupon_valid_days >= 1),
    program_start DATE NOT NULL,
    program_end DATE NOT NULL CHECK (program_end >= program_start),
    note TEXT,
    created_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO project_policies (copay_percent, daily_cap, monthly_cap, lifetime_cap, baht_per_coin,
    coupon_coin_cost, coupon_value, coupon_min_spend, coupon_valid_days, program_start, program_end, note)
SELECT 60, 200, 2000, 8000, 25, 100, 20, 100, 30, DATE '2026-10-01', DATE '2027-03-31', 'นโยบายเริ่มต้นของโครงการ'
WHERE NOT EXISTS (SELECT 1 FROM project_policies);

-- net_amount ยังหมายถึงเงินที่ร้านได้รับ (ยอดเต็ม − ส่วนลดแคมเปญ) เพื่อให้ analytics และผลแคมเปญเดิมไม่เปลี่ยน
-- discount_amount ยังเป็นส่วนลดแคมเปญ เพื่อให้ client เดิมใช้ต่อได้
ALTER TABLE payments ADD COLUMN IF NOT EXISTS coupon_discount NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (coupon_discount >= 0);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS government_subsidy NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (government_subsidy >= 0);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS citizen_paid NUMERIC(12,2) CHECK (citizen_paid >= 0);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS policy_version INTEGER REFERENCES project_policies(policy_version);

-- รายการเก่าก่อนมีรัฐช่วยจ่าย ประชาชนจ่ายเต็มยอดหลังส่วนลดแคมเปญ
UPDATE payments SET citizen_paid = net_amount WHERE citizen_paid IS NULL;
ALTER TABLE payments ALTER COLUMN citizen_paid SET NOT NULL;

-- ใช้รวมยอดรัฐช่วยจ่ายรายคนตอนเช็คเพดาน
CREATE INDEX IF NOT EXISTS idx_payments_user_paid_at ON payments (user_id, paid_at);
