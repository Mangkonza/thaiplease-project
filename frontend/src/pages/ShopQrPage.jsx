import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import api, { getErrorMessage } from '../api';
import ShopNav from '../components/ShopNav';
import ShopImageUpload from '../components/ShopImageUpload';
import { buildPayUrl } from '../utils/payment-links';

export default function ShopQrPage() {
  const { shopId } = useParams();
  const [shop, setShop] = useState(null);
  const [qr, setQr] = useState('');
  const [error, setError] = useState('');
  const payUrl = buildPayUrl(window.location.origin, shopId);

  useEffect(() => {
    api.get(`/shops/${shopId}`)
      .then(({ data }) => setShop(data.shop))
      .catch((requestError) => setError(getErrorMessage(requestError)));
    QRCode.toDataURL(payUrl, { width: 520, margin: 2, errorCorrectionLevel: 'M' })
      .then(setQr)
      .catch((qrError) => {
        console.error('Create shop QR failed:', qrError);
        setError('สร้าง QR ไม่สำเร็จ');
      });
  }, [shopId, payUrl]);

  return (
    <div className="content-stack">
      <div className="section-heading"><div><h1>{shop?.name || 'ร้านของฉัน'}</h1><p className="muted">QR รับเงินและรูปหน้าร้าน</p></div></div>
      <ShopNav shopId={shopId} section="qr" />
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      {shop && <div className="merchant-layout">
        <section className="card qr-card">
          <span className="eyebrow">PAYMENT QR</span>
          <h2>QR รับเงิน</h2>
          {shop.status !== 'ACTIVE' && <p className="notice">ร้านยังไม่ได้รับอนุมัติ ลูกค้าจะยังจ่ายเงินผ่าน QR นี้ไม่ได้</p>}
          {qr ? <img className="qr-image" src={qr} alt={`QR รับเงินของ ${shop.name}`} /> : <p className="muted">กำลังสร้าง QR…</p>}
          <strong className="qr-shop-name">{shop.name}</strong>
          <p className="muted">ให้ลูกค้าเปิดเมนู "สแกนจ่าย" แล้วสแกน QR นี้ จากนั้นลูกค้าระบุยอดและใส่ PIN</p>
          {qr && <a className="button button-primary" href={qr} download={`thaiplease-qr-${shopId}.png`}>ดาวน์โหลด QR</a>}
          <small className="muted qr-link">{payUrl}</small>
        </section>
        <section className="card form-stack">
          <span className="eyebrow">STOREFRONT</span>
          <h2>รูปหน้าร้าน</h2>
          <p className="muted">รูปนี้แสดงในหน้าค้นหาร้าน หน้าร้าน และหน้าจ่ายเงินของลูกค้า</p>
          <ShopImageUpload shop={shop} onUploaded={(imagePath) => setShop({ ...shop, image_path: imagePath })} />
        </section>
      </div>}
    </div>
  );
}
