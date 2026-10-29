import { useEffect, useState } from 'react';
import api, { getErrorMessage } from '../api';
import { formatBaht } from '../utils/format';
import { CASE_STATUS } from '../utils/cases';

// คำขอคืนเงินของร้าน ร้านต้องตัดสินภายใน 3 วัน ไม่เช่นนั้น Admin ตัดสินแทน (D-15)
export default function ShopRefundPanel({ shopId }) {
  const [cases, setCases] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/shops/${shopId}/refund-requests`)
      .then(({ data }) => setCases(data.cases))
      .catch((requestError) => setError(getErrorMessage(requestError)));
  }, [shopId]);

  async function decide(item, decision) {
    let note;
    if (decision === 'REJECT') {
      note = window.prompt('กรุณาระบุเหตุผลที่ไม่อนุมัติการคืนเงิน');
      if (!note?.trim()) return;
    } else if (!window.confirm(`ยืนยันคืนเงิน ${formatBaht(item.gross_amount)} ให้ ${item.citizen_name}?`)) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.post(`/shops/${shopId}/refund-requests/${item.case_id}/decision`, { decision, note });
      const { data } = await api.get(`/shops/${shopId}/refund-requests`);
      setCases(data.cases);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  const pending = cases.filter((item) => item.status === 'PENDING').length;
  return (
    <section className="card">
      <div className="section-heading compact"><div><h2>คำขอคืนเงิน</h2><span className="muted">คืนเต็มจำนวนเท่านั้น ถ้าไม่ตอบภายใน 3 วัน ผู้ดูแลระบบจะพิจารณาแทน</span></div><span className="muted">รอพิจารณา {pending} เรื่อง</span></div>
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      {cases.length ? <div className="list-rows">{cases.map((item) => <article className="list-row" key={item.case_id}>
        <div><strong>{item.citizen_name} · {formatBaht(item.gross_amount)}</strong><small>จ่ายเมื่อ {new Date(item.paid_at).toLocaleString('th-TH')} · ขอเมื่อ {new Date(item.created_at).toLocaleString('th-TH')}</small><small>เหตุผล: {item.reason}</small>{item.decision_note && <small>ผลพิจารณา: {item.decision_note}</small>}</div>
        {item.status === 'PENDING'
          ? <div className="button-row"><button className="button button-primary button-small" disabled={busy} onClick={() => decide(item, 'APPROVE')}>อนุมัติคืนเงิน</button><button className="button button-outline button-small" disabled={busy} onClick={() => decide(item, 'REJECT')}>ไม่อนุมัติ</button></div>
          : <span className={`status-badge ${CASE_STATUS[item.status].className}`}>{CASE_STATUS[item.status].text}</span>}
      </article>)}</div> : <p className="empty-note">ยังไม่มีคำขอคืนเงิน</p>}
    </section>
  );
}
