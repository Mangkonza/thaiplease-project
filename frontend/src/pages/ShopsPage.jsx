import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api, { getErrorMessage } from '../api';
import ShopCard from '../components/ShopCard';

// รายการตัวเลือกหมวดหมู่และพื้นที่มาตรฐาน
const CATEGORIES = [
  'ทั้งหมด',
  'อาหารและเครื่องดื่ม',
  'คาเฟ่',
  'ร้านอาหารตามสั่ง',
  'ของหวานและเบเกอรี่',
  'ของใช้และบริการ',
];

const AREAS = [
  'ทั้งหมด',
  'กำแพงแสน',
  'เมืองนครปฐม',
  'บางเขน',
  'มหาวิทยาลัย',
];

export default function ShopsPage() {
  const [params, setParams] = useSearchParams();
  const [form, setForm] = useState({
    search: params.get('search') || '',
    category: params.get('category') || '',
    area: params.get('area') || '',
  });
  const [shops, setShops] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/shops', {
        params: Object.fromEntries([...params].filter(([, value]) => value)),
      })
      .then(({ data }) => {
        if (!cancelled) setShops(data.shops);
      })
      .catch((requestError) => {
        if (!cancelled) setError(getErrorMessage(requestError));
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [params]);

  function search(event) {
    event.preventDefault();
    setError('');
    const next = {};
    if (form.search.trim()) next.search = form.search.trim();
    if (form.category && form.category !== 'ทั้งหมด') next.category = form.category;
    if (form.area && form.area !== 'ทั้งหมด') next.area = form.area;
    setParams(next);
  }

  return (
    <div className="content-stack">
      <section className="hero-banner">
        <div>
          <span className="eyebrow">RECOMMENDED FOR YOU</span>
          <h1>
            ร้านแนะนำ
            <br />
            <span className="glow-text">ใช้สิทธิ์รัฐช่วยจ่ายได้</span>
          </h1>
          <p>ร้านในชุมชนที่ร่วมโครงการ จ่ายผ่าน G-Wallet แล้วรับเหรียญสะสมทุกครั้ง</p>
        </div>
        <div className="hero-illustration" aria-hidden="true">
          <span>✦</span>
          <i>
            LOCAL
            <br />
            FINDS
          </i>
        </div>
      </section>

      <section className="card search-card">
        <form className="search-form" onSubmit={search}>
          <label className="search-field">
            ค้นหาร้าน
            <input
              placeholder="ชื่อร้านหรือคำอธิบาย (พิมพ์ใกล้เคียงได้)"
              value={form.search}
              onChange={(e) => setForm({ ...form, search: e.target.value })}
            />
          </label>

          <label>
            หมวดหมู่
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat === 'ทั้งหมด' ? '' : cat}>
                  {cat}
                </option>
              ))}
            </select>
          </label>

          <label>
            พื้นที่
            <select
              value={form.area}
              onChange={(e) => setForm({ ...form, area: e.target.value })}
            >
              {AREAS.map((ar) => (
                <option key={ar} value={ar === 'ทั้งหมด' ? '' : ar}>
                  {ar}
                </option>
              ))}
            </select>
          </label>

          <button className="button button-dark">ค้นหา</button>
        </form>
      </section>

      <div className="section-heading">
        <div>
          <span className="eyebrow">THE NEIGHBORHOOD</span>
          <h2>ร้านที่ร่วมโครงการ</h2>
        </div>
        <span className="muted">{shops.length} ร้าน</span>
      </div>

      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}

      {busy ? (
        <p className="muted">กำลังโหลดร้านค้า…</p>
      ) : shops.length ? (
        <div className="shop-grid">
          {shops.map((shop, index) => <ShopCard key={shop.shop_id} shop={shop} index={index} />)}
        </div>
      ) : (
        <div className="empty-state">
          <h3>ยังไม่พบร้านที่ตรงกับการค้นหา</h3>
          <p>ลองเปลี่ยนคำค้นหา หรือเลือกหมวดหมู่/พื้นที่อื่น</p>
        </div>
      )}
    </div>
  );
}