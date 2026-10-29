-- เฟส 2: คูปองที่ประชาชนแลกจากเหรียญ รัฐเป็นผู้ออก (D-13, D-19)
-- เขียนให้รันซ้ำได้ เพื่อใช้ทั้งตอนสร้าง DB ใหม่ (docker-entrypoint-initdb.d) และอัปเดต DB เดิม:
--   docker exec -i thaiplease_postgres psql -U thaiplease_user -d thaiplease_db < docker/postgres/03_coupons.sql

-- เก็บมูลค่า/ขั้นต่ำ ณ ตอนแลก เพื่อไม่ให้การแก้นโยบายภายหลังเปลี่ยนคูปองที่แลกไปแล้ว
-- คูปองหมดอายุไม่ต้องมี job มาเปลี่ยนสถานะ ดูจาก expires_at แทน
CREATE TABLE IF NOT EXISTS coupons (
    coupon_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    value NUMERIC(12,2) NOT NULL CHECK (value > 0),
    min_spend NUMERIC(12,2) NOT NULL CHECK (min_spend >= value),
    coin_cost INTEGER NOT NULL CHECK (coin_cost >= 1),
    policy_version INTEGER REFERENCES project_policies(policy_version),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'USED')),
    expires_at TIMESTAMPTZ NOT NULL,
    payment_id UUID UNIQUE REFERENCES payments(payment_id) ON DELETE SET NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_coupons_user_status ON coupons (user_id, status, expires_at);
