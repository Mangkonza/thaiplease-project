import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import api, { getErrorMessage } from '../api';
import PinPad from '../components/PinPad';
import { formatBaht } from '../utils/format';
import { QUICK_TOPUPS, WALLET_REASON_TEXT, walletErrorMessage } from '../utils/wallet';

// เปลี่ยน PIN: PIN เดิม → PIN ใหม่ → ยืนยัน PIN ใหม่ (ถ้ายังไม่มี PIN เริ่มที่ PIN ใหม่)
const PIN_STEPS = {
  current: 'ใส่ PIN เดิม',
  create: 'ตั้ง PIN ใหม่ 6 หลัก',
  confirm: 'ยืนยัน PIN ใหม่อีกครั้ง',
};

export default function WalletPage() {
  const [wallet, setWallet] = useState(null);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [pinStep, setPinStep] = useState(null);
  const [pinError, setPinError] = useState('');
  const [pinAttempt, setPinAttempt] = useState(0);
  const pins = useRef({ current: '', next: '' });
  const { hash } = useLocation();

  function load() {
    return api.get('/users/me/wallet')
      .then(({ data }) => setWallet(data))
      .catch((requestError) => setError(getErrorMessage(requestError)));
  }

  useEffect(() => { load(); }, []);

  // ปุ่มเติมเงินในหน้าแรกพามาที่ /wallet#topup ต้องเลื่อนเองเพราะฟอร์มแสดงหลังโหลดข้อมูลเสร็จ
  const loaded = wallet !== null;
  useEffect(() => {
    if (loaded && hash === '#topup') document.getElementById('topup')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [loaded, hash]);

  async function topUp(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const { data } = await api.post('/users/me/wallet/topups', { amount: Number(amount) });
      setNotice(`เติมเงิน ${formatBaht(amount)} สำเร็จ ยอดคงเหลือ ${formatBaht(data.balance)}`);
      setAmount('');
      await load();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  function goTo(step, message = '') {
    setPinError(message);
    setPinAttempt((n) => n + 1);
    setPinStep(step);
  }

  async function onPin(pin) {
    if (pinStep === 'current') {
      pins.current.current = pin;
      return goTo('create');
    }
    if (pinStep === 'create') {
      pins.current.next = pin;
      return goTo('confirm');
    }
    if (pin !== pins.current.next) return goTo('create', 'PIN ทั้งสองครั้งไม่ตรงกัน กรุณาตั้งใหม่');
    setBusy(true);
    try {
      await api.put('/users/me/pin', { pin, current_pin: wallet.has_pin ? pins.current.current : undefined });
      setPinStep(null);
      setNotice(wallet.has_pin ? 'เปลี่ยน PIN สำเร็จ' : 'ตั้ง PIN สำเร็จ');
      await load();
    } catch (requestError) {
      const body = requestError.response?.data;
      const message = walletErrorMessage(body, getErrorMessage(requestError));
      if (body?.code === 'PIN_INCORRECT') goTo('current', message);
      else {
        setPinStep(null);
        setError(message);
      }
    } finally {
      setBusy(false);
    }
    return undefined;
  }

  if (!wallet) return error ? <p className="notice notice-error" role="alert">{error}</p> : <p className="muted">กำลังโหลดกระเป๋าเงิน…</p>;

  return (
    <div className="content-stack narrow-page">
      <section className="wallet-hero">
        <span className="eyebrow">G-WALLET (จำลอง)</span>
        <p>ยอดเงินคงเหลือ</p>
        <strong>{formatBaht(wallet.balance)}</strong>
      </section>

      {error && <p className="notice notice-error" role="alert">{error}</p>}
      {notice && <p className="notice notice-success" role="status">{notice}</p>}

      <form id="topup" className="card form-stack" onSubmit={topUp}>
        <span className="eyebrow">TOP UP</span>
        <h2>เติมเงิน</h2>
        <p className="muted">เติมเงินแบบจำลอง ไม่มีการตัดเงินจากบัญชีธนาคารจริง ครั้งละไม่เกิน {formatBaht(wallet.max_topup)}</p>
        <div className="quick-amounts">
          {QUICK_TOPUPS.map((value) => (
            <button key={value} type="button" className={Number(amount) === value ? 'chip active' : 'chip'} onClick={() => setAmount(String(value))}>{value.toLocaleString('th-TH')} บาท</button>
          ))}
        </div>
        <label>จำนวนเงิน (บาท)<input type="number" min="0.01" max={wallet.max_topup} step="0.01" required value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="เช่น 500" /></label>
        <button className="button button-primary" disabled={busy || !amount}>{busy ? 'กำลังเติมเงิน…' : 'ยืนยันเติมเงิน'}</button>
      </form>

      <section className="card form-stack">
        <span className="eyebrow">SECURITY</span>
        <h2>PIN สำหรับจ่ายเงิน</h2>
        <p className="muted">{wallet.has_pin ? 'ตั้ง PIN แล้ว ต้องใส่ PIN ทุกครั้งที่จ่ายเงิน' : 'ยังไม่ได้ตั้ง PIN ต้องตั้งก่อนจ่ายเงินครั้งแรก'}</p>
        <button className="button button-outline" type="button" onClick={() => { setError(''); setNotice(''); goTo(wallet.has_pin ? 'current' : 'create'); }}>
          {wallet.has_pin ? 'เปลี่ยน PIN' : 'ตั้ง PIN'}
        </button>
      </section>

      <section className="card">
        <div className="section-title-row"><h2>รายการเงินเข้าออก</h2><span className="muted">{wallet.transactions.length} รายการ</span></div>
        {wallet.transactions.length ? <div className="list-rows">{wallet.transactions.map((entry) => (
          <div className="list-row" key={entry.ledger_id}>
            <div>
              <strong>{WALLET_REASON_TEXT[entry.reason]}{entry.shop_name ? ` · ${entry.shop_name}` : ''}</strong>
              <small>{new Date(entry.created_at).toLocaleString('th-TH')}</small>
              {entry.payment_id && <Link className="text-link" to={`/slips/${entry.payment_id}`}>ดูสลิป</Link>}
            </div>
            <b className={Number(entry.amount) >= 0 ? 'amount-positive' : 'amount-negative'}>{Number(entry.amount) > 0 ? '+' : ''}{formatBaht(entry.amount)}</b>
          </div>
        ))}</div> : <p className="empty-note">ยังไม่มีรายการ</p>}
      </section>

      {pinStep && (
        <PinPad key={`${pinStep}-${pinAttempt}`} title={PIN_STEPS[pinStep]} error={pinError} busy={busy} onComplete={onPin} onCancel={() => setPinStep(null)} />
      )}
    </div>
  );
}
