import { useEffect, useState } from 'react';
import api, { getErrorMessage } from '../api';

export default function CoinsPage() {
  const [balance, setBalance] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [payments, setPayments] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api.get('/users/me/coins'),
      api.get('/users/me/coin-transactions'),
      api.get('/users/me/payments'),
    ]).then(([coins, ledger, history]) => {
      setBalance(coins.data.balance);
      setTransactions(ledger.data.transactions);
      setPayments(history.data.payments);
    }).catch((requestError) => setError(getErrorMessage(requestError)));
  }, []);

  return (
    <div className="content-stack">
      <div className="section-heading"><div><span className="eyebrow">YOUR REWARDS</span><h1>เหรียญของฉัน</h1><p className="muted">สะสมเหรียญจากทุกการสนับสนุนร้านค้าในชุมชน</p></div></div>
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      <section className="coin-balance"><span className="coin-orbit">✳</span><span className="eyebrow">AVAILABLE BALANCE</span><strong>{balance === null ? '—' : balance.toLocaleString()}</strong><span>COINS</span><p>ชำระสุทธิทุก 25 บาท รับ 1 coin</p></section>
      <div className="two-column">
        <section className="card"><div className="section-heading compact"><h2>ประวัติเหรียญ</h2><span className="muted">{transactions.length} รายการ</span></div>
          {transactions.length ? <div className="list-rows">{transactions.map((entry) => <div className="list-row" key={entry.ledger_id}><div><strong>{entry.reason === 'CAMPAIGN_BONUS' ? 'โบนัสแคมเปญ' : entry.reason === 'REFUND_REVERSAL' ? 'คืนเหรียญ' : 'สะสมจากการชำระ'}</strong><small>{new Date(entry.created_at).toLocaleString('th-TH')}</small></div><b className={entry.amount >= 0 ? 'amount-positive' : 'amount-negative'}>{entry.amount > 0 ? '+' : ''}{entry.amount}</b></div>)}</div> : <p className="empty-note">ยังไม่มีรายการเหรียญ</p>}
        </section>
        <section className="card"><div className="section-heading compact"><h2>ประวัติการชำระ</h2><span className="muted">{payments.length} รายการ</span></div>
          {payments.length ? <div className="list-rows">{payments.map((payment) => <div className="list-row" key={payment.payment_id}><div><strong>{payment.shop_name}</strong><small>{new Date(payment.created_at).toLocaleString('th-TH')}</small></div><b>{Number(payment.net_amount).toLocaleString('th-TH')} บาท</b></div>)}</div> : <p className="empty-note">ยังไม่มีรายการชำระเงิน</p>}
        </section>
      </div>
    </div>
  );
}
