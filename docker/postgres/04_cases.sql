-- เฟส 3: คำขอคืนเงินและเรื่องร้องเรียน (D-15)
-- เขียนให้รันซ้ำได้ เพื่อใช้ทั้งตอนสร้าง DB ใหม่ (docker-entrypoint-initdb.d) และอัปเดต DB เดิม:
--   docker exec -i thaiplease_postgres psql -U thaiplease_user -d thaiplease_db < docker/postgres/04_cases.sql

-- REFUND: ร้านอนุมัติ/ปฏิเสธ (เกิน 3 วัน Admin ตัดสินแทน) ผลเป็น APPROVED/REJECTED
-- COMPLAINT: Admin ปิดเรื่อง ผลเป็น RESOLVED
CREATE TABLE IF NOT EXISTS case_requests (
    case_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_type VARCHAR(20) NOT NULL CHECK (case_type IN ('REFUND', 'COMPLAINT')),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    payment_id UUID NOT NULL REFERENCES payments(payment_id) ON DELETE CASCADE,
    shop_id UUID NOT NULL REFERENCES shops(shop_id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'RESOLVED')),
    decided_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    decided_at TIMESTAMPTZ,
    decision_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- รายการจ่ายเงินหนึ่งรายการมีคำขอแต่ละประเภทที่ยังค้างได้ครั้งละ 1 เรื่อง
CREATE UNIQUE INDEX IF NOT EXISTS uq_case_requests_open
    ON case_requests (payment_id, case_type) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_case_requests_shop_status ON case_requests (shop_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_case_requests_user ON case_requests (user_id, created_at);

ALTER TABLE payments ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;
