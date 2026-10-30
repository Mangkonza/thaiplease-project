-- 1) เลิกใช้การอนุมัติแคมเปญแจกเหรียญทีละแคมเปญ Admin คุมผ่านแม่แบบแคมเปญแทน (11_templates_missions.sql)
ALTER TABLE campaigns DROP COLUMN IF EXISTS coin_approval_status;
ALTER TABLE campaigns DROP COLUMN IF EXISTS coin_approval_note;
ALTER TABLE campaigns DROP COLUMN IF EXISTS coin_approved_by;
ALTER TABLE campaigns DROP COLUMN IF EXISTS coin_approved_at;

-- 2) งบประมาณรวมของโครงการ ใช้คำนวณงบคงเหลือ = งบรวม − (รัฐช่วยจ่าย + คูปอง ของรายการที่สำเร็จ)
--    NULL = ยังไม่ได้ตั้งงบ เก็บในนโยบายเพื่อให้ Admin แก้ได้และมีประวัติเหมือนค่าอื่น
ALTER TABLE project_policies ADD COLUMN IF NOT EXISTS total_budget NUMERIC(14,2) CHECK (total_budget > 0);

-- นโยบายแก้ไม่ได้ จึงสร้างเวอร์ชันใหม่ที่มีงบรวมสำหรับ demo 500,000 บาท (รันซ้ำแล้วไม่สร้างเพิ่ม)
INSERT INTO project_policies (copay_percent, daily_cap, monthly_cap, lifetime_cap, baht_per_coin, coupon_coin_cost,
    coupon_value, coupon_min_spend, coupon_valid_days, program_start, program_end, total_budget, note)
SELECT copay_percent, daily_cap, monthly_cap, lifetime_cap, baht_per_coin, coupon_coin_cost,
    coupon_value, coupon_min_spend, coupon_valid_days, program_start, program_end, 500000,
    'ตั้งงบประมาณรวมของโครงการ 500,000 บาท'
FROM project_policies
WHERE policy_version = (SELECT MAX(policy_version) FROM project_policies)
  AND total_budget IS NULL;
