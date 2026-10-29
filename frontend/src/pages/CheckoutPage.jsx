import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api, { getErrorMessage } from '../api';
import { formatBaht, subsidyStatusText } from '../utils/format';

const QUOTE_DELAY_MS = 400;

function Breakdown({ data }) {
  return (
    <dl className="receipt-list">
      <div><dt>ยอดซื้อ</dt><dd>{formatBaht(data.gross_amount)}</dd></div>
      {Number(data.campaign_discount) > 0 && <div><dt>ส่วนลดแคมเปญร้าน</dt><dd>−{formatBaht(data.campaign_discount)}</dd></div>}
      {Number(data.coupon_discount) > 0 && <div><dt>คูปอง</dt><dd>−{formatBaht(data.coupon_discount)}</dd></div>}
      <div><dt>รัฐช่วยจ่าย</dt><dd>−{formatBaht(data.government_subsidy)}</dd></div>
      <div className="receipt-total"><dt>คุณจ่าย</dt><dd>{formatBaht(data.citizen_paid)}</dd></div>
    </dl>
  );
}

export default function CheckoutPage() {
  const { shopId } = useParams();
  const navigate = useNavigate();
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState(null);
  const [payment, setPayment] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // ใช้ key เดิมเมื่อกดซ้ำหรือ retry ยอดเดิม เพื่อให้ backend กันการตัดเงินซ้ำได้ เปลี่ยน key เมื่อยอดเปลี่ยน
  const requestKey = useRef(crypto.randomUUID());

  const value = Number(amount);
  const validAmount = amount !== '' && Number.isFinite(value) && value > 0;

  useEffect(() => {
    requestKey.current = crypto.randomUUID();
    if (!validAmount) return undefined;
    let cancelled = false;
    const timer = setTimeout(() => {
      api.post('/payments/quote', { shop_id: shopId, gross_amount: value })
        .then(({ data }) => { if (!cancelled) setQuote(data.quote); })
        .catch(() => { if (!cancelled) setQuote(null); });
    }, QUOTE_DELAY_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [shopId, value, validAmount]);

  async function pay(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { data } = await api.post('/payments', {
        shop_id: shopId,
        gross_amount: value,
        request_key: requestKey.current,
      });
      setPayment(data);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  if (payment) {
    const breakdown = payment.breakdown || {
      gross_amount: payment.payment.gross_amount,
      campaign_discount: payment.payment.discount_amount,
      coupon_discount: payment.payment.coupon_discount,
      government_subsidy: payment.payment.government_subsidy,
      citizen_paid: payment.payment.citizen_paid,
    };
    const note = subsidyStatusText(breakdown.subsidy_status);
    return (
      <section className="card receipt-card">
        <div className="success-mark">✓</div><span className="eyebrow">PAYMENT COMPLETE</span>
        <h1>ชำระเงินสำเร็จ</h1><p className="muted">ขอบคุณที่สนับสนุนร้านค้าในชุมชน</p>
        <Breakdown data={breakdown} />
        <dl className="receipt-list"><div><dt>เหรียญที่ได้รับ</dt><dd>+{payment.coins_earned} coin</dd></div>
          {breakdown.subsidy_remaining && <div><dt>สิทธิ์รัฐช่วยจ่ายคงเหลือวันนี้</dt><dd>{formatBaht(breakdown.subsidy_remaining.today)}</dd></div>}</dl>
        {note && <p className="notice">{note}</p>}
        {payment.campaign_benefit && <p className="notice notice-success">ใช้สิทธิ์แคมเปญ {payment.campaign_benefit.templateCode} สำเร็จ</p>}
        <div className="button-row"><button className="button button-primary" onClick={() => navigate('/coins')}>ดูเหรียญของฉัน</button><Link className="button button-outline" to="/shops">กลับไปค้นหาร้าน</Link></div>
      </section>
    );
  }

  const shownQuote = validAmount && quote && Number(quote.gross_amount) === value ? quote : null;
  const note = shownQuote && subsidyStatusText(shownQuote.subsidy_status);
  return (
    <div className="checkout-layout">
      <div><Link className="back-link" to={`/shops/${shopId}`}>← กลับไปหน้าร้าน</Link><span className="eyebrow">SECURE CHECKOUT</span><h1>ชำระเงิน</h1><p className="muted">ระบุยอดซื้อ ระบบจะคิดส่วนลดแคมเปญและส่วนที่รัฐช่วยจ่ายให้อัตโนมัติ</p></div>
      <form className="card checkout-card" onSubmit={pay}>
        <label>ยอดซื้อ (บาท)<input type="number" min="0.01" step="0.01" required value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="เช่น 250.00" /></label>
        {shownQuote && <><Breakdown data={shownQuote} />
          <div className="coin-preview">ยอดนี้จะได้รับ <strong>{shownQuote.coins_estimate} coin</strong>{shownQuote.subsidy_remaining && <> · สิทธิ์รัฐช่วยจ่ายคงเหลือวันนี้หลังจ่าย {formatBaht(shownQuote.subsidy_remaining.today)}</>}</div></>}
        {note && <p className="notice">{note}</p>}
        {error && <p className="notice notice-error" role="alert">{error}</p>}
        <button className="button button-primary button-wide" disabled={busy || !validAmount}>{busy ? 'กำลังชำระเงิน…' : shownQuote ? `ยืนยันจ่าย ${formatBaht(shownQuote.citizen_paid)}` : 'ยืนยันการชำระเงิน'}</button>
        <p className="fine-print">ระบบนี้ใช้สำหรับชำระเงินจำลอง ไม่เรียกเก็บเงินจริง</p>
      </form>
    </div>
  );
}
