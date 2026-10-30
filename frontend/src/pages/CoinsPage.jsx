import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getErrorMessage } from '../api';
import { formatBaht } from '../utils/format';
import { CASE_STATUS, CASE_TYPE_TEXT, canComplain, canRequestRefund } from '../utils/cases';
import MissionsPanel from '../components/MissionsPanel';

const LEDGER_TEXT = { CAMPAIGN_BONUS: 'โบนัสแคมเปญ', REFUND_REVERSAL: 'คืนเหรียญ', COUPON_REDEEM: 'แลกคูปอง', MISSION_REWARD: 'รางวัลภารกิจ' };
const COUPON_STATUS = {
  ACTIVE: { text: 'ใช้ได้', className: 'status-active' },
  USED: { text: 'ใช้แล้ว', className: 'status-ended' },
  EXPIRED: { text: 'หมดอายุ', className: 'status-cancelled' },
  REVOKED: { text: 'ถูกยกเลิก', className: 'status-cancelled' },
};
const shortDate = (value) => new Date(value).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });

const fetchAll = () => Promise.all([
  api.get('/users/me/coins'),
  api.get('/users/me/coin-transactions'),
  api.get('/users/me/payments'),
  api.get('/users/me/subsidy'),
  api.get('/users/me/coupons'),
  api.get('/users/me/cases'),
]);

