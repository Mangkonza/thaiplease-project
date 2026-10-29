import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api';

const SECTIONS = [
  { key: 'dashboard', label: 'ยอดขายและ AI' },
  { key: 'campaigns', label: 'แคมเปญ' },
];

// แถบเมนูของร้าน: สลับยอดขาย/แคมเปญ และสลับร้านสำหรับเจ้าของที่มีหลายร้าน
export default function ShopNav({ shopId, section }) {
  const navigate = useNavigate();
  const [shops, setShops] = useState([]);

  useEffect(() => {
    api.get('/shops/my')
      .then(({ data }) => setShops(data.shops.filter((shop) => shop.status === 'ACTIVE')))
      // ตัวเลือกสลับร้านเป็นแค่ทางลัด ถ้าโหลดไม่ได้ เมนูส่วนอื่นยังใช้ได้
      .catch((error) => console.error('Load shops for navigation failed:', error));
  }, []);

  return (
    <nav className="shop-nav">
      <div className="tab-bar">
        {SECTIONS.map((item) => (
          <Link key={item.key} className={item.key === section ? 'tab active' : 'tab'} to={`/merchant/shops/${shopId}/${item.key}`}>{item.label}</Link>
        ))}
      </div>
      <div className="shop-nav-tools">
        {shops.length > 1 && (
          <select aria-label="เลือกร้าน" value={shopId} onChange={(event) => navigate(`/merchant/shops/${event.target.value}/${section}`)}>
            {shops.map((shop) => <option key={shop.shop_id} value={shop.shop_id}>{shop.name}</option>)}
          </select>
        )}
        <Link className="button button-outline button-small" to="/merchant/shops" state={{ stay: true }}>ร้านทั้งหมด / เพิ่มร้าน</Link>
      </div>
    </nav>
  );
}
