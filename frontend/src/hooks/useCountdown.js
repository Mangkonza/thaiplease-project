import { useEffect, useState } from 'react';
import { secondsLeft } from '../utils/countdown';

// วินาทีที่เหลือก่อน expiresAt เดินทุกครึ่งวินาที; offset มาจาก clockOffset() ตอนโหลดข้อมูล
export default function useCountdown(expiresAt, offset) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [expiresAt]);
  return expiresAt ? secondsLeft(expiresAt, offset, now) : null;
}
