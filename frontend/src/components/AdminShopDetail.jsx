import { useCallback, useEffect, useState } from 'react';
import api, { getErrorMessage, imageSrc } from '../api';
import { formatBaht, formatNumber } from '../utils/format';

const CASE_TEXT = { REFUND: 'ขอคืนเงิน', COMPLAINT: 'ร้องเรียน' };
const CASE_STATUS_TEXT = { PENDING: 'รอพิจารณา', APPROVED: 'อนุมัติ', REJECTED: 'ไม่อนุมัติ', RESOLVED: 'ปิดเรื่อง' };
const PAYMENT_STATUS_TEXT = { SUCCESS: 'สำเร็จ', REFUNDED: 'คืนเงินแล้ว', FAILED: 'ไม่สำเร็จ', PENDING: 'รอดำเนินการ' };
const dateTime = (value) => (value ? new Date(value).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

// รายละเอียดร้านสำหรับ Admin: ข้อมูลร้าน เจ้าของ ยอดขาย ยอดที่โครงการต้องโอน การโอน รายการล่าสุด คำร้อง และแคมเปญ
export default function AdminShopDetail({ shopId, onClose }) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api.get(`/admin/shops/${shopId}`).then(({ data }) => setDetail(data)), [shopId]);

  useEffect(() => {
    load().catch((requestError) => setError(getErrorMessage(requestError)));
  }, [load]);

  async function payout() {
    const note = window.prompt(`บันทึกว่าโอน ${formatBaht(detail.balance.pending)} ให้ "${detail.shop.name}" แล้ว\nหมายเหตุ (เช่น เลขที่รายการโอน) เว้นว่างได้`);
    if (note === null) return;
    setBusy(true);
    setError('');
    try {
      await api.post(`/admin/shops/${shopId}/payouts`, { note });
      await load();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  if (!detail) {
    return <section className="card">{error ? <p className="notice notice-error" role="alert">{error}</p> : <p className="muted">กำลังโหลดรายละเอียดร้าน…</p>}</section>;
  }
  const { shop, sales, balance, payouts, recent_payments: recent, cases, campaigns } = detail;

  return (
    <section className="card shop-detail admin-overview">
      <div className="section-heading compact">
        <div className="admin-shop-info">
          <div className="shop-image-preview large">{shop.image_path ? <img src={imageSrc(shop.image_path)} alt="" /> : <span>{shop.name.slice(0, 1)}</span>}</div>
          <div>
            <span className="eyebrow">SHOP DETAIL</span>
            <h2>{shop.name}</h2>
            <small className="muted">{shop.category || 'ร้านค้า'} · {shop.area || 'ไม่ระบุพื้นที่'} · สมัครเมื่อ {dateTime(shop.created_at)}</small>
          </div>
        </div>
        <button className="button button-quiet" type="button" onClick={onClose}>ปิด</button>
      </div>
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      {shop.description && <p>{shop.description}</p>}
      <dl className="receipt-list">
        <div><dt>เจ้าของร้าน</dt><dd>{shop.owner_name || '—'}</dd></div>
        <div><dt>อีเมลติดต่อ</dt><dd>{shop.owner_email}</dd></div>
        <div><dt>รหัสร้าน</dt><dd className="slip-ref">{shop.shop_id}</dd></div>
      </dl>

      <div className="metric-grid">
        <div className="metric-card"><span className="muted">ยอดซื้อทั้งหมด</span><strong>{formatBaht(sales.gross)}</strong><small className="muted">{formatNumber(sales.orders)} รายการ · ผู้ซื้อ {formatNumber(sales.buyers)} คน</small></div>
        <div className="metric-card"><span className="muted">30 วันล่าสุด</span><strong>{formatBaht(sales.gross_30d)}</strong><small className="muted">{formatNumber(sales.orders_30d)} รายการ · ล่าสุด {dateTime(sales.last_paid_at)}</small></div>
        <div className="metric-card"><span className="muted">โครงการต้องโอนรวม</span><strong>{formatBaht(balance?.owed ?? 0)}</strong><small className="muted">รัฐช่วยจ่าย {formatBaht(balance?.government_subsidy ?? 0)} · คูปอง {formatBaht(balance?.coupon_discount ?? 0)}</small></div>
        <div className="metric-card"><span className="muted">รอโอน</span><strong>{formatBaht(balance?.pending ?? 0)}</strong><small className="muted">โอนแล้ว {formatBaht(balance?.paid_out ?? 0)}</small>
          {balance?.pending > 0 && <button className="button button-primary button-small" disabled={busy} onClick={payout}>บันทึกการโอน</button>}</div>
      </div>

      <div className="two-column">
        <div>
          <h3>รายการล่าสุด</h3>
          {recent.length ? <div className="table-wrap"><table>
            <thead><tr><th>เวลา</th><th>ผู้ซื้อ</th><th>ยอดซื้อ</th><th>รัฐช่วย</th><th>สถานะ</th></tr></thead>
            <tbody>{recent.map((p) => <tr key={p.payment_id}><td>{dateTime(p.paid_at)}</td><td>{p.citizen_name}</td><td>{formatBaht(p.gross_amount)}</td><td>{formatBaht(p.government_subsidy)}</td><td>{PAYMENT_STATUS_TEXT[p.status] || p.status}</td></tr>)}</tbody>
          </table></div> : <p className="empty-note">ยังไม่มีรายการ</p>}
        </div>
        <div>
          <h3>ประวัติการโอน</h3>
          {payouts.length ? <div className="list-rows">{payouts.map((p) => <div className="list-row" key={p.payout_id}><div><strong>{formatBaht(p.amount)}</strong><small>{dateTime(p.created_at)} · โดย {p.created_by_name || '—'}{p.note ? ` · ${p.note}` : ''}</small></div></div>)}</div> : <p className="empty-note">ยังไม่มีการโอน</p>}
          <h3 className="section-gap">คำร้อง</h3>
          {cases.length ? <div className="list-rows">{cases.map((c) => <div className="list-row" key={`${c.case_type}-${c.status}`}><span>{CASE_TEXT[c.case_type]} · {CASE_STATUS_TEXT[c.status]}</span><b>{c.count}</b></div>)}</div> : <p className="empty-note">ไม่มีคำร้อง</p>}
          <h3 className="section-gap">แคมเปญล่าสุด</h3>
          {campaigns.length ? <div className="list-rows">{campaigns.map((c) => <div className="list-row" key={c.campaign_id}><div><strong>{c.name}</strong><small>{c.template_name} · {c.status}</small></div></div>)}</div> : <p className="empty-note">ยังไม่มีแคมเปญ</p>}
        </div>
      </div>
    </section>
  );
}
