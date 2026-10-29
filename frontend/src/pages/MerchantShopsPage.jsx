import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import api, { getErrorMessage } from '../api';
import ShopImageUpload from '../components/ShopImageUpload';

const PRESET_CATEGORIES = [
  'อาหารและเครื่องดื่ม',
  'คาเฟ่',
  'ร้านอาหารตามสั่ง',
  'ของหวานและเบเกอรี่',
  'ของใช้และบริการ',
  'อื่นๆ (ระบุเอง)',
];

const PRESET_AREAS = [
  'กำแพงแสน',
  'เมืองนครปฐม',
  'บางเขน',
  'มหาวิทยาลัย',
  'อื่นๆ (ระบุเอง)',
];

const initialForm = { name: '', category: '', area: '', description: '' };

export default function MerchantShopsPage() {
  const [shops, setShops] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [categoryChoice, setCategoryChoice] = useState(PRESET_CATEGORIES[0]);
  const [customCategory, setCustomCategory] = useState('');
  const [areaChoice, setAreaChoice] = useState(PRESET_AREAS[0]);
  const [customArea, setCustomArea] = useState('');

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

    // เลือกใช้ค่าจาก Dropdown หรือค่าที่พิมพ์เองในช่องอื่นๆ
    const finalCategory =
      categoryChoice === 'อื่นๆ (ระบุเอง)' ? customCategory.trim() : categoryChoice;
    const finalArea =
      areaChoice === 'อื่นๆ (ระบุเอง)' ? customArea.trim() : areaChoice;

    const payload = {
      ...form,
      category: finalCategory || null,
      area: finalArea || null,
    };

    try {
      const { data } = await api.post('/shops', payload);
      setNotice(data.message);
      setForm(initialForm);
      setCategoryChoice(PRESET_CATEGORIES[0]);
      setCustomCategory('');
      setAreaChoice(PRESET_AREAS[0]);
      setCustomArea('');
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
                    <small>
                      {shop.category || 'ร้านค้า'} · {shop.area || 'ไม่ระบุพื้นที่'}
                    </small>
                    <StatusBadge status={shop.status} />
                    <ShopImageUpload shop={shop} onUploaded={(imagePath) => setShops((current) => current.map((item) => (item.shop_id === shop.shop_id ? { ...item, image_path: imagePath } : item)))} />
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
                      <Link
                        className="button button-outline button-small"
                        to={`/merchant/shops/${shop.shop_id}/qr`}
                      >
                        QR รับเงิน
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
              placeholder="ระบุชื่อร้านค้า"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>

          <label>
            หมวดหมู่
            <select
              value={categoryChoice}
              onChange={(e) => setCategoryChoice(e.target.value)}
            >
              {PRESET_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </label>
          {categoryChoice === 'อื่นๆ (ระบุเอง)' && (
            <input
              required
              maxLength="100"
              placeholder="พิมพ์ชื่อหมวดหมู่ที่ต้องการ..."
              value={customCategory}
              onChange={(e) => setCustomCategory(e.target.value)}
            />
          )}

          <label>
            พื้นที่
            <select
              value={areaChoice}
              onChange={(e) => setAreaChoice(e.target.value)}
            >
              {PRESET_AREAS.map((ar) => (
                <option key={ar} value={ar}>
                  {ar}
                </option>
              ))}
            </select>
          </label>
          {areaChoice === 'อื่นๆ (ระบุเอง)' && (
            <input
              required
              maxLength="150"
              placeholder="พิมพ์พื้นที่หรือทำเลร้าน เช่น ซอยวัดอุโมงค์..."
              value={customArea}
              onChange={(e) => setCustomArea(e.target.value)}
            />
          )}

          <label>
            รายละเอียด
            <textarea
              rows="3"
              placeholder="บอกเล่าจุดเด่นหรือสินค้าแนะนำของร้าน"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>

          <p className="fine-print">ร้านใหม่จะอยู่ในสถานะรออนุมัติ (PENDING) ก่อนเปิดให้บริการ</p>
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