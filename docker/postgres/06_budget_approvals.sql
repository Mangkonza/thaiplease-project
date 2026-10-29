-- เฟส 5: อนุมัติแคมเปญแจกเหรียญ (D-18) และการโอนเงินจากโครงการให้ร้าน (D-14, D-17)
-- เขียนให้รันซ้ำได้ เพื่อใช้ทั้งตอนสร้าง DB ใหม่ (docker-entrypoint-initdb.d) และอัปเดต DB เดิม:
--   docker exec -i thaiplease_postgres psql -U thaiplease_user -d thaiplease_db < docker/postgres/06_budget_approvals.sql

-- ใช้กับแคมเปญแบบ BONUS_COIN, COIN_MULTIPLIER, FREQUENCY_REWARD เท่านั้น (NULL = ยังไม่ส่งขออนุมัติ)
-- แก้ฉบับร่างหลังอนุมัติแล้ว สถานะกลับเป็น NULL ต้องขออนุมัติใหม่
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS coin_approval_status VARCHAR(20)
    CHECK (coin_approval_status IN ('PENDING', 'APPROVED', 'REJECTED'));
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS coin_approval_note TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS coin_approved_by UUID REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS coin_approved_at TIMESTAMPTZ;

-- ยอดที่โครงการต้องโอนให้ร้าน = รัฐช่วยจ่าย + คูปอง ของรายการ SUCCESS
-- Admin บันทึกการโอนทีละครั้ง ยอดรอรับ = ยอดที่ต้องโอนทั้งหมด − ยอดที่โอนแล้ว
CREATE TABLE IF NOT EXISTS shop_payouts (
    payout_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES shops(shop_id) ON DELETE CASCADE,
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    note TEXT,
    created_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_shop_payouts_shop ON shop_payouts (shop_id, created_at);
CREATE INDEX IF NOT EXISTS idx_payments_shop_status ON payments (shop_id, status);

-- seed รุ่นก่อนใช้เหตุผล PURCHASE_REWARD ส่วนระบบจริงใช้ PAYMENT_REWARD ปรับให้เป็นชื่อเดียวกัน
UPDATE coin_ledger SET reason = 'PAYMENT_REWARD' WHERE reason = 'PURCHASE_REWARD';
