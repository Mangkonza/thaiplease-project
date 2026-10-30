import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import api, { getErrorMessage } from '../api';

const toForm = (shop) => ({
  address: shop.address || '',
  opening_hours: shop.opening_hours || '',
  latitude: shop.latitude ?? '',
  longitude: shop.longitude ?? '',
  menu_items: (shop.menu_items || []).map((item) => ({ name: item.name, price: item.price ?? '' })),
});

// ร้านแก้ข้อมูลที่ลูกค้าเห็นในหน้าร้านแนะนำ: ที่อยู่ เวลาเปิด พิกัด และสินค้าที่ขาย
export default function ShopDetailsForm({ shop }) {
  const [form, setForm] = useState(() => toForm(shop));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const setItem = (index, field, value) => setForm((current) => ({
    ...current,
    menu_items: current.menu_items.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
  }));

  async function save(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await api.put(`/shops/${shop.shop_id}/details`, {
        ...form,
        latitude: form.latitude === '' ? null : Number(form.latitude),
        longitude: form.longitude === '' ? null : Number(form.longitude),
        menu_items: form.menu_items
          .filter((item) => item.name.trim())
          .map((item) => ({ name: item.name, price: item.price === '' ? null : Number(item.price) })),
      });
      setNotice('บันทึกข้อมูลร้านแล้ว');
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form-stack" onSubmit={save}>
      <label>ที่อยู่ร้าน<input value={form.address} maxLength="300" onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="เลขที่ ถนน ตำบล อำเภอ จังหวัด" /></label>
      <label>เวลาเปิด-ปิด<input value={form.opening_hours} maxLength="100" onChange={(e) => setForm({ ...form, opening_hours: e.target.value })} placeholder="เช่น 07:00–17:00 ปิดวันจันทร์" /></label>
      <div className="form-grid">
        <label>ละติจูด<input type="number" step="0.000001" min="-90" max="90" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} placeholder="14.018420" /></label>
        <label>ลองจิจูด<input type="number" step="0.000001" min="-180" max="180" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} placeholder="99.982310" /></label>
      </div>
      <p className="fine-print">พิกัดไม่บังคับ คัดลอกได้จาก Google Maps (คลิกขวาที่ตำแหน่งร้าน) ถ้าไม่ใส่ ลูกค้าจะค้นหาด้วยชื่อและที่อยู่</p>

      <div className="section-title-row"><strong>สินค้าที่ขาย</strong><span className="muted">{form.menu_items.length}/30</span></div>
      {form.menu_items.map((item, index) => (
        // แถวในฟอร์มยังไม่มี id จนกว่าจะบันทึก จึงใช้ลำดับเป็น key
        <div className="menu-edit-row" key={index}>
          <input aria-label={`ชื่อสินค้าที่ ${index + 1}`} value={item.name} maxLength="120" onChange={(e) => setItem(index, 'name', e.target.value)} placeholder="ชื่อสินค้า" />
          <input aria-label={`ราคาสินค้าที่ ${index + 1}`} type="number" min="0" step="0.01" value={item.price} onChange={(e) => setItem(index, 'price', e.target.value)} placeholder="ราคา" />
          <button type="button" className="button button-quiet" aria-label={`ลบสินค้าที่ ${index + 1}`} onClick={() => setForm({ ...form, menu_items: form.menu_items.filter((_, i) => i !== index) })}><Trash2 size={16} /></button>
        </div>
      ))}
      <button type="button" className="button button-outline button-small" disabled={form.menu_items.length >= 30} onClick={() => setForm({ ...form, menu_items: [...form.menu_items, { name: '', price: '' }] })}><Plus size={14} /> เพิ่มสินค้า</button>

      {error && <p className="notice notice-error" role="alert">{error}</p>}
      {notice && <p className="notice notice-success" role="status">{notice}</p>}
      <button className="button button-primary" disabled={busy}>{busy ? 'กำลังบันทึก…' : 'บันทึกข้อมูลร้าน'}</button>
    </form>
  );
}
