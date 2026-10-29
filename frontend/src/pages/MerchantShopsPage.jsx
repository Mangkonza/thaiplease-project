import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import api, { getErrorMessage } from '../api';

const initialForm = { name: '', category: '', area: '', description: '' };

export default function MerchantShopsPage() {
  const [shops, setShops] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  // มาจากเมนูในหน้าร้าน (state.stay) = ตั้งใจมาดูรายการร้านหรือเพิ่มร้าน จึงไม่พาเข้าร้านอัตโนมัติ
  const stay = Boolean(useLocation().state?.stay);

  async function loadShops() {
    const { data } = await api.get('/shops/my');
    setShops(data.shops);
  }

  useEffect(() => {
    api.get('/shops/my')
      .then(({ data }) => {
        // มีร้านที่เปิดใช้งานร้านเดียว พาเข้าหน้ายอดขายเลย ร้านที่รออนุมัติดูได้จากปุ่ม "ร้านทั้งหมด"
        const active = data.shops.filter((shop) => shop.status === 'ACTIVE');
        if (!stay && active.length === 1) {
          navigate(`/merchant/shops/${active[0].shop_id}/dashboard`, { replace: true });
          return;
        }
        setShops(data.shops);
      })
      .catch((requestError) => setError(getErrorMessage(requestError)));
  }, [stay, navigate]);

  async function createShop(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const { data } = await api.post('/shops', form);
      setNotice(data.message);
      setForm(initialForm);
      await loadShops();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="content-stack">
      <div className="section-heading">
        <div>
          <span className="eyebrow">MERCHANT SPACE</span>
          <h1>จัดการร้านของคุณ</h1>
          <p className="muted">เพิ่มร้าน รออนุมัติ และจัดการแคมเปญสำหรับร้านที่เปิดใช้งาน</p>
        </div>
      </div>

      {error && <p className="notice notice-error" role="alert">{error}</p>}
      {notice && <p className="notice notice-success" role="status">{notice}</p>}

      <div className="merchant-layout">
        <section className="card">
          <span className="eyebrow">YOUR STORES</span>
          <h2>ร้านค้าของฉัน</h2>
          {shops.length ? (
            <div className="list-rows">
              {shops.map((shop) => (
                <article className="list-row merchant-shop" key={shop.shop_id}>
                  <div>
                    <strong>{shop.name}</strong>
                    <small>{shop.category || 'ร้านค้า'} · {shop.area || 'ไม่ระบุพื้นที่'}</small>
                    <StatusBadge status={shop.status} />
                  </div>
                  {shop.status === 'ACTIVE' ? (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <Link
                        className="button button-outline button-small"
                        to={`/merchant/shops/${shop.shop_id}/dashboard`}
                      >
                        ดูยอดขาย
                      </Link>
                      <Link
                        className="button button-outline button-small"
                        to={`/merchant/shops/${shop.shop_id}/campaigns`}
                      >
                        จัดการแคมเปญ
                      </Link>
                    </div>
                  ) : (
                    <span className="muted small-text">รอเปิดใช้งาน</span>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-note">ยังไม่มีร้านค้า เริ่มต้นสร้างร้านของคุณได้เลย</p>
          )}
        </section>

        <form className="card form-stack" onSubmit={createShop}>
          <span className="eyebrow">NEW STORE</span>
          <h2>สร้างร้านใหม่</h2>
          <label>
            ชื่อร้าน *
            <input
              required
              maxLength="150"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label>
            หมวดหมู่
            <input
              maxLength="100"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              placeholder="เช่น คาเฟ่"
            />
          </label>
          <label>
            พื้นที่
            <input
              maxLength="150"
              value={form.area}
              onChange={(e) => setForm({ ...form, area: e.target.value })}
              placeholder="เช่น บางเขน"
            />
          </label>
          <label>
            รายละเอียด
            <textarea
              rows="3"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>
          <p className="fine-print">ร้านใหม่จะอยู่ในสถานะรออนุมัติก่อนเปิดให้บริการ</p>
          <button className="button button-primary" disabled={busy}>
            {busy ? 'กำลังบันทึก…' : 'ส่งคำขอสร้างร้าน'}
          </button>
        </form>
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const labels = { ACTIVE: 'เปิดใช้งาน', PENDING: 'รออนุมัติ', SUSPENDED: 'ไม่อนุมัติ' };
  return <span className={`status-badge status-${status?.toLowerCase()}`}>{labels[status] || status}</span>;
}