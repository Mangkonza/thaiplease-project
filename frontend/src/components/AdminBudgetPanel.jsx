import { useEffect, useState } from 'react';
import api, { getErrorMessage } from '../api';
import { formatBaht, formatNumber } from '../utils/format';

const COIN_REASON_TEXT = {
  PAYMENT_REWARD: 'สะสมจากการชำระ', CAMPAIGN_BONUS: 'โบนัสแคมเปญ', MISSION_REWARD: 'รางวัลภารกิจ',
  COUPON_REDEEM: 'แลกคูปอง', REFUND_REVERSAL: 'หักคืนจากการคืนเงิน',
};

function Metric({ label, value, note }) {
  return <div className="metric-card"><span className="muted">{label}</span><strong>{value}</strong>{note && <small className="muted">{note}</small>}</div>;
}

// Dashboard งบโครงการ (D-17) และบันทึกการโอนเงินให้ร้าน (D-14)
export default function AdminBudgetPanel() {
  const [budget, setBudget] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/admin/budget')
      .then(({ data }) => setBudget(data))
      .catch((requestError) => setError(getErrorMessage(requestError)));
  }, []);

  async function payout(shop) {
    const note = window.prompt(`บันทึกว่าโอน ${formatBaht(shop.pending)} ให้ "${shop.name}" แล้ว\nหมายเหตุ (เช่น เลขที่รายการโอน) เว้นว่างได้`);
    if (note === null) return;
    setBusy(true);
    setError('');
    try {
      await api.post(`/admin/shops/${shop.shop_id}/payouts`, { note });
      const { data } = await api.get('/admin/budget');
      setBudget(data);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  if (!budget) return error ? <p className="notice notice-error" role="alert">{error}</p> : <p className="empty-note">กำลังโหลด…</p>;
  const { payments, coins, coupons, transfers, shops, policy } = budget;
  return (
    <div className="content-stack">
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      <section className="card"><div className="section-heading compact"><h2>งบรัฐช่วยจ่ายและคูปอง</h2>{policy && <span className="muted">นโยบายเวอร์ชัน {policy.policy_version} · รัฐช่วย {policy.copay_percent}%</span>}</div>
        <div className="metric-grid">
          <Metric label="รัฐช่วยจ่ายแล้ว" value={formatBaht(payments.government_subsidy)} note={`ประชาชน ${formatNumber(payments.subsidized_citizens)} คน`} />
          <Metric label="คูปองที่ถูกใช้" value={formatBaht(payments.coupon_discount)} note="งบแยกจากเพดานรัฐช่วยจ่าย" />
          <Metric label="ยอดซื้อรวม" value={formatBaht(payments.gross_amount)} note={`${formatNumber(payments.payments)} รายการ · ประชาชนจ่าย ${formatBaht(payments.citizen_paid)}`} />
          <Metric label="คืนเงินแล้ว" value={formatBaht(payments.refunded_amount)} note={`${formatNumber(payments.refunded_payments)} รายการ`} />
        </div>
      </section>
      <div className="two-column">
        <section className="card"><div className="section-heading compact"><h2>เหรียญ</h2><span className="muted">คงค้างในระบบ {formatNumber(coins.outstanding)} เหรียญ</span></div>
          <div className="list-rows">{coins.by_reason.map((row) => <div className="list-row" key={row.reason}><div><strong>{COIN_REASON_TEXT[row.reason] || row.reason}</strong><small>{formatNumber(row.entries)} รายการ</small></div><b className={row.amount >= 0 ? 'amount-positive' : 'amount-negative'}>{row.amount > 0 ? '+' : ''}{formatNumber(row.amount)}</b></div>)}</div>
        </section>
        <section className="card"><div className="section-heading compact"><h2>คูปอง</h2><span className="muted">ออกแล้ว {formatNumber(coupons.issued)} ใบ</span></div>
          <div className="list-rows">
            <div className="list-row"><div><strong>มูลค่าที่ออก</strong><small>ใช้เหรียญแลก {formatNumber(coupons.coins_spent)} เหรียญ</small></div><b>{formatBaht(coupons.issued_value)}</b></div>
            <div className="list-row"><div><strong>ใช้แล้ว</strong><small>{formatNumber(coupons.used)} ใบ</small></div><b>{formatBaht(coupons.used_value)}</b></div>
            <div className="list-row"><div><strong>ยังใช้ได้ (ภาระผูกพัน)</strong><small>{formatNumber(coupons.active)} ใบ · หมดอายุแล้ว {formatNumber(coupons.expired)} ใบ</small></div><b>{formatBaht(coupons.active_value)}</b></div>
          </div>
        </section>
      </div>
      <section className="card"><div className="section-heading compact"><div><h2>ยอดโอนให้ร้าน</h2><span className="muted">รัฐช่วยจ่าย + คูปอง ของรายการที่สำเร็จ หักยอดที่บันทึกว่าโอนแล้ว</span></div><span className="muted">รอโอน {formatBaht(transfers.pending)} จาก {formatBaht(transfers.owed)}</span></div>
        {shops.length ? <div className="table-wrap"><table><thead><tr><th>ร้าน</th><th>รายการ</th><th>รัฐช่วยจ่าย</th><th>คูปอง</th><th>โอนแล้ว</th><th>รอโอน</th><th></th></tr></thead><tbody>{shops.map((shop) => <tr key={shop.shop_id}>
          <td>{shop.name}</td><td>{formatNumber(shop.payments)}</td><td>{formatBaht(shop.government_subsidy)}</td><td>{formatBaht(shop.coupon_discount)}</td><td>{formatBaht(shop.paid_out)}</td><td><b>{formatBaht(shop.pending)}</b></td>
          <td>{shop.pending > 0 && <button className="button button-outline button-small" disabled={busy} onClick={() => payout(shop)}>บันทึกการโอน</button>}</td>
        </tr>)}</tbody></table></div> : <p className="empty-note">ยังไม่มียอดที่ต้องโอน</p>}
      </section>
    </div>
  );
}