export default function CoinsPage() {
  const [balance, setBalance] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [payments, setPayments] = useState([]);
  const [subsidy, setSubsidy] = useState(null);
  const [coupons, setCoupons] = useState([]);
  const [cases, setCases] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  function apply([coins, ledger, history, rights, owned, requests]) {
    setBalance(coins.data.balance);
    setTransactions(ledger.data.transactions);
    setPayments(history.data.payments);
    setSubsidy(rights.data);
    setCoupons(owned.data.coupons);
    setCases(requests.data.cases);
  }

  useEffect(() => {
    fetchAll().then(apply).catch((requestError) => setError(getErrorMessage(requestError)));
  }, []);

  async function act(request, successText) {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await request();
      apply(await fetchAll());
      setNotice(successText);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  const redeem = () => act(() => api.post('/users/me/coupons'), 'แลกคูปองสำเร็จ');

  function openCase(payment, caseType) {
    const reason = window.prompt(`${CASE_TYPE_TEXT[caseType]}: ${payment.shop_name} ยอด ${formatBaht(payment.gross_amount)}
กรุณาระบุเหตุผล`);
    if (!reason?.trim()) return;
    act(
      () => api.post('/users/me/cases', { case_type: caseType, payment_id: payment.payment_id, reason }),
      caseType === 'REFUND' ? 'ส่งคำขอคืนเงินแล้ว ร้านจะพิจารณาภายใน 3 วัน' : 'ส่งเรื่องร้องเรียนถึงผู้ดูแลระบบแล้ว',
    );
  }

  const couponCost = subsidy ? subsidy.policy.coupon_coin_cost : null;

  return (
    <div className="content-stack">
      <div className="section-heading"><div><span className="eyebrow">YOUR REWARDS</span><h1>เหรียญของฉัน</h1><p className="muted">สะสมเหรียญจากทุกการสนับสนุนร้านค้าในชุมชน</p></div></div>
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      {notice && <p className="notice notice-success">{notice}</p>}
      <section className="coin-balance"><span className="coin-orbit">✳</span><span className="eyebrow">AVAILABLE BALANCE</span><strong>{balance === null ? '—' : balance.toLocaleString()}</strong><span>COINS</span><p>ยอดซื้อหลังส่วนลดร้านทุก {subsidy ? subsidy.policy.baht_per_coin : 25} บาท รับ 1 coin</p></section>
      {subsidy && <section className="card"><div className="section-heading compact"><h2>สิทธิ์รัฐช่วยจ่าย {subsidy.policy.copay_percent}%</h2><span className="muted">ใช้สิทธิ์ได้ถึง {new Date(`${subsidy.policy.program_end}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })} · วงเงินที่เหลือไม่ทบไปเดือนถัดไป</span></div>
        <div className="metric-grid metric-grid-two"><div className="metric-card"><span className="muted">คงเหลือวันนี้</span><strong>{formatBaht(subsidy.remaining.today)}</strong><small className="muted">ใช้ไป {formatBaht(subsidy.used.today)} จากเพดาน {formatBaht(subsidy.policy.daily_cap)}/วัน</small></div><div className="metric-card"><span className="muted">คงเหลือเดือนนี้</span><strong>{formatBaht(subsidy.remaining.month)}</strong><small className="muted">ใช้ไป {formatBaht(subsidy.used.month)} จากเพดาน {formatBaht(subsidy.policy.monthly_cap)}/เดือน</small></div></div>
      </section>}
      {subsidy && <section className="card"><div className="section-heading compact"><div><h2>คูปองของฉัน</h2><span className="muted">ใช้ {couponCost} เหรียญแลกคูปองลด {formatBaht(subsidy.policy.coupon_value)} เมื่อซื้อขั้นต่ำ {formatBaht(subsidy.policy.coupon_min_spend)} อายุ {subsidy.policy.coupon_valid_days} วัน ใช้ได้ 1 ใบต่อรายการ</span></div>
        <button className="button button-primary" onClick={redeem} disabled={busy || balance === null || balance < couponCost}>{`แลก ${couponCost} เหรียญ`}</button></div>
        {coupons.length ? <div className="list-rows">{coupons.map((coupon) => <div className="list-row" key={coupon.coupon_id}><div><strong>ลด {formatBaht(coupon.value)}{coupon.shop_name ? ` · ใช้ได้เฉพาะ${coupon.shop_name}` : ''}</strong><small>{coupon.coin_cost === 0 ? 'รางวัลภารกิจ · ' : ''}ขั้นต่ำ {formatBaht(coupon.min_spend)} · {coupon.status === 'USED' ? `ใช้เมื่อ ${shortDate(coupon.used_at)}` : `ใช้ได้ถึง ${shortDate(coupon.expires_at)}`}</small></div><span className={`status-badge ${COUPON_STATUS[coupon.status].className}`}>{COUPON_STATUS[coupon.status].text}</span></div>)}</div> : <p className="empty-note">ยังไม่มีคูปอง</p>}
      </section>}
      <MissionsPanel />
      <div className="two-column">
        <section className="card"><div className="section-heading compact"><h2>ประวัติเหรียญ</h2><span className="muted">{transactions.length} รายการ</span></div>
          {transactions.length ? <div className="list-rows">{transactions.map((entry) => <div className="list-row" key={entry.ledger_id}><div><strong>{LEDGER_TEXT[entry.reason] || 'สะสมจากการชำระ'}</strong><small>{new Date(entry.created_at).toLocaleString('th-TH')}</small></div><b className={entry.amount >= 0 ? 'amount-positive' : 'amount-negative'}>{entry.amount > 0 ? '+' : ''}{entry.amount}</b></div>)}</div> : <p className="empty-note">ยังไม่มีรายการเหรียญ</p>}
        </section>
        <section className="card"><div className="section-heading compact"><h2>ประวัติการชำระ</h2><span className="muted">{payments.length} รายการ</span></div>
          {payments.length ? <div className="list-rows">{payments.map((payment) => <div className="list-row" key={payment.payment_id}><div><strong>{payment.shop_name}</strong><small>{new Date(payment.created_at).toLocaleString('th-TH')}</small>
            {payment.status === 'REFUNDED' && <span className="status-badge status-ended">คืนเงินแล้ว</span>}
            <div className="button-row"><Link className="button button-quiet button-small" to={`/slips/${payment.payment_id}`}>ดูสลิป</Link>{canRequestRefund(payment, cases) && <button className="button button-outline button-small" disabled={busy} onClick={() => openCase(payment, 'REFUND')}>ขอคืนเงิน</button>}{canComplain(payment, cases) && <button className="button button-outline button-small" disabled={busy} onClick={() => openCase(payment, 'COMPLAINT')}>ร้องเรียน</button>}</div></div>
            {/* แสดงยอดซื้อเต็มเป็นหลัก ให้ตรงกับยอดในคำขอคืนเงินและสลิป */}
            <span className="amount-stack"><b>{formatBaht(payment.gross_amount)}</b><small className="muted">คุณจ่าย {formatBaht(payment.citizen_paid)}{Number(payment.government_subsidy) > 0 && ` · รัฐช่วย ${formatBaht(payment.government_subsidy)}`}</small></span></div>)}</div> : <p className="empty-note">ยังไม่มีรายการชำระเงิน</p>}
        </section>
      </div>
      <section className="card"><div className="section-heading compact"><h2>คำขอคืนเงินและเรื่องร้องเรียน</h2><span className="muted">{cases.length} เรื่อง</span></div>
        {cases.length ? <div className="list-rows">{cases.map((item) => <div className="list-row" key={item.case_id}><div><strong>{CASE_TYPE_TEXT[item.case_type]} · {item.shop_name} ({formatBaht(item.gross_amount)})</strong><small>{new Date(item.created_at).toLocaleString('th-TH')} · เหตุผล: {item.reason}</small>{item.decision_note && <small>ผลพิจารณา: {item.decision_note}</small>}</div><span className={`status-badge ${CASE_STATUS[item.status].className}`}>{CASE_STATUS[item.status].text}</span></div>)}</div> : <p className="empty-note">ยังไม่มีคำขอ</p>}
      </section>
    </div>
  );
}
