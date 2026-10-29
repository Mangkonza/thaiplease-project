import { useEffect, useRef, useState } from 'react';
import { PIN_LENGTH } from '../utils/wallet';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

// แป้นใส่ PIN 6 หลักแบบแอปธนาคาร ครบ 6 หลักแล้วส่งให้ onComplete ทันที
// ล้างช่องให้ใส่ใหม่ (เช่น หลังใส่ผิด) โดยเปลี่ยน key ของ component จากฝั่งผู้เรียก
export default function PinPad({ title, subtitle, error, busy, onComplete, onCancel }) {
  const [pin, setPin] = useState('');
  // เก็บค่าล่าสุดไว้ใน ref ด้วย เพราะพิมพ์เร็วๆ หลายปุ่มอาจเกิดก่อน React render รอบถัดไป
  const pinRef = useRef('');
  const keyHandler = useRef(null);
  const sheet = useRef(null);

  function press(key) {
    if (busy) return;
    const current = pinRef.current;
    if (key !== 'del' && current.length >= PIN_LENGTH) return;
    const next = key === 'del' ? current.slice(0, -1) : current + key;
    pinRef.current = next;
    setPin(next);
    if (key !== 'del' && next.length === PIN_LENGTH) onComplete(next);
  }

  useEffect(() => {
    keyHandler.current = (event) => {
      if (/^\d$/.test(event.key)) press(event.key);
      else if (event.key === 'Backspace') press('del');
      else if (event.key === 'Escape' && onCancel) onCancel();
    };
  });

  useEffect(() => {
    // ย้าย focus ออกจากช่องกรอกด้านหลัง ไม่ให้ตัวเลขที่พิมพ์ไปแก้ยอดเงินแทน PIN
    sheet.current?.focus();
    const onKey = (event) => keyHandler.current(event);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="pin-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="pin-sheet" ref={sheet} tabIndex={-1}>
        <h2>{title}</h2>
        {subtitle && <p className="muted">{subtitle}</p>}
        <div className="pin-dots" aria-label={`ใส่แล้ว ${pin.length} จาก ${PIN_LENGTH} หลัก`}>
          {Array.from({ length: PIN_LENGTH }, (_, index) => <span key={index} className={index < pin.length ? 'filled' : ''} />)}
        </div>
        {error && <p className="notice notice-error" role="alert">{error}</p>}
        {busy && <p className="muted">กำลังตรวจสอบ…</p>}
        <div className="pin-keys">
          {KEYS.map((key, index) => (key === ''
            ? <span key={index} />
            : <button key={index} type="button" disabled={busy} onClick={() => press(key)} aria-label={key === 'del' ? 'ลบ' : key}>{key === 'del' ? '⌫' : key}</button>))}
        </div>
        {onCancel && <button type="button" className="button button-quiet" onClick={onCancel} disabled={busy}>ยกเลิก</button>}
      </div>
    </div>
  );
}
