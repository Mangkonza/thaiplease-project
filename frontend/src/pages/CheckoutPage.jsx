import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api, { getErrorMessage, imageSrc } from '../api';
import PinPad from '../components/PinPad';
import { formatBaht, subsidyStatusText } from '../utils/format';
import { walletErrorMessage } from '../utils/wallet';
import { clockOffset, formatCountdown } from '../utils/countdown';
import useCountdown from '../hooks/useCountdown';

// ข้อความเมื่อคำขอรับเงินจ่ายไม่ได้แล้ว (code จาก backend)
const REQUEST_ERRORS = {
  REQUEST_EXPIRED: 'QR นี้หมดเวลาแล้ว (ใช้ได้ 5 นาที) ขอให้ร้านสร้าง QR ใหม่',
  REQUEST_ALREADY_PAID: 'QR นี้ถูกใช้จ่ายไปแล้ว',
  REQUEST_CANCELLED: 'ร้านยกเลิก QR นี้แล้ว',
  REQUEST_NOT_FOUND: 'ไม่พบ QR นี้ในระบบ ThaiPlease',
};
const STATE_ERRORS = { EXPIRED: REQUEST_ERRORS.REQUEST_EXPIRED, PAID: REQUEST_ERRORS.REQUEST_ALREADY_PAID, CANCELLED: REQUEST_ERRORS.REQUEST_CANCELLED };
const requestErrorText = (requestError) => REQUEST_ERRORS[requestError.response?.data?.code] || getErrorMessage(requestError);

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

// ขั้นตอนใส่ PIN: ตั้ง PIN ใหม่ (ครั้งแรก) → ยืนยัน PIN ใหม่ → ใส่ PIN เพื่อจ่าย
const PIN_STEPS = {
  create: { title: 'ตั้ง PIN 6 หลัก', subtitle: 'ใช้ยืนยันทุกครั้งที่จ่ายเงิน ห้ามบอกผู้อื่น' },
  confirm: { title: 'ยืนยัน PIN อีกครั้ง', subtitle: 'ใส่ PIN เดิมอีกครั้ง' },
};

