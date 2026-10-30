import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api, { getErrorMessage, imageSrc } from '../api';

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

  return (
    <div className="content-stack">
      <Link className="back-link" to="/shops">← กลับไปค้นหาร้าน</Link>
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
            {/* ทางลัดสำหรับ demo แทนการสแกน QR จริงที่หน้าร้าน */}
            <Link className="button button-outline" to={`/checkout/${shop.shop_id}`}>จำลองการสแกนร้านนี้</Link>
          </div>
        </div>
      </section>
      <section className="card info-strip"><span className="info-icon">✳</span><div><h3>ทุกยอดใช้จ่าย ได้รับเหรียญสะสม</h3><p>รับ 1 เหรียญต่อทุกยอดชำระสุทธิ 25 บาท และรับโบนัสเพิ่มเติมเมื่อร้านมีแคมเปญ</p></div></section>
    </div>
  );
}
