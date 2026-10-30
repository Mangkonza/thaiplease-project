import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api, { getErrorMessage, imageSrc } from '../api';
import PinPad from '../components/PinPad';
import { formatBaht, subsidyStatusText } from '../utils/format';
import { walletErrorMessage } from '../utils/wallet';

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

// ขั้นตอนใส่ PIN: ตั้ง PIN ใหม่ (ครั้งแรก) → ยืนยัน PIN ใหม่ → ใส่ PIN เพื่อจ่าย
const PIN_STEPS = {
  create: { title: 'ตั้ง PIN 6 หลัก', subtitle: 'ใช้ยืนยันทุกครั้งที่จ่ายเงิน ห้ามบอกผู้อื่น' },
  confirm: { title: 'ยืนยัน PIN อีกครั้ง', subtitle: 'ใส่ PIN เดิมอีกครั้ง' },
};

export default function CheckoutPage() {
  const { shopId } = useParams();
  const navigate = useNavigate();
  const [shop, setShop] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [amount, setAmount] = useState('');
  // ผลคำนวณล่าสุด (quote หรือ error) ผูกกับยอดและคูปองที่ใช้ขอ เพื่อไม่แสดงผลของค่าที่ผู้ใช้เปลี่ยนไปแล้ว
  const [quoteResult, setQuoteResult] = useState(null);
  const [coupons, setCoupons] = useState([]);
  const [couponId, setCouponId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pinStep, setPinStep] = useState(null);
  const [pinError, setPinError] = useState('');
  const [pinAttempt, setPinAttempt] = useState(0);
  const newPin = useRef('');
  // ใช้ key เดิมเมื่อกดซ้ำหรือ retry ยอดเดิม เพื่อให้ backend กันการตัดเงินซ้ำได้ เปลี่ยน key เมื่อยอดเปลี่ยน
  const requestKey = useRef(crypto.randomUUID());

  const value = Number(amount);
  const validAmount = amount !== '' && Number.isFinite(value) && value > 0;

  useEffect(() => {
    api.get(`/shops/public/${shopId}`)
      .then(({ data }) => setShop(data.shop))
      .catch((requestError) => setError(requestError.response?.status === 404 ? 'ไม่พบร้านนี้ หรือร้านยังไม่เปิดให้บริการ' : getErrorMessage(requestError)));
    api.get('/users/me/coupons')
      // คูปองจากภารกิจใช้ได้เฉพาะร้านที่กำหนด จึงแสดงเฉพาะคูปองที่ใช้ที่ร้านนี้ได้
      .then(({ data }) => setCoupons(data.coupons.filter((coupon) => coupon.status === 'ACTIVE' && (!coupon.shop_id || coupon.shop_id === shopId))))
      .catch((requestError) => setError(getErrorMessage(requestError)));
    api.get('/users/me/wallet')
      .then(({ data }) => setWallet(data))
      .catch((requestError) => setError(getErrorMessage(requestError)));
  }, [shopId]);

  useEffect(() => {
    requestKey.current = crypto.randomUUID();
    if (!validAmount) return undefined;
    let cancelled = false;
    const timer = setTimeout(() => {
      api.post('/payments/quote', { shop_id: shopId, gross_amount: value, coupon_id: couponId || null })
        .then(({ data }) => { if (!cancelled) setQuoteResult({ value, couponId, quote: data.quote }); })
        .catch((requestError) => {
          if (!cancelled) setQuoteResult({ value, couponId, error: getErrorMessage(requestError) });
        });
    }, QUOTE_DELAY_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [shopId, value, validAmount, couponId]);

  const currentResult = validAmount && quoteResult && quoteResult.value === value && quoteResult.couponId === couponId ? quoteResult : null;
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
        shop_id: shopId,
        gross_amount: value,
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
      const message = walletErrorMessage(body, getErrorMessage(requestError));
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
        <p className="muted">ระบุยอดซื้อ ระบบจะคิดส่วนลดแคมเปญ คูปอง และส่วนที่รัฐช่วยจ่ายให้อัตโนมัติ แล้วหักส่วนที่คุณจ่ายจากกระเป๋าเงิน</p>
      </div>
      <form className="card checkout-card" onSubmit={openPin}>
        {wallet && <div className="wallet-strip"><span>ยอดเงินในกระเป๋า</span><strong>{formatBaht(wallet.balance)}</strong><Link to="/wallet">เติมเงิน</Link></div>}
        <label>ยอดซื้อ (บาท)<input type="number" min="0.01" step="0.01" required value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="เช่น 250.00" /></label>
        {coupons.length > 0 && <label>คูปอง<select value={couponId} onChange={(event) => setCouponId(event.target.value)}><option value="">ไม่ใช้คูปอง</option>{coupons.map((coupon) => <option key={coupon.coupon_id} value={coupon.coupon_id}>ลด {formatBaht(coupon.value)}{coupon.shop_id ? ' (คูปองร้านนี้)' : ''} (ขั้นต่ำ {formatBaht(coupon.min_spend)}, ใช้ได้ถึง {new Date(coupon.expires_at).toLocaleDateString('th-TH')})</option>)}</select></label>}
        {shownQuote && <><Breakdown data={shownQuote} />
          <div className="coin-preview">ยอดนี้จะได้รับ <strong>{shownQuote.coins_estimate} coin</strong>{shownQuote.subsidy_remaining && <> · สิทธิ์รัฐช่วยจ่ายคงเหลือวันนี้หลังจ่าย {formatBaht(shownQuote.subsidy_remaining.today)}</>}</div></>}
        {note && <p className="notice">{note}</p>}
        {notEnough && <p className="notice notice-error" role="alert">ยอดเงินในกระเป๋าไม่พอ ต้องจ่าย {formatBaht(shownQuote.citizen_paid)} <Link to="/wallet">ไปเติมเงิน</Link></p>}
        {quoteError && <p className="notice notice-error" role="alert">{quoteError}</p>}
        {error && <p className="notice notice-error" role="alert">{error}</p>}
        <button className="button button-primary button-wide" disabled={busy || !shownQuote || notEnough || !shop}>{shownQuote ? `ยืนยันจ่าย ${formatBaht(shownQuote.citizen_paid)}` : 'ระบุยอดซื้อ'}</button>
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
