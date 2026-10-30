import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Clock, MapPin, Navigation } from 'lucide-react';
import api, { getErrorMessage, imageSrc } from '../api';
import { mapsUrl, menuPriceText } from '../utils/shop-info';

export default function ShopPage() {
  const { shopId } = useParams();
  const [shop, setShop] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/shops/public/${shopId}`)
      .then(({ data }) => setShop(data.shop))
      .catch((requestError) => setError(getErrorMessage(requestError)));
  }, [shopId]);

  if (error) return <p className="notice notice-error" role="alert">{error}</p>;
  if (!shop) return <p className="muted">กำลังโหลดข้อมูลร้าน…</p>;

  const mapLink = mapsUrl(shop);
  const menu = shop.menu_items || [];

  return (
    <div className="content-stack">
      <Link className="back-link" to="/shops">← กลับไปร้านแนะนำ</Link>
      <section className="storefront">
        <div className={shop.image_path ? 'storefront-art has-image' : 'storefront-art'}>
          {shop.image_path && <img src={imageSrc(shop.image_path)} alt={`รูปร้าน ${shop.name}`} />}
          <span>{shop.category || 'COMMUNITY STORE'}</span>
          {!shop.image_path && <b>{shop.name.slice(0, 1)}</b>}
        </div>
        <div className="storefront-details">
          <span className="eyebrow">{shop.area || 'ร้านค้าในชุมชน'}</span>
          <h1>{shop.name}</h1>
          <p>{shop.description || 'ร้านค้าที่พร้อมให้บริการและต้อนรับคุณ'}</p>
          <div className="store-meta"><span>หมวดหมู่ <strong>{shop.category || 'ทั่วไป'}</strong></span><span>พื้นที่ <strong>{shop.area || 'ไม่ระบุ'}</strong></span></div>
          <div className="button-row">
            <Link className="button button-primary" to="/scan">สแกนจ่ายที่ร้าน <span>→</span></Link>
            {mapLink && <a className="button button-outline" href={mapLink} target="_blank" rel="noopener noreferrer"><Navigation size={15} /> เปิดใน Google Maps</a>}
          </div>
        </div>
      </section>

      <div className="shop-info-grid">
        <section className="card">
          <div className="section-title-row"><h2>สินค้าที่ขาย</h2><span className="muted">{menu.length} รายการ</span></div>
          {menu.length ? (
            <ul className="menu-list">
              {menu.map((item) => <li key={item.name}><span>{item.name}</span><b>{menuPriceText(item.price)}</b></li>)}
            </ul>
          ) : <p className="empty-note">ร้านยังไม่ได้ใส่รายการสินค้า</p>}
        </section>
        <section className="card shop-location">
          <h2>ร้านอยู่ที่ไหน</h2>
          <p className="shop-card-meta"><MapPin size={16} aria-hidden="true" /><span>{shop.address || 'ร้านยังไม่ได้ใส่ที่อยู่'}</span></p>
          <p className="shop-card-meta"><Clock size={16} aria-hidden="true" /><span>{shop.opening_hours || 'ไม่ได้ระบุเวลาเปิด-ปิด'}</span></p>
          {mapLink && <a className="text-link" href={mapLink} target="_blank" rel="noopener noreferrer">ดูเส้นทางใน Google Maps ↗</a>}
        </section>
      </div>

      <section className="card info-strip"><span className="info-icon">✳</span><div><h3>ทุกยอดใช้จ่าย ได้รับเหรียญสะสม</h3><p>รับ 1 เหรียญต่อทุกยอดชำระสุทธิ 25 บาท และรับโบนัสเพิ่มเติมเมื่อร้านมีแคมเปญ</p></div></section>
    </div>
  );
}
