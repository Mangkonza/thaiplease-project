import { useEffect, useState } from 'react';
import api, { getErrorMessage } from '../api';
import { formatBaht } from '../utils/format';
import { CASE_STATUS, CASE_TYPE_TEXT } from '../utils/cases';

// คำขอคืนเงินที่ร้านไม่ตอบเกิน 3 วัน และเรื่องร้องเรียนทั้งหมด (D-15)
export default function AdminCasesPanel() {
  const [cases, setCases] = useState([]);
  const [status, setStatus] = useState('PENDING');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/admin/cases', { params: { status: status || undefined } })
      .then(({ data }) => setCases(data.cases))
      .catch((requestError) => setError(getErrorMessage(requestError)));
  }, [status]);

  async function decide(item, decision) {
    const ask = { APPROVE: null, REJECT: 'เหตุผลที่ไม่อนุมัติการคืนเงิน', RESOLVE: 'ผลการจัดการเรื่องร้องเรียน' }[decision];
    let note;
    if (ask) {
      note = window.prompt(ask);
      if (!note?.trim()) return;
    } else if (!window.confirm(`ยืนยันคืนเงิน ${formatBaht(item.gross_amount)} ให้ ${item.citizen_name}?`)) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.post(`/admin/cases/${item.case_id}/decision`, { decision, note });
      const { data } = await api.get('/admin/cases', { params: { status: status || undefined } });
      setCases(data.cases);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  function actions(item) {
    if (item.status !== 'PENDING') return <span className={`status-badge ${CASE_STATUS[item.status].className}`}>{CASE_STATUS[item.status].text}</span>;
    if (!item.admin_can_decide) return <span className="status-badge status-pending">รอร้านพิจารณา</span>;
    if (item.case_type === 'COMPLAINT') return <button className="button button-primary button-small" disabled={busy} onClick={() => decide(item, 'RESOLVE')}>ปิดเรื่อง</button>;
    return <div className="button-row"><button className="button button-primary button-small" disabled={busy} onClick={() => decide(item, 'APPROVE')}>อนุมัติคืนเงิน</button><button className="button button-outline button-small" disabled={busy} onClick={() => decide(item, 'REJECT')}>ไม่อนุมัติ</button></div>;
  }

  return (
    <section className="card">
      <div className="section-heading compact"><div><h2>คำขอคืนเงินและเรื่องร้องเรียน</h2><span className="muted">คำขอคืนเงินตัดสินแทนร้านได้เมื่อร้านไม่ตอบเกิน 3 วัน</span></div>
        <label>สถานะ<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="PENDING">รอพิจารณา</option><option value="">ทั้งหมด</option><option value="APPROVED">อนุมัติแล้ว</option><option value="REJECTED">ไม่อนุมัติ</option><option value="RESOLVED">ปิดเรื่องแล้ว</option></select></label></div>
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      {cases.length ? <div className="list-rows">{cases.map((item) => <article className="list-row" key={item.case_id}>
        <div><strong>{CASE_TYPE_TEXT[item.case_type]} · {item.shop_name} · {formatBaht(item.gross_amount)}</strong><small>{item.citizen_name} · ส่งเมื่อ {new Date(item.created_at).toLocaleString('th-TH')}</small><small>เหตุผล: {item.reason}</small>{item.decision_note && <small>ผลพิจารณา: {item.decision_note}</small>}</div>
        {actions(item)}
      </article>)}</div> : <p className="empty-note">ไม่มีคำร้องในสถานะนี้</p>}
    </section>
  );
}
