-- 1. เปิด Extension สำหรับ UUID
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. สร้าง Custom ENUMs ทั้งหมดตามที่ระบุใน SRS
CREATE TYPE user_role AS ENUM ('CITIZEN', 'MERCHANT', 'ADMIN');
CREATE TYPE user_status AS ENUM ('ACTIVE', 'SUSPENDED');
CREATE TYPE shop_status AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED');
CREATE TYPE payment_status AS ENUM ('PENDING', 'SUCCESS', 'REFUNDED', 'FAILED');
CREATE TYPE period_type AS ENUM ('WEEK', 'MONTH');
CREATE TYPE suggestion_status AS ENUM ('PROPOSED', 'SELECTED', 'REJECTED');
CREATE TYPE campaign_status AS ENUM ('DRAFT', 'ACTIVE', 'ENDED', 'CANCELLED');
CREATE TYPE assignment_group AS ENUM ('TREATMENT', 'CONTROL');
CREATE TYPE result_status AS ENUM ('SUCCESS', 'INCONCLUSIVE', 'FAILED');

-- 3. ตาราง users (บัญชีผู้ใช้)
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(150),
    role user_role NOT NULL DEFAULT 'CITIZEN',
    status user_status NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. ตาราง shops (ร้านค้า)
CREATE TABLE shops (
    shop_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    category VARCHAR(100),
    area VARCHAR(150),
    description TEXT,
    status shop_status NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. ตาราง payments (การชำระเงินจำลอง มี request_key ป้องกันคำขอซ้ำ)
CREATE TABLE payments (
    payment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_key VARCHAR(100) UNIQUE NOT NULL,
    user_id UUID NOT NULL REFERENCES users(user_id),
    shop_id UUID NOT NULL REFERENCES shops(shop_id),
    gross_amount NUMERIC(12,2) NOT NULL CHECK (gross_amount >= 0),
    discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (discount_amount >= 0),
    net_amount NUMERIC(12,2) NOT NULL CHECK (net_amount >= 0),
    status payment_status NOT NULL DEFAULT 'PENDING',
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 6. ตาราง coin_ledger (บัญชีบันทึกเหรียญแบบ Append-only)
CREATE TABLE coin_ledger (
    ledger_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    payment_id UUID REFERENCES payments(payment_id) ON DELETE SET NULL,
    amount INTEGER NOT NULL,
    reason VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 7. ตาราง shop_metrics (ตัวชี้วัดร้านค้ารายสัปดาห์/เดือน)
CREATE TABLE shop_metrics (
    metric_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES shops(shop_id) ON DELETE CASCADE,
    period_type period_type NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    revenue NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    orders INTEGER NOT NULL DEFAULT 0,
    unique_buyers INTEGER NOT NULL DEFAULT 0,
    new_customers INTEGER NOT NULL DEFAULT 0,
    repeat_customers INTEGER NOT NULL DEFAULT 0,
    aov NUMERIC(12,2),
    purchase_frequency NUMERIC(10,4),
    repeat_rate NUMERIC(10,4),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(shop_id, period_type, period_start, period_end)
);

-- 8. ตาราง promotion_templates (แม่แบบโปรโมชัน 10 รูปแบบ)
CREATE TABLE promotion_templates (
    template_id SMALLINT PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(120) NOT NULL,
    description TEXT,
    target_kpi VARCHAR(80) NOT NULL,
    parameter_schema JSONB NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 9. ตาราง ai_reports (รายงานผลการวิเคราะห์จาก AI)
CREATE TABLE ai_reports (
    report_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES shops(shop_id) ON DELETE CASCADE,
    period_type period_type NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    model_version VARCHAR(100) NOT NULL,
    summary TEXT NOT NULL,
    problem_summary TEXT NOT NULL,
    possible_causes JSONB NOT NULL,
    metrics_snapshot JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 10. ตาราง ai_suggestions (3 ข้อเสนอแนะโปรโมชันต่อ 1 รายงาน)
CREATE TABLE ai_suggestions (
    suggestion_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES ai_reports(report_id) ON DELETE CASCADE,
    template_id SMALLINT NOT NULL REFERENCES promotion_templates(template_id),
    rank SMALLINT NOT NULL CHECK (rank BETWEEN 1 AND 3),
    parameters JSONB NOT NULL,
    reason TEXT NOT NULL,
    target_kpi VARCHAR(80) NOT NULL,
    status suggestion_status NOT NULL DEFAULT 'PROPOSED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 11. ตาราง campaigns (แคมเปญที่สร้างจากข้อเสนอที่เลือก)
CREATE TABLE campaigns (
    campaign_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES shops(shop_id) ON DELETE CASCADE,
    suggestion_id UUID REFERENCES ai_suggestions(suggestion_id) ON DELETE SET NULL,
    template_id SMALLINT NOT NULL REFERENCES promotion_templates(template_id),
    name VARCHAR(150) NOT NULL,
    parameters JSONB NOT NULL,
    target_kpi VARCHAR(80) NOT NULL,
    treatment_ratio NUMERIC(5,4) NOT NULL DEFAULT 0.5000 CHECK (treatment_ratio BETWEEN 0 AND 1),
    start_at TIMESTAMPTZ NOT NULL,
    end_at TIMESTAMPTZ NOT NULL,
    status campaign_status NOT NULL DEFAULT 'DRAFT',
    activated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 12. ตาราง campaign_assignments (การแบ่งกลุ่ม Treatment / Control)
CREATE TABLE campaign_assignments (
    assignment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    group_type assignment_group NOT NULL,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(campaign_id, user_id)
);

-- 13. ตาราง promotion_redemptions (บันทึกการใช้สิทธิ์โปรโมชันจริง)
CREATE TABLE promotion_redemptions (
    redemption_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    payment_id UUID NOT NULL REFERENCES payments(payment_id) ON DELETE CASCADE,
    benefit_value NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (benefit_value >= 0),
    redeemed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 14. ตาราง campaign_results (สรุปผลลัพธ์ Uplift และ KPI ของแคมเปญ)
CREATE TABLE campaign_results (
    result_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID UNIQUE NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
    baseline_metric NUMERIC(14,4),
    treatment_metric NUMERIC(14,4),
    control_metric NUMERIC(14,4),
    uplift NUMERIC(14,4),
    sample_size INTEGER NOT NULL DEFAULT 0,
    treatment_size INTEGER NOT NULL DEFAULT 0,
    control_size INTEGER NOT NULL DEFAULT 0,
    redemption_count INTEGER NOT NULL DEFAULT 0,
    result_status result_status NOT NULL,
    explanation TEXT,
    evaluated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 15. ตาราง audit_logs (บันทึกการกระทำสำคัญในระบบ)
CREATE TABLE audit_logs (
    audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID,
    detail JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- -------------------------------------------------------------
-- SEED DATA: แม่แบบโปรโมชัน 10 รูปแบบ (Promotion Templates)
-- -------------------------------------------------------------
INSERT INTO promotion_templates (template_id, code, name, description, target_kpi, parameter_schema) VALUES
(1, 'PERCENT_DISCOUNT', 'ส่วนลดเปอร์เซ็นต์', 'ลดเปอร์เซ็นต์เมื่อถึงยอดขั้นต่ำ', 'Conversion, Revenue', 
 '{"type": "object", "properties": {"discount_percent": {"type": "number", "minimum": 1, "maximum": 100}, "min_spend": {"type": "number", "minimum": 0}}, "required": ["discount_percent", "min_spend"]}'),

(2, 'FIXED_DISCOUNT', 'ส่วนลดจำนวนเงินคงที่', 'ลดเงินคงที่เมื่อถึงยอดขั้นต่ำ', 'Conversion, Orders', 
 '{"type": "object", "properties": {"discount_amount": {"type": "number", "minimum": 1}, "min_spend": {"type": "number", "minimum": 0}}, "required": ["discount_amount", "min_spend"]}'),

(3, 'BONUS_COIN', 'รับเหรียญพิเศษ', 'ครบยอดแล้วรับ Coin เพิ่ม', 'Repeat Rate', 
 '{"type": "object", "properties": {"bonus_coin": {"type": "integer", "minimum": 1}, "min_spend": {"type": "number", "minimum": 0}}, "required": ["bonus_coin", "min_spend"]}'),

(4, 'COIN_MULTIPLIER', 'ตัวคูณเหรียญสะสม', 'รับ Coin xN ในช่วง Campaign', 'Repeat Rate, Frequency', 
 '{"type": "object", "properties": {"multiplier": {"type": "number", "minimum": 1.1, "maximum": 10.0}}, "required": ["multiplier"]}'),

(5, 'MIN_SPEND_REWARD', 'รางวัลยอดซื้อขั้นต่ำ', 'ครบยอดแล้วรับ Reward หรือส่วนลดพิเศษ', 'AOV', 
 '{"type": "object", "properties": {"min_spend": {"type": "number", "minimum": 1}, "reward_value": {"type": "number", "minimum": 1}}, "required": ["min_spend", "reward_value"]}'),

(6, 'COMEBACK_REWARD', 'โปรโมชันดึงลูกค้าเก่า', 'กลับมาซื้อเมื่อหายไปอย่างน้อย N วัน', 'Reactivation Rate', 
 '{"type": "object", "properties": {"inactive_days": {"type": "integer", "minimum": 7}, "discount_amount": {"type": "number", "minimum": 1}}, "required": ["inactive_days", "discount_amount"]}'),

(7, 'FREQUENCY_REWARD', 'รางวัลตามความถี่การซื้อ', 'ซื้อครบ N ครั้งรับ Reward', 'Purchase Frequency', 
 '{"type": "object", "properties": {"required_orders": {"type": "integer", "minimum": 2}, "reward_coins": {"type": "integer", "minimum": 1}}, "required": ["required_orders", "reward_coins"]}'),

(8, 'TIME_BASED', 'โปรโมชันตามช่วงเวลา', 'สิทธิ์ช่วงเวลายอดขายตก (เช่น Happy Hour)', 'Revenue by Time', 
 '{"type": "object", "properties": {"start_time": {"type": "string"}, "end_time": {"type": "string"}, "discount_percent": {"type": "number"}}, "required": ["start_time", "end_time", "discount_percent"]}'),

(9, 'DAY_BASED', 'โปรโมชันตามวัน', 'สิทธิ์เฉพาะวันยอดขายตก (เช่น วันจันทร์-อังคาร)', 'Revenue by Day', 
 '{"type": "object", "properties": {"target_days": {"type": "array", "items": {"type": "string"}}, "discount_percent": {"type": "number"}}, "required": ["target_days", "discount_percent"]}'),

(10, 'NEW_CUSTOMER', 'โปรโมชันลูกค้าใหม่', 'สิทธิ์สำหรับการซื้อครั้งแรกของร้านค้า', 'New Customer Conversion', 
 '{"type": "object", "properties": {"discount_percent": {"type": "number", "minimum": 1, "maximum": 100}, "max_discount": {"type": "number"}}, "required": ["discount_percent"]}');