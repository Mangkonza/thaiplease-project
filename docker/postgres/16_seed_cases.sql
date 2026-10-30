-- ข้อมูล demo เท่านั้น: คำร้อง (คืนเงิน/ร้องเรียน) ให้หน้าคำร้องของร้านและ Admin มีข้อมูลให้ดู
-- ใส่เฉพาะสถานะที่ไม่ต้องย้อนเงิน (PENDING, REJECTED, RESOLVED) คำขอที่อนุมัติคืนเงินต้องคืนกระเป๋า เหรียญ และคูปอง
-- ให้ทำผ่านระบบจริงตอน demo แทน วันที่ยื่นนับจากวันที่จ่ายเงิน จึงได้ผลเหมือนเดิมทุกครั้ง รันซ้ำได้ (กันซ้ำด้วยข้อความ reason)
WITH picks (shop_id, nth, case_type, status, reason, filed_after, decision_note) AS (
    VALUES
    -- รอร้านตัดสิน
    ('b0000000-0000-4000-8000-000000000001'::uuid, 1, 'REFUND', 'PENDING', 'สั่งลาเต้เย็นแต่ได้ร้อน ร้านแจ้งว่าทำใหม่ไม่ได้ ขอคืนเงิน', INTERVAL '2 hours', NULL),
    ('b0000000-0000-4000-8000-000000000001'::uuid, 3, 'REFUND', 'PENDING', 'ถูกคิดเงินซ้ำ 2 รอบในบิลเดียวกัน ขอคืนรายการนี้', INTERVAL '30 minutes', NULL),
    ('b0000000-0000-4000-8000-000000000002'::uuid, 2, 'REFUND', 'PENDING', 'ข้าวมันไก่หมดก่อนได้ของ แต่ตัดเงินไปแล้ว', INTERVAL '1 hour', NULL),
    ('b0000000-0000-4000-8000-000000000010'::uuid, 1, 'REFUND', 'PENDING', 'ร้านปิดก่อนเวลา จ่ายเงินแล้วแต่ไม่ได้รับเครื่องดื่ม', INTERVAL '3 hours', NULL),
    ('b0000000-0000-4000-8000-000000000005'::uuid, 2, 'REFUND', 'PENDING', 'สแกนผิดร้าน ตั้งใจจ่ายร้านข้าง ๆ', INTERVAL '20 minutes', NULL),
    -- ร้านปฏิเสธแล้ว
    ('b0000000-0000-4000-8000-000000000001'::uuid, 6, 'REFUND', 'REJECTED', 'กาแฟไม่อร่อย ขอคืนเงิน', INTERVAL '5 hours', 'ลูกค้าดื่มหมดแก้วแล้ว ร้านยินดีทำแก้วใหม่ให้ครั้งหน้าแทนการคืนเงิน'),
    ('b0000000-0000-4000-8000-000000000009'::uuid, 3, 'REFUND', 'REJECTED', 'ได้กับข้าวไม่ครบตามสั่ง', INTERVAL '4 hours', 'ตรวจกล้องแล้วลูกค้าได้รับครบ 2 อย่างตามบิล'),
    -- ร้องเรียนรอ Admin
    ('b0000000-0000-4000-8000-000000000007'::uuid, 1, 'COMPLAINT', 'PENDING', 'ร้านขอเก็บเงินสดเพิ่ม 10 บาท นอกเหนือจากยอดในแอป', INTERVAL '1 hour', NULL),
    ('b0000000-0000-4000-8000-000000000011'::uuid, 1, 'COMPLAINT', 'PENDING', 'ร้านตั้งราคาสินค้าสูงกว่าป้ายเมื่อจ่ายผ่านโครงการ', INTERVAL '6 hours', NULL),
    ('b0000000-0000-4000-8000-000000000006'::uuid, 1, 'COMPLAINT', 'PENDING', 'พนักงานพูดจาไม่สุภาพเมื่อแจ้งว่าจะจ่ายผ่านสิทธิ์', INTERVAL '2 hours', NULL),
    -- ร้องเรียนที่ Admin ปิดแล้ว
    ('b0000000-0000-4000-8000-000000000012'::uuid, 2, 'COMPLAINT', 'RESOLVED', 'ร้านไม่รับจ่ายผ่านโครงการช่วงเย็น', INTERVAL '1 day', 'ติดต่อร้านแล้ว ร้านแจ้งว่าเครื่องมีปัญหาชั่วคราว ได้ตักเตือนให้รับสิทธิ์ตลอดเวลาเปิด'),
    ('b0000000-0000-4000-8000-000000000008'::uuid, 1, 'COMPLAINT', 'RESOLVED', 'ใบเสร็จไม่ตรงกับยอดที่จ่าย', INTERVAL '8 hours', 'ตรวจสอบแล้วยอดในระบบถูกต้อง ใบเสร็จกระดาษของร้านพิมพ์ผิด ร้านแก้ไขแล้ว')
),
-- รายการจ่ายสำเร็จของประชาชนใน seed เรียงจากล่าสุด (ไม่รวมรายการที่ทดสอบหลังวันสุดท้ายของ seed)
ranked AS (
    SELECT p.payment_id, p.user_id, p.shop_id, p.paid_at,
           row_number() OVER (PARTITION BY p.shop_id ORDER BY p.paid_at DESC, p.payment_id) AS nth
    FROM payments p JOIN users u ON u.user_id = p.user_id
    WHERE p.status = 'SUCCESS' AND p.government_subsidy > 0
      AND u.email LIKE 'citizen%@thaiplease.test'
      AND p.paid_at < TIMESTAMPTZ '2026-10-26 00:00+07'
)
INSERT INTO case_requests (case_type, user_id, payment_id, shop_id, reason, status, decided_by, decided_at, decision_note, created_at)
SELECT k.case_type, r.user_id, r.payment_id, r.shop_id, k.reason, k.status,
       CASE WHEN k.status = 'PENDING' THEN NULL
            WHEN k.case_type = 'REFUND' THEN s.owner_id
            ELSE (SELECT user_id FROM users WHERE email = 'admin@thaiplease.test') END,
       CASE WHEN k.status = 'PENDING' THEN NULL ELSE r.paid_at + k.filed_after + INTERVAL '1 day' END,
       k.decision_note,
       r.paid_at + k.filed_after
FROM picks k
JOIN ranked r ON r.shop_id = k.shop_id AND r.nth = k.nth
JOIN shops s ON s.shop_id = k.shop_id
WHERE NOT EXISTS (SELECT 1 FROM case_requests c WHERE c.reason = k.reason);
