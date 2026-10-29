import { useEffect, useState } from 'react';
import api, { getErrorMessage } from '../api';
import { formatBaht } from '../utils/format';

// ยอดรอรับจากโครงการ (D-14): รัฐช่วยจ่ายและคูปองเป็นเงินที่โครงการโอนให้ร้านภายหลัง
export default function ShopProgramBalancePanel({ shopId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/shops/${shopId}/program-balance`)
      .then((response) => setData(response.data))
      .catch((requestError) => setError(getErrorMessage(requestError)));
  }, [shopId]);

  if (error) return <p className="notice notice-error" role="alert">{error}</p>;
  if (!data) return null;
  const { balance, payouts } = data;
  return (
    <section className="card">
      <div className="section-heading compact"><div><h2>ยอดรอรับจากโครงการ</h2><span className="muted">ส่วนที่รัฐช่วยจ่ายและคูปอง โครงการจะโอนให้ร้าน ส่วนที่ประชาชนจ่ายร้านได้รับทันที</span></div></div>
      <div className="metric-grid">
        <div className="metric-card"><span className="muted">รอรับ</span><strong>{formatBaht(balance.pending)}</strong>{balance.pending < 0 && <small className="muted">ติดลบเพราะมีการคืนเงินหลังโอนแล้ว</small>}</div>
        <div className="metric-card"><span className="muted">โครงการต้องจ่ายทั้งหมด</span><strong>{formatBaht(balance.owed)}</strong><small className="muted">รัฐ {formatBaht(balance.government_subsidy)} · คูปอง {formatBaht(balance.coupon_discount)}</small></div>
        <div className="metric-card"><span className="muted">โอนแล้ว</span><strong>{formatBaht(balance.paid_out)}</strong><small className="muted">{balance.last_payout_at ? `ล่าสุด ${new Date(balance.last_payout_at).toLocaleDateString('th-TH')}` : 'ยังไม่มีการโอน'}</small></div>
        <div className="metric-card"><span className="muted">ประชาชนจ่ายตรง</span><strong>{formatBaht(balance.citizen_paid)}</strong><small className="muted">{balance.payments} รายการ</small></div>
      </div>
      {payouts.length > 0 && <div className="list-rows">{payouts.map((payout) => <div className="list-row" key={payout.payout_id}><div><strong>โอนแล้ว</strong><small>{new Date(payout.created_at).toLocaleString('th-TH')}{payout.note ? ` · ${payout.note}` : ''}</small></div><b className="amount-positive">{formatBaht(payout.amount)}</b></div>)}</div>}
    </section>
  );
}
