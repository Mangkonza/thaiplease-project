import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api, { getErrorMessage } from '../api';

export default function ShopsPage() {
  const [params, setParams] = useSearchParams();
  const [form, setForm] = useState({ search: params.get('search') || '', category: params.get('category') || '', area: params.get('area') || '' });
  const [shops, setShops] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.get('/shops', { params: Object.fromEntries([...params].filter(([, value]) => value)) })
      .then(({ data }) => { if (!cancelled) setShops(data.shops); })
      .catch((requestError) => { if (!cancelled) setError(getErrorMessage(requestError)); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [params]);

  function search(event) {
    event.preventDefault();
    setError('');
    const next = Object.fromEntries(Object.entries(form).filter(([, value]) => value.trim()));
    setParams(next);
  }

  return (
    <div className="content-stack">
      <section className="hero-banner">
        <div><span className="eyebrow">GOOD PLACES, GOOD DAYS</span><h1>ร้านโปรดในชุมชน<br />รอให้คุณไปค้นพบ</h1><p>ทุกการแวะเวียน ช่วยให้ร้านท้องถิ่นเติบโตไปด้วยกัน</p></div>
        <div className="hero-illustration" aria-hidden="true"><span>♡</span><i>LOCAL<br />FINDS</i></div>
      </section>
      <section className="card search-card">
        <form className="search-form" onSubmit={search}>
          <label className="search-field">ค้นหาร้าน<input placeholder="ชื่อร้านหรือคำอธิบาย" value={form.search} onChange={(e) => setForm({ ...form, search: e.target.value })} /></label>
          <label>หมวดหมู่<input placeholder="เช่น คาเฟ่" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></label>
          <label>พื้นที่<input placeholder="เช่น บางเขน" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} /></label>
          <button className="button button-dark">ค้นหาร้าน</button>
        </form>
      </section>
      <div className="section-heading"><div><span className="eyebrow">THE NEIGHBORHOOD</span><h2>ร้านที่น่าแวะ</h2></div><span className="muted">{shops.length} ร้าน</span></div>
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      {busy ? <p className="muted">กำลังโหลดร้านค้า…</p> : shops.length ? (
        <div className="shop-grid">{shops.map((shop, index) => (
          <Link className={`shop-card shop-color-${index % 4}`} to={`/shops/${shop.shop_id}`} key={shop.shop_id}>
            <div className="shop-card-art"><span>{shop.category || 'LOCAL SHOP'}</span><b>{(shop.name || '?').slice(0, 1)}</b></div>
            <div className="shop-card-body"><span className="eyebrow">{shop.area || 'ใกล้คุณ'}</span><h3>{shop.name}</h3><p>{shop.description || 'ร้านค้าในชุมชน พร้อมต้อนรับคุณ'}</p><span className="link-arrow">ดูรายละเอียด <b>↗</b></span></div>
          </Link>
        ))}</div>
      ) : <div className="empty-state"><h3>ยังไม่พบร้านที่ตรงกับการค้นหา</h3><p>ลองเปลี่ยนคำค้นหา หรือเลือกพื้นที่อื่น</p></div>}
    </div>
  );
}
