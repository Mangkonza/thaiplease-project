-- กระเป๋าเงินจำลอง, PIN สำหรับยืนยันการจ่าย และรูปหน้าร้าน (รูปแบบเดียวกับแอปเป๋าตัง)
-- รันซ้ำได้ ไฟล์นี้รันหลัง seed (07) จึงเติมยอดเริ่มต้นให้ประชาชนใน seed ได้

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS pin_hash VARCHAR(255),
    ADD COLUMN IF NOT EXISTS pin_failed_attempts INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS pin_locked_until TIMESTAMPTZ;

ALTER TABLE shops ADD COLUMN IF NOT EXISTS image_path VARCHAR(255);

-- บันทึกเงินเข้าออกแบบเพิ่มอย่างเดียว ยอดคงเหลือ = SUM(amount)
CREATE TABLE IF NOT EXISTS wallet_ledger (
    ledger_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    payment_id UUID REFERENCES payments(payment_id),
    amount NUMERIC(12,2) NOT NULL CHECK (amount <> 0),
    reason VARCHAR(20) NOT NULL CHECK (reason IN ('OPENING', 'TOPUP', 'PAYMENT', 'REFUND')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_user ON wallet_ledger (user_id, created_at DESC);
-- รายการจ่ายหนึ่งรายการหักเงินได้ครั้งเดียวและคืนเงินได้ครั้งเดียว
CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_ledger_payment_reason
    ON wallet_ledger (payment_id, reason) WHERE payment_id IS NOT NULL;

-- ยอดเริ่มต้นสำหรับ demo: ประชาชนที่ยังไม่มีรายการในกระเป๋าได้คนละ 1,000 บาท
INSERT INTO wallet_ledger (user_id, amount, reason)
SELECT u.user_id, 1000, 'OPENING'
FROM users u
WHERE u.role = 'CITIZEN'
  AND NOT EXISTS (SELECT 1 FROM wallet_ledger w WHERE w.user_id = u.user_id);
