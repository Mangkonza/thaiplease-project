import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api, { getErrorMessage } from '../api';
import ShopNav from '../components/ShopNav';
import ShopImageUpload from '../components/ShopImageUpload';
import ShopDetailsForm from '../components/ShopDetailsForm';

export default function ShopManagePage() {
  const { shopId } = useParams();
  const [shop, setShop] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/shops/${shopId}`)
      .then(({ data }) => setShop(data.shop))
      .catch((requestError) => setError(getErrorMessage(requestError)));
  }, [shopId]);

  return (
    <div className="content-stack">
      <div className="section-heading">
        <div>
          <h1>{shop?.name || 'ร้านของฉัน'}</h1>
          <p className="muted">จัดการรูปหน้าร้าน ข้อมูลร้านค้า และเมนูสินค้า</p>
        </div>
      </div>
      <ShopNav shopId={shopId} section="manage" />
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      {shop && (
        <div className="merchant-layout">
          <section className="card form-stack">
            <span className="eyebrow">STOREFRONT PHOTO</span>
            <h2>รูปหน้าร้าน</h2>
            <p className="muted">รูปนี้แสดงในหน้าร้านแนะนำ หน้าร้าน และหน้าจ่ายเงินของลูกค้า</p>
            <ShopImageUpload
              shop={shop}
              onUploaded={(imagePath) => setShop({ ...shop, image_path: imagePath })}
            />
          </section>

          <section className="card form-stack">
            <span className="eyebrow">STOREFRONT & MENU</span>
            <h2>ข้อมูลร้านและเมนูสินค้า</h2>
            <p className="muted">ที่อยู่ เวลาเปิด และสินค้า/เมนูที่ขาย จะแสดงให้ลูกค้าเห็นในหน้าร้านแนะนำ</p>
            <ShopDetailsForm shop={shop} />
          </section>
        </div>
      )}
    </div>
  );
}
