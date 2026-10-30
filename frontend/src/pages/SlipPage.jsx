import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import api, { getErrorMessage } from '../api';
import { formatBaht, subsidyStatusText } from '../utils/format';
import { missionCompletedText } from '../utils/missions';

const dateTime = (value) => new Date(value).toLocaleString('th-TH', { dateStyle: 'long', timeStyle: 'medium', timeZone: 'Asia/Bangkok' });

export default function SlipPage() {
  const { paymentId } = useParams();
  // ข้อมูลที่ได้ตอนจ่ายเสร็จ (มีเฉพาะเมื่อมาจากหน้าจ่ายเงิน ไม่ใช่เปิดจากประวัติ)
  const paid = useLocation().state;
  const [slip, setSlip] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/users/me/payments/${paymentId}`)
      .then(({ data }) => setSlip(data.slip))
      .catch((requestError) => setError(getErrorMessage(requestError)));
  }, [paymentId]);

  if (error) return <p className="notice notice-error" role="alert">{error}</p>;
  if (!slip) return <p className="muted">กำลังโหลดสลิป…</p>;

  const refunded = slip.status === 'REFUNDED';
  const note = paid?.justPaid && subsidyStatusText(paid.subsidy_status);
  return (
    <div className="content-stack narrow-page">
      <section className="card receipt-card slip-card">
        <div className={refunded ? 'success-mark refunded' : 'success-mark'}>{refunded ? '↺' : '✓'}</div>
        <span className="eyebrow">{refunded ? 'REFUNDED' : 'PAYMENT SLIP'}</span>
        <h1>{refunded ? 'รายการนี้คืนเงินแล้ว' : 'ชำระเงินสำเร็จ'}</h1>
        <p className="slip-amount">{formatBaht(slip.citizen_paid)}</p>
        <dl className="receipt-list">
          <div><dt>ร้านค้า</dt><dd>{slip.shop_name}</dd></div>
          <div><dt>วันเวลา</dt><dd>{dateTime(slip.paid_at)}</dd></div>
          {refunded && slip.refunded_at && <div><dt>คืนเงินเมื่อ</dt><dd>{dateTime(slip.refunded_at)}</dd></div>}
          <div><dt>เลขอ้างอิง</dt><dd className="slip-ref">{slip.payment_id}</dd></div>
        </dl>
        <dl className="receipt-list">
          <div><dt>ยอดซื้อ</dt><dd>{formatBaht(slip.gross_amount)}</dd></div>
          {Number(slip.campaign_discount) > 0 && <div><dt>ส่วนลดแคมเปญร้าน</dt><dd>−{formatBaht(slip.campaign_discount)}</dd></div>}
          {Number(slip.coupon_discount) > 0 && <div><dt>คูปอง</dt><dd>−{formatBaht(slip.coupon_discount)}</dd></div>}
          <div><dt>รัฐช่วยจ่าย</dt><dd>−{formatBaht(slip.government_subsidy)}</dd></div>
          <div className="receipt-total"><dt>จ่ายจากกระเป๋าเงิน</dt><dd>{formatBaht(slip.citizen_paid)}</dd></div>
          <div><dt>เหรียญที่ได้รับ</dt><dd>+{paid?.justPaid ? paid.coins_earned : slip.coins_earned} coin</dd></div>
          {paid?.justPaid && paid.wallet_balance !== undefined && <div><dt>ยอดเงินคงเหลือ</dt><dd>{formatBaht(paid.wallet_balance)}</dd></div>}
        </dl>
        {note && <p className="notice">{note}</p>}
        {paid?.missions_completed?.map((mission) => <p className="notice notice-success" key={mission.enrollment_id}>{missionCompletedText(mission)}</p>)}
        {paid?.campaign_benefit && <p className="notice notice-success">ใช้สิทธิ์แคมเปญของร้านแล้ว</p>}
        <p className="fine-print">สลิปจากระบบชำระเงินจำลอง ไม่ใช่หลักฐานการโอนเงินจริง</p>
        <div className="button-row no-print">
          <button className="button button-outline" type="button" onClick={() => window.print()}>บันทึกสลิป</button>
          <Link className="button button-primary" to="/scan">สแกนจ่ายอีกครั้ง</Link>
          <Link className="button button-quiet" to="/coins">ประวัติการชำระ</Link>
        </div>
      </section>
    </div>
  );
}
