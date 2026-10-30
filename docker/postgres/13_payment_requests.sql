-- คำขอรับเงินแบบไทยพลัส: ร้านใส่ยอดแล้วได้ QR เฉพาะครั้ง ลูกค้าสแกนแล้วจ่ายยอดนั้นภายในเวลาที่กำหนด
-- ยอดเงินอ่านจากตารางนี้เท่านั้น ลูกค้าแก้ยอดเองไม่ได้ และคำขอหนึ่งใบจ่ายได้ครั้งเดียว (payment_id UNIQUE)
-- คำขอที่เลยเวลาไม่ต้องเปลี่ยนสถานะ ให้ถือว่าหมดอายุเมื่อ expires_at <= now()
DO $$ BEGIN
    CREATE TYPE payment_request_status AS ENUM ('PENDING', 'PAID', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS payment_requests (
    request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES shops(shop_id) ON DELETE CASCADE,
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    status payment_request_status NOT NULL DEFAULT 'PENDING',
    created_by UUID NOT NULL REFERENCES users(user_id),
    expires_at TIMESTAMPTZ NOT NULL,
    payment_id UUID UNIQUE REFERENCES payments(payment_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK ((status = 'PAID') = (payment_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_payment_requests_shop_created ON payment_requests (shop_id, created_at DESC);
