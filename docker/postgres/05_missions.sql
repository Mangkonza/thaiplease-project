-- เฟส 4: ภารกิจ (D-16) ประชาชนกดรับ แล้วลองร้านใหม่ให้ครบตามจำนวนภายในกี่วัน ได้เหรียญรางวัล
-- เขียนให้รันซ้ำได้ เพื่อใช้ทั้งตอนสร้าง DB ใหม่ (docker-entrypoint-initdb.d) และอัปเดต DB เดิม:
--   docker exec -i thaiplease_postgres psql -U thaiplease_user -d thaiplease_db < docker/postgres/05_missions.sql

-- ตอนนี้มีภารกิจแบบเดียวคือ NEW_SHOPS: ร้านที่ไม่เคยซื้อก่อนกดรับภารกิจ
CREATE TABLE IF NOT EXISTS missions (
    mission_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mission_type VARCHAR(30) NOT NULL DEFAULT 'NEW_SHOPS' CHECK (mission_type IN ('NEW_SHOPS')),
    title VARCHAR(200) NOT NULL,
    description TEXT,
    target_count INTEGER NOT NULL CHECK (target_count BETWEEN 1 AND 50),
    window_days INTEGER NOT NULL CHECK (window_days BETWEEN 1 AND 365),
    reward_coins INTEGER NOT NULL CHECK (reward_coins BETWEEN 1 AND 100000),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CLOSED')),
    created_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMPTZ
);

-- หมดเวลาไม่ต้องมี job เปลี่ยนสถานะ ดูจาก deadline_at แทน
-- reward_payment_id = รายการที่ทำให้ครบ ถ้ารายการนั้นถูกคืนเงิน ภารกิจกลับเป็น IN_PROGRESS และเหรียญถูกหักคืน
CREATE TABLE IF NOT EXISTS mission_enrollments (
    enrollment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mission_id UUID NOT NULL REFERENCES missions(mission_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS', 'COMPLETED')),
    accepted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deadline_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    reward_payment_id UUID REFERENCES payments(payment_id) ON DELETE SET NULL,
    UNIQUE (mission_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_mission_enrollments_user ON mission_enrollments (user_id, status, deadline_at);

INSERT INTO missions (title, description, target_count, window_days, reward_coins)
SELECT 'ลองร้านใหม่ 2 ร้าน', 'ซื้อจากร้านที่ไม่เคยซื้อมาก่อนให้ครบ 2 ร้านภายใน 30 วันหลังกดรับภารกิจ', 2, 30, 50
WHERE NOT EXISTS (SELECT 1 FROM missions);
