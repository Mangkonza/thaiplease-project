-- แม่แบบแคมเปญที่ Admin จัดการเองได้ และภารกิจหลายแบบที่ให้เหรียญหรือคูปองเฉพาะร้าน
-- รันซ้ำได้: docker exec -i thaiplease_postgres psql -U thaiplease_user -d thaiplease_db < docker/postgres/11_templates_missions.sql

-- 1) แม่แบบ = กลไก (วิธีคิดส่วนลดในโค้ด มี 10 แบบ) + ชื่อ คำอธิบาย และช่วงค่าที่ Admin ตั้งเอง
ALTER TABLE promotion_templates ADD COLUMN IF NOT EXISTS mechanic VARCHAR(50);
UPDATE promotion_templates SET mechanic = code WHERE mechanic IS NULL;
ALTER TABLE promotion_templates ALTER COLUMN mechanic SET NOT NULL;
ALTER TABLE promotion_templates DROP CONSTRAINT IF EXISTS promotion_templates_mechanic_check;
ALTER TABLE promotion_templates ADD CONSTRAINT promotion_templates_mechanic_check CHECK (mechanic IN (
    'PERCENT_DISCOUNT', 'FIXED_DISCOUNT', 'BONUS_COIN', 'COIN_MULTIPLIER', 'MIN_SPEND_REWARD',
    'COMEBACK_REWARD', 'FREQUENCY_REWARD', 'TIME_BASED', 'DAY_BASED', 'NEW_CUSTOMER'));
-- แม่แบบที่เคยถูกใช้ลบจริงไม่ได้ (แคมเปญเก่าอ้างอยู่) จึงเก็บเข้าคลังแทน
ALTER TABLE promotion_templates ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE promotion_templates ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE SEQUENCE IF NOT EXISTS promotion_templates_template_id_seq AS SMALLINT OWNED BY promotion_templates.template_id;
SELECT setval('promotion_templates_template_id_seq', GREATEST((SELECT MAX(template_id) FROM promotion_templates), 10));
ALTER TABLE promotion_templates ALTER COLUMN template_id SET DEFAULT nextval('promotion_templates_template_id_seq');

-- 2) ภารกิจหลายแบบ
--    NEW_SHOPS ลองร้านใหม่ N ร้าน, ORDER_COUNT ซื้อครบ N ครั้ง, SPEND_TOTAL ใช้จ่ายรวมครบ X บาท
--    shop_id: นับเฉพาะร้านนี้ (ใช้ไม่ได้กับ NEW_SHOPS)
--    รางวัล COINS = เหรียญ, SHOP_COUPON = คูปองส่วนลดใช้ได้เฉพาะร้าน reward_shop_id (โครงการออกเงิน)
ALTER TABLE missions DROP CONSTRAINT IF EXISTS missions_mission_type_check;
ALTER TABLE missions ADD CONSTRAINT missions_mission_type_check CHECK (mission_type IN ('NEW_SHOPS', 'ORDER_COUNT', 'SPEND_TOTAL'));
ALTER TABLE missions ALTER COLUMN target_count DROP NOT NULL;
ALTER TABLE missions ALTER COLUMN reward_coins DROP NOT NULL;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS target_amount NUMERIC(12,2) CHECK (target_amount > 0);
ALTER TABLE missions ADD COLUMN IF NOT EXISTS shop_id UUID REFERENCES shops(shop_id);
ALTER TABLE missions ADD COLUMN IF NOT EXISTS reward_type VARCHAR(20) NOT NULL DEFAULT 'COINS';
ALTER TABLE missions ADD COLUMN IF NOT EXISTS reward_coupon_value NUMERIC(12,2) CHECK (reward_coupon_value > 0);
ALTER TABLE missions ADD COLUMN IF NOT EXISTS reward_coupon_min_spend NUMERIC(12,2);
ALTER TABLE missions ADD COLUMN IF NOT EXISTS reward_coupon_days INTEGER CHECK (reward_coupon_days BETWEEN 1 AND 365);
ALTER TABLE missions ADD COLUMN IF NOT EXISTS reward_shop_id UUID REFERENCES shops(shop_id);
ALTER TABLE missions DROP CONSTRAINT IF EXISTS missions_shape_check;
ALTER TABLE missions ADD CONSTRAINT missions_shape_check CHECK (
    (mission_type = 'SPEND_TOTAL' AND target_amount IS NOT NULL OR mission_type <> 'SPEND_TOTAL' AND target_count IS NOT NULL)
    AND (mission_type <> 'NEW_SHOPS' OR shop_id IS NULL)
    AND (reward_type = 'COINS' AND reward_coins IS NOT NULL
      OR reward_type = 'SHOP_COUPON' AND reward_coupon_value IS NOT NULL AND reward_shop_id IS NOT NULL
         AND reward_coupon_days IS NOT NULL AND reward_coupon_min_spend >= reward_coupon_value)
);

-- 3) คูปองจากภารกิจ: ไม่ใช้เหรียญแลก ใช้ได้เฉพาะร้านที่กำหนด และถูกยกเลิกถ้ารายการที่ทำให้ภารกิจสำเร็จถูกคืนเงิน
ALTER TABLE coupons DROP CONSTRAINT IF EXISTS coupons_coin_cost_check;
ALTER TABLE coupons ADD CONSTRAINT coupons_coin_cost_check CHECK (coin_cost >= 0);
ALTER TABLE coupons DROP CONSTRAINT IF EXISTS coupons_status_check;
ALTER TABLE coupons ADD CONSTRAINT coupons_status_check CHECK (status IN ('ACTIVE', 'USED', 'REVOKED'));
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS shop_id UUID REFERENCES shops(shop_id);
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS enrollment_id UUID REFERENCES mission_enrollments(enrollment_id) ON DELETE SET NULL;

-- ภารกิจตัวอย่างสำหรับ demo (เพิ่มเฉพาะครั้งแรก)
INSERT INTO missions (mission_type, title, description, target_count, window_days, reward_type, reward_coins)
SELECT 'ORDER_COUNT', 'ใช้สิทธิ์ครบ 5 ครั้ง', 'จ่ายเงินที่ร้านใดก็ได้ให้ครบ 5 ครั้งภายใน 14 วัน', 5, 14, 'COINS', 30
WHERE NOT EXISTS (SELECT 1 FROM missions WHERE mission_type = 'ORDER_COUNT');

INSERT INTO missions (mission_type, title, description, target_amount, window_days, reward_type, reward_coins)
SELECT 'SPEND_TOTAL', 'ใช้จ่ายครบ 1,000 บาท', 'ใช้จ่ายรวมครบ 1,000 บาทภายใน 30 วัน รับเหรียญพิเศษ', 1000, 30, 'COINS', 80
WHERE NOT EXISTS (SELECT 1 FROM missions WHERE mission_type = 'SPEND_TOTAL');

INSERT INTO missions (mission_type, title, description, target_count, shop_id, window_days, reward_type,
    reward_coupon_value, reward_coupon_min_spend, reward_coupon_days, reward_shop_id)
SELECT 'ORDER_COUNT', 'ขาประจำร้านกาแฟบ้านสวน', 'ซื้อที่ร้านกาแฟบ้านสวนครบ 3 ครั้งใน 21 วัน รับคูปองลด 30 บาทใช้ที่ร้านนี้',
    3, s.shop_id, 21, 'SHOP_COUPON', 30, 100, 30, s.shop_id
FROM shops s
WHERE s.name = 'ร้านกาแฟบ้านสวน'
  AND NOT EXISTS (SELECT 1 FROM missions WHERE reward_type = 'SHOP_COUPON');
