import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import api, { getErrorMessage } from '../api';
import ShopNav from '../components/ShopNav';
import ShopImageUpload from '../components/ShopImageUpload';
import ShopDetailsForm from '../components/ShopDetailsForm';
import useCountdown from '../hooks/useCountdown';
import { clockOffset, formatCountdown } from '../utils/countdown';
import { formatBaht } from '../utils/format';
import { buildPayUrl } from '../utils/payment-links';

const POLL_MS = 3000;
const QUICK_AMOUNTS = [20, 50, 100, 200];

// รับเงินแบบไทยพลัส: ร้านใส่ยอด → ได้ QR เฉพาะครั้ง (5 นาที) → ลูกค้าสแกนแล้วใส่ PIN → หน้านี้เห็นว่าจ่ายแล้ว
export default function ShopQrPage() {
  const { shopId } = useParams();
  const [shop, setShop] = useState(null);
  const [amount, setAmount] = useState('');
  const [payRequest, setPayRequest] = useState(null);
  const [qr, setQr] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = payRequest?.status === 'PENDING';
  const secondsLeft = useCountdown(pending ? payRequest.expires_at : null, payRequest?.offset || 0);
  const expired = pending && secondsLeft === 0;
  const payUrl = payRequest ? buildPayUrl(window.location.origin, payRequest.request_id) : '';

  useEffect(() => {
    api.get(`/shops/${shopId}`)
      .then(({ data }) => setShop(data.shop))
      .catch((requestError) => setError(getErrorMessage(requestError)));
  }, [shopId]);

  useEffect(() => {
    if (!payUrl) return;
    QRCode.toDataURL(payUrl, { width: 520, margin: 2, errorCorrectionLevel: 'M' })
      .then(setQr)
      .catch((qrError) => {
        console.error('Create payment QR failed:', qrError);
        setError('สร้าง QR ไม่สำเร็จ');
      });
  }, [payUrl]);

  // ถามสถานะจนกว่าลูกค้าจ่ายหรือ QR หมดเวลา
  const requestId = payRequest?.request_id;
  useEffect(() => {
    if (!requestId || !pending || expired) return undefined;
    const timer = setInterval(() => {
      api.get(`/shops/${shopId}/payment-requests/${requestId}`)
        .then(({ data }) => {
          if (data.request.status !== 'PENDING') setPayRequest((current) => ({ ...current, ...data.request }));
        })
        .catch((requestError) => console.error('Poll payment request failed:', requestError));
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [shopId, requestId, pending, expired]);

  async function createRequest(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const fetchedAt = Date.now();
      const { data } = await api.post(`/shops/${shopId}/payment-requests`, { amount: Number(amount) });
      setQr('');
      setPayRequest({ ...data.request, offset: clockOffset(data.request.server_time, fetchedAt) });
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function cancelRequest() {
    setBusy(true);
    try {
      await api.post(`/shops/${shopId}/payment-requests/${requestId}/cancel`);
      setPayRequest(null);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  function startOver() {
    setPayRequest(null);
    setQr('');
    setAmount('');
  }

  return (
    <div className="content-stack">
      <div className="section-heading"><div><h1>{shop?.name || 'ร้านของฉัน'}</h1><p className="muted">รับเงินจากลูกค้าและข้อมูลหน้าร้าน</p></div></div>
      <ShopNav shopId={shopId} section="qr" />
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      {shop && <div className="merchant-layout">
        <section className="card qr-card">
          <span className="eyebrow">RECEIVE PAYMENT</span>
          {shop.status !== 'ACTIVE' && <p className="notice">ร้านยังไม่ได้รับอนุมัติ จึงยังรับเงินไม่ได้</p>}

          {!payRequest && <form className="form-stack receive-form" onSubmit={createRequest}>
            <h2>ใส่ยอดที่ต้องการเก็บ</h2>
            <div className="quick-amounts">
              {QUICK_AMOUNTS.map((value) => (
                <button key={value} type="button" className={Number(amount) === value ? 'chip active' : 'chip'} onClick={() => setAmount(String(value))}>{value} บาท</button>
              ))}
            </div>
            <label>ยอดเงิน (บาท)<input className="amount-input" type="number" min="0.01" step="0.01" required value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" /></label>
            <button className="button button-primary button-wide" disabled={busy || !amount || shop.status !== 'ACTIVE'}>{busy ? 'กำลังสร้าง QR…' : 'สร้าง QR รับเงิน'}</button>
            <p className="fine-print">ลูกค้าสแกนแล้วจ่ายตามยอดนี้ แก้ยอดเองไม่ได้ QR ใช้ได้ 5 นาทีและใช้ได้ครั้งเดียว</p>
          </form>}

          {pending && !expired && <>
            <h2>{formatBaht(payRequest.amount)}</h2>
            <span className={secondsLeft <= 60 ? 'countdown urgent' : 'countdown'}>หมดอายุใน {formatCountdown(secondsLeft)}</span>
            {qr ? <img className="qr-image" src={qr} alt={`QR รับเงิน ${formatBaht(payRequest.amount)}`} /> : <p className="muted">กำลังสร้าง QR…</p>}
            <p className="muted">ให้ลูกค้าเปิด "สแกนจ่าย" แล้วสแกน QR นี้ หน้านี้จะเปลี่ยนเองเมื่อลูกค้าจ่ายแล้ว</p>
            <small className="muted qr-link">{payUrl}</small>
            <button className="button button-outline" type="button" disabled={busy} onClick={cancelRequest}>ยกเลิก / แก้ยอด</button>
          </>}

          {expired && <>
            <span className="success-mark refunded">⌛</span>
            <h2>QR หมดเวลาแล้ว</h2>
            <p className="muted">ยังไม่มีการจ่าย {formatBaht(payRequest.amount)} สร้าง QR ใหม่เพื่อรับเงินอีกครั้ง</p>
            <button className="button button-primary" type="button" onClick={startOver}>สร้าง QR ใหม่</button>
          </>}

          {payRequest?.status === 'PAID' && <>
            <span className="success-mark">✓</span>
            <h2>รับเงินแล้ว {formatBaht(payRequest.payment?.gross_amount ?? payRequest.amount)}</h2>
            {payRequest.payment && <dl className="receipt-list">
              <div><dt>ลูกค้าจ่าย</dt><dd>{formatBaht(payRequest.payment.citizen_paid)}</dd></div>
              <div><dt>รัฐช่วยจ่าย</dt><dd>{formatBaht(payRequest.payment.government_subsidy)}</dd></div>
              {payRequest.payment.coupon_discount > 0 && <div><dt>คูปอง (โครงการจ่ายให้ร้าน)</dt><dd>{formatBaht(payRequest.payment.coupon_discount)}</dd></div>}
            </dl>}
            <button className="button button-primary" type="button" onClick={startOver}>รับเงินรายการถัดไป</button>
          </>}
        </section>
        <section className="card form-stack">
          <span className="eyebrow">STOREFRONT</span>
          <h2>รูปหน้าร้าน</h2>
          <p className="muted">รูปนี้แสดงในหน้าร้านแนะนำ หน้าร้าน และหน้าจ่ายเงินของลูกค้า</p>
          <ShopImageUpload shop={shop} onUploaded={(imagePath) => setShop({ ...shop, image_path: imagePath })} />
          <h2 className="section-gap">ข้อมูลร้านสำหรับลูกค้า</h2>
          <p className="muted">ที่อยู่ เวลาเปิด และสินค้าที่ขาย แสดงในหน้าร้านแนะนำ</p>
          <ShopDetailsForm shop={shop} />
        </section>
      </div>}
    </div>
  );
}
