import { useState } from 'react';
import api, { getErrorMessage, imageSrc } from '../api';
import { walletErrorMessage } from '../utils/wallet';

const MAX_BYTES = 2 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// อัปโหลดรูปหน้าร้าน ส่งไฟล์เป็น body ตรงๆ; backend ตรวจชนิดไฟล์จากเนื้อไฟล์ซ้ำอีกครั้ง
export default function ShopImageUpload({ shop, onUploaded }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function upload(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    if (!TYPES.includes(file.type)) return setError('รองรับเฉพาะรูป JPG, PNG หรือ WEBP');
    if (file.size > MAX_BYTES) return setError('รูปต้องมีขนาดไม่เกิน 2 MB');
    setBusy(true);
    try {
      const { data } = await api.put(`/shops/${shop.shop_id}/image`, file, { headers: { 'Content-Type': file.type } });
      onUploaded(data.shop.image_path);
    } catch (requestError) {
      setError(walletErrorMessage(requestError.response?.data, getErrorMessage(requestError)));
    } finally {
      setBusy(false);
    }
    return undefined;
  }

  return (
    <div className="shop-image-upload">
      <div className="shop-image-preview">
        {shop.image_path ? <img src={imageSrc(shop.image_path)} alt={`รูปร้าน ${shop.name}`} /> : <span>{shop.name.slice(0, 1)}</span>}
      </div>
      <label className="button button-outline button-small file-button">
        {busy ? 'กำลังอัปโหลด…' : shop.image_path ? 'เปลี่ยนรูปหน้าร้าน' : 'อัปโหลดรูปหน้าร้าน'}
        <input type="file" accept={TYPES.join(',')} onChange={upload} disabled={busy} />
      </label>
      <small className="muted">JPG, PNG หรือ WEBP ไม่เกิน 2 MB</small>
      {error && <p className="notice notice-error" role="alert">{error}</p>}
    </div>
  );
}
