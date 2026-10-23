import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api, { getErrorMessage } from '../api';

export default function CheckoutPage() {
  const { shopId } = useParams();
  const navigate = useNavigate();
  const [amount, setAmount] = useState('');
  const [payment, setPayment] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function pay(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { data } = await api.post('/payments', {
        shop_id: shopId,
        gross_amount: Number(amount),
        request_key: crypto.randomUUID(),
      });
      setPayment(data);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  if (payment) return (
    <section className="card receipt-card">
      <div className="success-mark">✓</div><span className="eyebrow">PAYMENT COMPLETE</span>
      <h1>ชำระเงินสำเร็จ</h1><p className="muted">ขอบคุณที่สนับสนุนร้านค้าในชุมชน</p>
      <dl className="receipt-list">
        <div><dt>ยอดก่อนหักส่วนลด</dt><dd>{Number(payment.payment.gross_amount).toFixed(2)} บาท</dd></div>
        <div><dt>ส่วนลด</dt><dd>−{Number(payment.payment.discount_amount).toFixed(2)} บาท</dd></div>
        <div className="receipt-total"><dt>ยอดชำระ</dt><dd>{Number(payment.payment.net_amount).toFixed(2)} บาท</dd></div>
        <div><dt>เหรียญที่ได้รับ</dt><dd>+{payment.coins_earned} coin</dd></div>
      </dl>
      {payment.campaign_benefit && <p className="notice notice-success">ใช้สิทธิ์แคมเปญ {payment.campaign_benefit.templateCode} สำเร็จ</p>}
      <div className="button-row"><button className="button button-primary" onClick={() => navigate('/coins')}>ดูเหรียญของฉัน</button><Link className="button button-outline" to="/shops">กลับไปค้นหาร้าน</Link></div>
    </section>
  );

  return (
    <div className="checkout-layout">
      <div><Link className="back-link" to={`/shops/${shopId}`}>← กลับไปหน้าร้าน</Link><span className="eyebrow">SECURE CHECKOUT</span><h1>ชำระเงิน</h1><p className="muted">ระบุยอดชำระ ระบบจะตรวจสอบส่วนลดและเหรียญจากแคมเปญให้อัตโนมัติ</p></div>
      <form className="card checkout-card" onSubmit={pay}>
        <label>ยอดซื้อก่อนหักส่วนลด (บาท)<input type="number" min="0.01" step="0.01" required value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="เช่น 250.00" /></label>
        {amount && Number(amount) > 0 && <div className="coin-preview">ยอดนี้จะได้รับอย่างน้อย <strong>{Math.floor(Number(amount) / 25)} coin</strong></div>}
        {error && <p className="notice notice-error" role="alert">{error}</p>}
        <button className="button button-primary button-wide" disabled={busy}>{busy ? 'กำลังชำระเงิน…' : 'ยืนยันการชำระเงิน'}</button>
        <p className="fine-print">ระบบนี้ใช้สำหรับชำระเงินจำลอง ไม่เรียกเก็บเงินจริง</p>
      </form>
    </div>
  );
}
