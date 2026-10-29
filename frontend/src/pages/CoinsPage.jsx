import { useEffect, useState } from 'react';
import api, { getErrorMessage } from '../api';
import { formatBaht } from '../utils/format';

export default function CoinsPage() {
  const [balance, setBalance] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [payments, setPayments] = useState([]);
  const [subsidy, setSubsidy] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api.get('/users/me/coins'),
      api.get('/users/me/coin-transactions'),
      api.get('/users/me/payments'),
      api.get('/users/me/subsidy'),
    ]).then(([coins, ledger, history, rights]) => {
      setBalance(coins.data.balance);
      setTransactions(ledger.data.transactions);
      setPayments(history.data.payments);
      setSubsidy(rights.data);
    }).catch((requestError) => setError(getErrorMessage(requestError)));
  }, []);

  return (
    <div className="content-stack">
      <div className="section-heading"><div><span className="eyebrow">YOUR REWARDS</span><h1>เหรียญของฉัน</h1><p className="muted">สะสมเหรียญจากทุกการสนับสนุนร้านค้าในชุมชน</p></div></div>
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      <section className="coin-balance"><span className="coin-orbit">✳</span><span className="eyebrow">AVAILABLE BALANCE</span><strong>{balance === null ? '—' : balance.toLocaleString()}</strong><span>COINS</span><p>ยอดซื้อหลังส่วนลดร้านทุก {subsidy ? subsidy.policy.baht_per_coin : 25} บาท รับ 1 coin</p></section>
      {subsidy && <section className="card"><div className="section-heading compact"><h2>สิทธิ์รัฐช่วยจ่าย {subsidy.policy.copay_percent}%</h2><span className="muted">ใช้ไปแล้วทั้งหมด {formatBaht(subsidy.used.total)}</span></div>
        <div className="metric-grid"><div className="metric-card"><span className="muted">คงเหลือวันนี้</span><strong>{formatBaht(subsidy.remaining.today)}</strong><small className="muted">เพดาน {formatBaht(subsidy.policy.daily_cap)}/วัน</small></div><div className="metric-card"><span className="muted">คงเหลือเดือนนี้</span><strong>{formatBaht(subsidy.remaining.month)}</strong><small className="muted">เพดาน {formatBaht(subsidy.policy.monthly_cap)}/เดือน</small></div><div className="metric-card"><span className="muted">คงเหลือทั้งโครงการ</span><strong>{formatBaht(subsidy.remaining.total)}</strong><small className="muted">เพดาน {formatBaht(subsidy.policy.lifetime_cap)}</small></div><div className="metric-card"><span className="muted">ช่วงโครงการ</span><strong>{new Date(`${subsidy.policy.program_end}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}</strong><small className="muted">วันสุดท้ายที่ใช้สิทธิ์ได้</small></div></div>
      </section>}
      <div className="two-column">
        <section className="card"><div className="section-heading compact"><h2>ประวัติเหรียญ</h2><span className="muted">{transactions.length} รายการ</span></div>
          {transactions.length ? <div className="list-rows">{transactions.map((entry) => <div className="list-row" key={entry.ledger_id}><div><strong>{entry.reason === 'CAMPAIGN_BONUS' ? 'โบนัสแคมเปญ' : entry.reason === 'REFUND_REVERSAL' ? 'คืนเหรียญ' : 'สะสมจากการชำระ'}</strong><small>{new Date(entry.created_at).toLocaleString('th-TH')}</small></div><b className={entry.amount >= 0 ? 'amount-positive' : 'amount-negative'}>{entry.amount > 0 ? '+' : ''}{entry.amount}</b></div>)}</div> : <p className="empty-note">ยังไม่มีรายการเหรียญ</p>}
        </section>
        <section className="card"><div className="section-heading compact"><h2>ประวัติการชำระ</h2><span className="muted">{payments.length} รายการ</span></div>
          {payments.length ? <div className="list-rows">{payments.map((payment) => <div className="list-row" key={payment.payment_id}><div><strong>{payment.shop_name}</strong><small>{new Date(payment.created_at).toLocaleString('th-TH')}</small></div><span><b>{formatBaht(payment.citizen_paid)}</b>{Number(payment.government_subsidy) > 0 && <small className="muted"> รัฐช่วย {formatBaht(payment.government_subsidy)}</small>}</span></div>)}</div> : <p className="empty-note">ยังไม่มีรายการชำระเงิน</p>}
        </section>
      </div>
    </div>
  );
}
