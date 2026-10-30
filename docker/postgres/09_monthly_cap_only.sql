-- เพดานรัฐช่วยจ่ายแบบโครงการจริง: วันละ 200 บาท เดือนละ 1,000 บาท ไม่มีเพดานรวมทั้งโครงการ
-- lifetime_cap เป็น NULL = ไม่มีเพดานรวม (CHECK เดิมผ่านเองเมื่อเป็น NULL) รันซ้ำได้

ALTER TABLE project_policies ALTER COLUMN lifetime_cap DROP NOT NULL;

-- นโยบายแก้ไม่ได้ จึงสร้างเวอร์ชันใหม่จากเวอร์ชันล่าสุด เฉพาะเมื่อเวอร์ชันล่าสุดยังมีเพดานรวมอยู่
INSERT INTO project_policies (copay_percent, daily_cap, monthly_cap, lifetime_cap, baht_per_coin,
    coupon_coin_cost, coupon_value, coupon_min_spend, coupon_valid_days, program_start, program_end, note)
SELECT copay_percent, 200, 1000, NULL, baht_per_coin, coupon_coin_cost, coupon_value, coupon_min_spend,
    coupon_valid_days, program_start, program_end,
    'ตามโครงการจริง: วันละ 200 บาท เดือนละ 1,000 บาท ไม่มีเพดานรวม วงเงินที่เหลือไม่ทบเดือน'
FROM project_policies
WHERE policy_version = (SELECT MAX(policy_version) FROM project_policies)
  AND lifetime_cap IS NOT NULL;