export default function CheckoutPage() {
  const { requestId } = useParams();
  const navigate = useNavigate();
  // คำขอรับเงินที่ร้านใส่ยอดไว้ พร้อมส่วนต่างนาฬิกา server สำหรับนับถอยหลัง
  const [payRequest, setPayRequest] = useState(null);
  const [wallet, setWallet] = useState(null);
  // ผลคำนวณล่าสุด (quote หรือ error) ผูกกับคูปองที่ใช้ขอ เพื่อไม่แสดงผลของคูปองที่ผู้ใช้เปลี่ยนไปแล้ว
  const [quoteResult, setQuoteResult] = useState(null);
  const [coupons, setCoupons] = useState([]);
  const [couponId, setCouponId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pinStep, setPinStep] = useState(null);
  const [pinError, setPinError] = useState('');
  const [pinAttempt, setPinAttempt] = useState(0);
  const newPin = useRef('');
  // ใช้ key เดิมตลอดหน้านี้ ถ้ากดซ้ำหรือ retry backend จะคืนรายการเดิมแทนการตัดเงินซ้ำ
  const requestKey = useRef(crypto.randomUUID());
  const shop = payRequest?.shop;
  const shopId = payRequest?.shop_id;
  const payable = payRequest?.status === 'PENDING';
  const secondsLeft = useCountdown(payable ? payRequest.expires_at : null, payRequest?.offset || 0);
  const expired = payable && secondsLeft === 0;
  const unpayable = payRequest && !payable ? STATE_ERRORS[payRequest.status] : expired ? REQUEST_ERRORS.REQUEST_EXPIRED : '';

  useEffect(() => {
    const fetchedAt = Date.now();
    api.get(`/payment-requests/${requestId}`)
      .then(({ data }) => setPayRequest({ ...data.request, offset: clockOffset(data.request.server_time, fetchedAt) }))
      .catch((requestError) => setError(requestErrorText(requestError)));
    api.get('/users/me/wallet')
      .then(({ data }) => setWallet(data))
      .catch((requestError) => setError(getErrorMessage(requestError)));
  }, [requestId]);

  useEffect(() => {
    if (!shopId) return;
    api.get('/users/me/coupons')
      // คูปองจากภารกิจใช้ได้เฉพาะร้านที่กำหนด จึงแสดงเฉพาะคูปองที่ใช้ที่ร้านนี้ได้
      .then(({ data }) => setCoupons(data.coupons.filter((coupon) => coupon.status === 'ACTIVE' && (!coupon.shop_id || coupon.shop_id === shopId))))
      .catch((requestError) => setError(getErrorMessage(requestError)));
  }, [shopId]);

  useEffect(() => {
    if (!payable) return undefined;
    let cancelled = false;
    api.post('/payments/quote', { payment_request_id: requestId, coupon_id: couponId || null })
      .then(({ data }) => { if (!cancelled) setQuoteResult({ couponId, quote: data.quote }); })
      .catch((requestError) => {
        if (!cancelled) setQuoteResult({ couponId, error: requestErrorText(requestError) });
      });
    return () => { cancelled = true; };
  }, [requestId, payable, couponId]);

  const currentResult = quoteResult && quoteResult.couponId === couponId ? quoteResult : null;
  const shownQuote = currentResult && currentResult.quote;
  const quoteError = currentResult && currentResult.error;
  const note = shownQuote && subsidyStatusText(shownQuote.subsidy_status);
  const notEnough = Boolean(shownQuote && shownQuote.wallet_balance !== null && shownQuote.citizen_paid > shownQuote.wallet_balance);

  function openPin(event) {
    event.preventDefault();
    setError('');
    setPinError('');
    setPinStep(wallet?.has_pin ? 'pay' : 'create');
  }

  function closePin(message = '') {
    setPinStep(null);
    setPinError('');
    if (message) setError(message);
  }

  async function savePin(pin) {
    if (pinStep === 'create') {
      newPin.current = pin;
      setPinError('');
      setPinAttempt((n) => n + 1);
      setPinStep('confirm');
      return;
    }
    if (pin !== newPin.current) {
      setPinError('PIN ทั้งสองครั้งไม่ตรงกัน กรุณาตั้งใหม่');
      setPinAttempt((n) => n + 1);
      setPinStep('create');
      return;
    }
    setBusy(true);
    try {
      await api.put('/users/me/pin', { pin });
      setWallet((current) => ({ ...current, has_pin: true }));
      setPinError('');
      setPinAttempt((n) => n + 1);
      setPinStep('pay');
    } catch (requestError) {
      closePin(walletErrorMessage(requestError.response?.data, getErrorMessage(requestError)));
    } finally {
      setBusy(false);
    }
  }

  async function pay(pin) {
    setBusy(true);
    try {
      const { data } = await api.post('/payments', {
        payment_request_id: requestId,
        coupon_id: couponId || null,
        request_key: requestKey.current,
        pin,
      });
      navigate(`/slips/${data.payment.payment_id}`, {
        replace: true,
        state: {
          justPaid: true,
          coins_earned: data.coins_earned,
          missions_completed: data.missions_completed,
          campaign_benefit: data.campaign_benefit,
          subsidy_status: data.breakdown?.subsidy_status,
          wallet_balance: data.wallet_balance,
        },
      });
    } catch (requestError) {
      const body = requestError.response?.data;
      const message = REQUEST_ERRORS[body?.code] || walletErrorMessage(body, getErrorMessage(requestError));
      if (body?.code === 'PIN_INCORRECT') {
        setPinError(message);
        setPinAttempt((n) => n + 1);
      } else {
        closePin(message);
      }
    } finally {
      setBusy(false);
    }
  }

  const pinCopy = pinStep === 'pay'
    ? { title: 'ใส่ PIN เพื่อยืนยันการจ่าย', subtitle: shownQuote ? `จ่าย ${formatBaht(shownQuote.citizen_paid)} ให้ ${shop?.name || 'ร้านค้า'}` : '' }
    : PIN_STEPS[pinStep];

  return (
    <div className="checkout-layout">
      <div>
        <Link className="back-link" to="/scan">← กลับไปสแกน</Link>
        <span className="eyebrow">SECURE CHECKOUT</span><h1>ชำระเงิน</h1>
        {shop && (
          <div className="checkout-shop">
            {shop.image_path ? <img src={imageSrc(shop.image_path)} alt={`รูปร้าน ${shop.name}`} /> : <span className="checkout-shop-mark">{shop.name.slice(0, 1)}</span>}
            <div><strong>{shop.name}</strong><small className="muted">{shop.area || 'ร้านค้าในชุมชน'}</small></div>
          </div>
        )}
        <p className="muted">ร้านใส่ยอดไว้แล้ว ระบบคิดส่วนลดแคมเปญ คูปอง และส่วนที่รัฐช่วยจ่ายให้อัตโนมัติ แล้วหักส่วนที่คุณจ่ายจากกระเป๋าเงิน</p>
      </div>
      <form className="card checkout-card" onSubmit={openPin}>
        {wallet && <div className="wallet-strip"><span>ยอดเงินในกระเป๋า</span><strong>{formatBaht(wallet.balance)}</strong><Link to="/wallet">เติมเงิน</Link></div>}
        {payRequest && <div className="locked-amount">
          <span>ยอดที่ร้านเรียกเก็บ</span>
          <strong>{formatBaht(payRequest.amount)}</strong>
          {payable && <small className={secondsLeft <= 60 ? 'countdown urgent' : 'countdown'}>{expired ? 'หมดเวลาแล้ว' : `QR หมดอายุใน ${formatCountdown(secondsLeft)}`}</small>}
        </div>}
        {unpayable && <p className="notice notice-error" role="alert">{unpayable}</p>}
        {coupons.length > 0 && <label>คูปอง<select value={couponId} onChange={(event) => setCouponId(event.target.value)}><option value="">ไม่ใช้คูปอง</option>{coupons.map((coupon) => <option key={coupon.coupon_id} value={coupon.coupon_id}>ลด {formatBaht(coupon.value)}{coupon.shop_id ? ' (คูปองร้านนี้)' : ''} (ขั้นต่ำ {formatBaht(coupon.min_spend)}, ใช้ได้ถึง {new Date(coupon.expires_at).toLocaleDateString('th-TH')})</option>)}</select></label>}
        {shownQuote && !unpayable && <><Breakdown data={shownQuote} />
          <div className="coin-preview">ยอดนี้จะได้รับ <strong>{shownQuote.coins_estimate} coin</strong>{shownQuote.subsidy_remaining && <> · สิทธิ์รัฐช่วยจ่ายคงเหลือวันนี้หลังจ่าย {formatBaht(shownQuote.subsidy_remaining.today)}</>}</div></>}
        {note && <p className="notice">{note}</p>}
        {notEnough && <p className="notice notice-error" role="alert">ยอดเงินในกระเป๋าไม่พอ ต้องจ่าย {formatBaht(shownQuote.citizen_paid)} <Link to="/wallet">ไปเติมเงิน</Link></p>}
        {quoteError && <p className="notice notice-error" role="alert">{quoteError}</p>}
        {error && <p className="notice notice-error" role="alert">{error}</p>}
        <button className="button button-primary button-wide" disabled={busy || !shownQuote || notEnough || Boolean(unpayable)}>{shownQuote && !unpayable ? `ยืนยันจ่าย ${formatBaht(shownQuote.citizen_paid)}` : 'จ่ายไม่ได้'}</button>
        <p className="fine-print">ระบบนี้ใช้สำหรับชำระเงินจำลอง ไม่เรียกเก็บเงินจริง</p>
      </form>
      {pinStep && (
        <PinPad
          key={`${pinStep}-${pinAttempt}`}
          title={pinCopy.title}
          subtitle={pinCopy.subtitle}
          error={pinError}
          busy={busy}
          onComplete={pinStep === 'pay' ? pay : savePin}
          onCancel={() => closePin()}
        />
      )}
    </div>
  );
}
