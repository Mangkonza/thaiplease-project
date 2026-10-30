-- ข้อมูล demo เท่านั้น: seed.sql ไม่ได้ใส่ created_at ของผู้ใช้และร้าน ทุกบัญชีจึงสมัครวันเดียวกับที่สร้าง DB
-- ทำให้กราฟผู้เข้าร่วมโครงการใน Dashboard Admin เป็นเส้นแบน ไฟล์นี้ย้อนวันสมัครของบัญชี @thaiplease.test
-- ให้อยู่ก่อนการซื้อครั้งแรก คำนวณจากข้อมูลเดิมแบบตายตัว รันซ้ำได้ผลเท่าเดิม และไม่แตะบัญชีจริง

-- ร้าน: เข้าร่วมก่อนยอดขายแรก 3 วัน ร้านที่ยังไม่มียอดขายเข้าร่วมกลางเดือนตุลาคม
UPDATE shops s SET created_at = (COALESCE(
        (SELECT (min(p.paid_at) AT TIME ZONE 'Asia/Bangkok')::date - 3 FROM payments p WHERE p.shop_id = s.shop_id),
        DATE '2026-10-15'
    ) + TIME '10:00') AT TIME ZONE 'Asia/Bangkok'
FROM users u
WHERE u.user_id = s.owner_id AND u.email LIKE '%@thaiplease.test';

-- เจ้าของร้าน: สมัครก่อนร้านแรกของตัวเอง 1 วัน
UPDATE users u SET created_at = (SELECT min(s.created_at) FROM shops s WHERE s.owner_id = u.user_id) - INTERVAL '1 day'
WHERE u.role = 'MERCHANT' AND u.email LIKE '%@thaiplease.test'
  AND EXISTS (SELECT 1 FROM shops s WHERE s.owner_id = u.user_id);

-- ประชาชน: สมัครก่อนซื้อครั้งแรก 0–6 วัน (ตามเลขบัญชี) คนที่ยังไม่เคยซื้อกระจายตั้งแต่ปลายสิงหาคม
UPDATE users u SET created_at = LEAST(((
        COALESCE(
            (SELECT (min(p.paid_at) AT TIME ZONE 'Asia/Bangkok')::date FROM payments p WHERE p.user_id = u.user_id),
            DATE '2026-08-24' + (COALESCE(NULLIF(regexp_replace(u.email, '\D', '', 'g'), ''), '0')::integer * 7 % 60)
        ) - (COALESCE(NULLIF(regexp_replace(u.email, '\D', '', 'g'), ''), '0')::integer % 7)
    ) + TIME '09:00') AT TIME ZONE 'Asia/Bangkok',
    (SELECT min(p.paid_at) - INTERVAL '1 hour' FROM payments p WHERE p.user_id = u.user_id))
WHERE u.role = 'CITIZEN' AND u.email LIKE '%@thaiplease.test';

UPDATE users SET created_at = TIMESTAMPTZ '2026-08-01 09:00+07'
WHERE role = 'ADMIN' AND email LIKE '%@thaiplease.test';
