import { useCallback, useEffect, useState } from 'react';
import api, { getErrorMessage, imageSrc } from '../api';
import AdminShopDetail from './AdminShopDetail';

const FILTERS = [
  { value: 'PENDING', label: 'รออนุมัติ' },
  { value: 'ACTIVE', label: 'เปิดใช้งาน' },
  { value: 'SUSPENDED', label: 'ระงับ / ไม่อนุมัติ' },
  { value: 'CLOSED', label: 'ปิดชั่วคราว' },
  { value: '', label: 'ทั้งหมด' },
];

const STATUS = {
  PENDING: { text: 'รออนุมัติ', className: 'status-pending' },
  ACTIVE: { text: 'เปิดใช้งาน', className: 'status-active' },
  SUSPENDED: { text: 'ระงับ', className: 'status-suspended' },
  CLOSED: { text: 'ปิดชั่วคราว', className: 'status-draft' },
};

const fetchShops = (status) => api.get('/admin/shops', { params: status ? { status } : {} }).then(({ data }) => data);

// จัดการร้านทุกสถานะ: อนุมัติร้านใหม่ ระงับร้านที่เปิดอยู่ และเปิดร้านที่ถูกระงับกลับมา
export default function AdminShopsPanel({ onPendingCount }) {
  const [filter, setFilter] = useState('PENDING');
  const [shops, setShops] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(null);
  // ร้านที่กำลังจะไม่อนุมัติหรือระงับ: เปิดกล่องให้กรอกเหตุผลก่อน
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState('');
  const [dialogError, setDialogError] = useState('');

  const show = useCallback((data) => {
    setShops(data.shops);
    if (filter === 'PENDING') onPendingCount?.(data.shops.length);
  }, [filter, onPendingCount]);

  useEffect(() => {
    fetchShops(filter).then(show).catch((requestError) => setError(getErrorMessage(requestError)));
  }, [filter, show]);

  async function change(shop, status, note) {
    setBusy(true);
    setError('');
    setDialogError('');
    try {
      await api.patch(`/admin/shops/${shop.shop_id}/status`, { status, reason: note });
      setRejecting(null);
      show(await fetchShops(filter));
    } catch (requestError) {
      const message = getErrorMessage(requestError);
      if (status === 'SUSPENDED') setDialogError(message);
      else setError(message);
    } finally {
      setBusy(false);
    }
  }

  function openReject(shop) {
    setRejecting(shop);
    setReason('');
    setDialogError('');
  }

  const rejectVerb = rejecting?.status === 'PENDING' ? 'ไม่อนุมัติ' : 'ระงับ';

  return (
    <div className="content-stack">
    {selected && <AdminShopDetail key={selected} shopId={selected} onClose={() => setSelected(null)} />}
    <section className="card">
      <div className="section-heading compact">
        <h2>ร้านค้า</h2>
        <label className="inline-filter">สถานะ
          <select value={filter} onChange={(event) => setFilter(event.target.value)}>
            {FILTERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
      </div>
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      {shops.length ? <div className="list-rows">{shops.map((shop) => (
        <article className="list-row admin-shop" key={shop.shop_id}>
          <div className="admin-shop-info">
            <div className="shop-image-preview">{shop.image_path ? <img src={imageSrc(shop.image_path)} alt="" /> : <span>{shop.name.slice(0, 1)}</span>}</div>
            <div>
              <strong>{shop.name}</strong>
              <small>{shop.owner_name || shop.owner_email} · {shop.category || 'ร้านค้า'} · {shop.area || 'ไม่ระบุพื้นที่'}</small>
              {shop.description && <p>{shop.description}</p>}
              <span className={`status-badge ${STATUS[shop.status].className}`}>{STATUS[shop.status].text}</span>
            </div>
          </div>
          <div className="button-row">
            <button className="button button-quiet button-small" onClick={() => { setSelected(shop.shop_id); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>ดูรายละเอียด</button>
            {shop.status === 'PENDING' && <>
              <button className="button button-primary button-small" disabled={busy} onClick={() => change(shop, 'ACTIVE')}>อนุมัติ</button>
              <button className="button button-danger button-small" disabled={busy} onClick={() => openReject(shop)}>ไม่อนุมัติ</button>
            </>}
            {(shop.status === 'ACTIVE' || shop.status === 'CLOSED') && <button className="button button-outline button-small" disabled={busy} onClick={() => openReject(shop)}>ระงับร้าน</button>}
            {shop.status === 'SUSPENDED' && <button className="button button-primary button-small" disabled={busy} onClick={() => change(shop, 'ACTIVE')}>เปิดใช้งานอีกครั้ง</button>}
          </div>
        </article>
      ))}</div> : <p className="empty-note">ไม่มีร้านในสถานะนี้</p>}
    </section>
    {rejecting && (
      <div className="confirm-overlay" role="presentation" onClick={() => !busy && setRejecting(null)}>
        <section className="confirm-sheet confirm-sheet-danger" role="dialog" aria-modal="true" aria-labelledby="reject-shop-title" onClick={(event) => event.stopPropagation()}>
          <span className="eyebrow confirm-danger-label">{rejecting.status === 'PENDING' ? 'พิจารณาคำขอร้านค้า' : 'ระงับร้านค้า'}</span>
          <h2 id="reject-shop-title">{rejectVerb}ร้าน “{rejecting.name}”</h2>
          <label>
            เหตุผลที่{rejectVerb} *
            <textarea autoFocus required rows="4" maxLength="1000" value={reason} onChange={(event) => setReason(event.target.value)} />
          </label>
          {dialogError && <p className="notice notice-error" role="alert">{dialogError}</p>}
          <div className="button-row confirm-actions">
            <button className="button button-outline" type="button" disabled={busy} onClick={() => setRejecting(null)}>ยกเลิก</button>
            <button className="button button-danger" type="button" disabled={busy || !reason.trim()} onClick={() => change(rejecting, 'SUSPENDED', reason.trim())}>
              {busy ? 'กำลังบันทึก…' : `ยืนยัน${rejectVerb}`}
            </button>
          </div>
        </section>
      </div>
    )}
    </div>
  );
}
