import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
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

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const initialForm = { name: '', category: '', area: '', description: '' };

export default function MerchantShopsPage() {
  const [shops, setShops] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [categoryChoice, setCategoryChoice] = useState(PRESET_CATEGORIES[0]);
  const [customCategory, setCustomCategory] = useState('');
  const [areaChoice, setAreaChoice] = useState(PRESET_AREAS[0]);
  const [customArea, setCustomArea] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [menuItems, setMenuItems] = useState([]);

  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [deletingShopId, setDeletingShopId] = useState('');
  const [updatingShopId, setUpdatingShopId] = useState('');
  const [editingShopId, setEditingShopId] = useState('');
  const [confirmation, setConfirmation] = useState(null);
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

  function onSelectImage(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) {
      setError('รูปภาพต้องเป็นไฟล์ JPG, PNG หรือ WEBP');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError('รูปภาพต้องมีขนาดไม่เกิน 2 MB');
      return;
    }
    setError('');
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  function removeImage() {
    setImageFile(null);
    setImagePreview('');
  }

  const setMenuItem = (index, field, value) => setMenuItems((current) =>
    current.map((item, i) => (i === index ? { ...item, [field]: value } : item))
  );
  const addMenuItem = () => setMenuItems((current) => [...current, { name: '', price: '' }]);
  const removeMenuItem = (index) => setMenuItems((current) => current.filter((_, i) => i !== index));

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

    const formattedMenuItems = menuItems
      .filter((item) => item.name.trim())
      .map((item) => ({ name: item.name.trim(), price: item.price === '' ? null : Number(item.price) }));

    const payload = {
      ...form,
      category: finalCategory || null,
      area: finalArea || null,
      menu_items: formattedMenuItems,
    };

    try {
      const { data } = editingShopId
        ? await api.put(`/shops/${editingShopId}`, payload)
        : await api.post('/shops', payload);

      if (!editingShopId && imageFile && data.shop?.shop_id) {
        try {
          await api.put(`/shops/${data.shop.shop_id}/image`, imageFile, {
            headers: { 'Content-Type': imageFile.type },
          });
        } catch (imgErr) {
          console.error('Upload shop image error:', imgErr);
        }
      }

      setNotice(editingShopId ? 'ส่งคำขอพิจารณาร้านอีกครั้งแล้ว' : data.message);
      setEditingShopId('');
      setForm(initialForm);
      setCategoryChoice(PRESET_CATEGORIES[0]);
      setCustomCategory('');
      setAreaChoice(PRESET_AREAS[0]);
      setCustomArea('');
      setImageFile(null);
      setImagePreview('');
      setMenuItems([]);
      await loadShops();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  function editRejectedShop(shop) {
    const categoryIsPreset = PRESET_CATEGORIES.includes(shop.category);
    const areaIsPreset = PRESET_AREAS.includes(shop.area);
    setEditingShopId(shop.shop_id);
    setForm({
      name: shop.name || '',
      category: shop.category || '',
      area: shop.area || '',
      description: shop.description || '',
    });
    setCategoryChoice(!shop.category ? '' : categoryIsPreset ? shop.category : 'อื่นๆ (ระบุเอง)');
    setCustomCategory(categoryIsPreset ? '' : shop.category || '');
    setAreaChoice(!shop.area ? '' : areaIsPreset ? shop.area : 'อื่นๆ (ระบุเอง)');
    setCustomArea(areaIsPreset ? '' : shop.area || '');
    setError('');
    setNotice('');
  }

  function cancelEdit() {
    setEditingShopId('');
    setForm(initialForm);
    setImageFile(null);
    setImagePreview('');
    setMenuItems([]);
  }

  function askConfirmation(action, shop) {
    setConfirmation({ action, shop });
  }

  async function handleConfirm() {
    if (!confirmation) return;
    const { action, shop } = confirmation;
    setConfirmation(null);

    if (action === 'delete') {
      setDeletingShopId(shop.shop_id);
      setError('');
      try {
        const { data } = await api.delete(`/shops/${shop.shop_id}`);
        setNotice(data.message);
        await loadShops();
      } catch (requestError) {
        setError(getErrorMessage(requestError));
      } finally {
        setDeletingShopId('');
      }
      return;
    }

    if (action === 'cancel') {
      setDeletingShopId(shop.shop_id);
      setError('');
      try {
        const { data } = await api.delete(`/shops/${shop.shop_id}`);
        setNotice(data.message || 'ยกเลิกคำร้องเปิดร้านแล้ว');
        await loadShops();
      } catch (requestError) {
        setError(getErrorMessage(requestError));
      } finally {
        setDeletingShopId('');
      }
      return;
    }

    const status = action === 'close' ? 'CLOSED' : 'ACTIVE';
    setUpdatingShopId(shop.shop_id);
    setError('');
    try {
      await api.patch(`/shops/${shop.shop_id}/status`, { status });
      setNotice(action === 'close' ? 'ปิดร้านแล้ว' : 'เปิดร้านอีกครั้งแล้ว');
      await loadShops();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setUpdatingShopId('');
    }
  }

  return (
    <div className="content-stack">
      <div className="section-heading">
        <div>
          <h1>จัดการร้านค้า</h1>
          <p className="muted">
            สร้างร้านใหม่ รอการอนุมัติจากแอดมิน และจัดการร้านสำหรับเปิดรับเงินและดูยอดขาย
          </p>
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
                    {shop.status === 'SUSPENDED' && shop.rejection_reason && (
                      <p className="shop-rejection-reason">
                        <strong>เหตุผลที่ไม่อนุมัติ:</strong> {shop.rejection_reason}
                      </p>
                    )}
                    <ShopImageUpload
                      shop={shop}
                      onUploaded={(imagePath) =>
                        setShops((current) =>
                          current.map((item) => (item.shop_id === shop.shop_id ? { ...item, image_path: imagePath } : item))
                        )
                      }
                    />
                  </div>
                  {shop.status === 'ACTIVE' ? (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
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
                      <Link
                        className="button button-outline button-small"
                        to={`/merchant/shops/${shop.shop_id}/manage`}
                      >
                        จัดการร้าน
                      </Link>
                      <button
                        className="button button-outline button-small"
                        type="button"
                        disabled={updatingShopId === shop.shop_id}
                        onClick={() => askConfirmation('close', shop)}
                      >
                        {updatingShopId === shop.shop_id ? 'กำลังปิด…' : 'ปิดร้าน'}
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <Link
                        className="button button-outline button-small"
                        to={`/merchant/shops/${shop.shop_id}/manage`}
                      >
                        จัดการร้าน
                      </Link>
                      {shop.status === 'SUSPENDED' ? (
                        <>
                          <button
                            className="button button-outline button-small"
                            type="button"
                            onClick={() => editRejectedShop(shop)}
                          >
                            แก้ไขและส่งพิจารณาใหม่
                          </button>
                          <button
                            className="button button-danger button-small"
                            type="button"
                            disabled={deletingShopId === shop.shop_id}
                            onClick={() => askConfirmation('delete', shop)}
                          >
                            {deletingShopId === shop.shop_id ? 'กำลังลบ…' : 'ลบร้าน'}
                          </button>
                        </>
                      ) : shop.status === 'CLOSED' ? (
                        <>
                          <button
                            className="button button-outline button-small"
                            type="button"
                            disabled={updatingShopId === shop.shop_id}
                            onClick={() => askConfirmation('reopen', shop)}
                          >
                            {updatingShopId === shop.shop_id ? 'กำลังเปิด…' : 'เปิดร้านอีกครั้ง'}
                          </button>
                          <button
                            className="button button-danger button-small"
                            type="button"
                            disabled={deletingShopId === shop.shop_id}
                            onClick={() => askConfirmation('delete', shop)}
                          >
                            {deletingShopId === shop.shop_id ? 'กำลังลบ…' : 'ลบร้านถาวร'}
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="muted small-text">รอเปิดใช้งาน</span>
                          <button
                            className="button button-warning-soft button-small"
                            type="button"
                            disabled={deletingShopId === shop.shop_id}
                            onClick={() => askConfirmation('cancel', shop)}
                          >
                            {deletingShopId === shop.shop_id ? 'กำลังยกเลิก…' : 'ยกเลิกคำร้อง'}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-note">ยังไม่มีร้านค้า เริ่มต้นสร้างร้านของคุณได้เลย</p>
          )}
        </section>

        <form className="card form-stack" onSubmit={createShop}>
          <span className="eyebrow">{editingShopId ? 'EDIT STORE' : 'NEW STORE'}</span>
          <h2>{editingShopId ? 'แก้ไขร้านและส่งพิจารณาใหม่' : 'สร้างร้านใหม่'}</h2>

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
              <option value="">ไม่ระบุ</option>
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
              <option value="">ไม่ระบุ</option>
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

          {!editingShopId && (
            <>
              <div className="section-gap">
                <span className="eyebrow">STOREFRONT PHOTO</span>
                <label style={{ display: 'block', marginBottom: '6px' }}>รูปหน้าร้าน (ไม่บังคับ)</label>
                <div className="shop-image-upload">
                  <div className="shop-image-preview">
                    {imagePreview ? (
                      <img src={imagePreview} alt="พรีวิวรูปหน้าร้าน" />
                    ) : (
                      <span>{form.name ? form.name.slice(0, 1) : '?'}</span>
                    )}
                  </div>
                  <div>
                    <label className="button button-outline button-small file-button">
                      {imagePreview ? 'เปลี่ยนรูปหน้าร้าน' : 'อัปโหลดรูปหน้าร้าน'}
                      <input type="file" accept={IMAGE_TYPES.join(',')} onChange={onSelectImage} disabled={busy} />
                    </label>
                    {imagePreview && (
                      <button
                        type="button"
                        className="button button-quiet button-small"
                        onClick={removeImage}
                        style={{ marginLeft: '8px' }}
                      >
                        ลบรูป
                      </button>
                    )}
                    <div><small className="muted">JPG, PNG หรือ WEBP ไม่เกิน 2 MB</small></div>
                  </div>
                </div>
              </div>

              <div className="section-gap">
                <div className="section-title-row">
                  <strong>เมนูและสินค้าแนะนำ (ไม่บังคับ)</strong>
                  <span className="muted">{menuItems.length}/30</span>
                </div>
                <p className="muted" style={{ fontSize: '12px', marginTop: '2px', marginBottom: '10px' }}>
                  ระบุรายการสินค้าที่ขายพร้อมราคาได้ตั้งแต่ตอนสร้างร้าน
                </p>
                {menuItems.map((item, index) => (
                  <div className="menu-edit-row" key={index} style={{ marginBottom: '8px' }}>
                    <input
                      aria-label={`ชื่อสินค้าที่ ${index + 1}`}
                      value={item.name}
                      maxLength="120"
                      onChange={(e) => setMenuItem(index, 'name', e.target.value)}
                      placeholder="ชื่อสินค้า/เมนู"
                    />
                    <input
                      aria-label={`ราคาสินค้าที่ ${index + 1}`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.price}
                      onChange={(e) => setMenuItem(index, 'price', e.target.value)}
                      placeholder="ราคา (บาท)"
                    />
                    <button
                      type="button"
                      className="button button-quiet"
                      aria-label={`ลบสินค้าที่ ${index + 1}`}
                      onClick={() => removeMenuItem(index)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="button button-outline button-small"
                  disabled={menuItems.length >= 30}
                  onClick={addMenuItem}
                >
                  <Plus size={14} /> เพิ่มเมนูสินค้า
                </button>
              </div>
            </>
          )}

          <p className="fine-print">
            {editingShopId
              ? 'เมื่อส่งคำขอ ร้านจะกลับไปรอแอดมินพิจารณา (PENDING)'
              : 'ร้านใหม่จะอยู่ในสถานะรออนุมัติ (PENDING) ก่อนเปิดให้บริการ'}
          </p>
          <div className="button-row">
            <button className="button button-primary" disabled={busy}>
              {busy ? 'กำลังบันทึก…' : editingShopId ? 'ส่งคำขอพิจารณาใหม่' : 'ส่งคำขอสร้างร้าน'}
            </button>
            {editingShopId && (
              <button className="button button-outline" type="button" disabled={busy} onClick={cancelEdit}>
                ยกเลิก
              </button>
            )}
          </div>
        </form>
      </div>

      {confirmation && (
        <div className="confirm-overlay" role="presentation" onClick={() => setConfirmation(null)}>
          <section
            className={`confirm-sheet ${['delete', 'cancel'].includes(confirmation.action) ? 'confirm-sheet-danger' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="shop-confirm-title"
            aria-describedby="shop-confirm-message"
            onClick={(event) => event.stopPropagation()}
          >
            <span className={`eyebrow ${['delete', 'cancel'].includes(confirmation.action) ? 'confirm-danger-label' : ''}`}>
              ยืนยันการดำเนินการ
            </span>
            <h2 id="shop-confirm-title">
              {confirmation.action === 'cancel'
                ? 'ยกเลิกคำร้องร้านค้า'
                : confirmation.action === 'delete'
                ? 'ลบร้านค้า'
                : confirmation.action === 'close'
                ? 'ปิดร้านค้า'
                : 'เปิดร้านค้าอีกครั้ง'}
            </h2>
            <p id="shop-confirm-message">
              {confirmation.action === 'cancel'
                ? `ต้องการยกเลิกคำร้องขอเปิดร้าน "${confirmation.shop.name}" ใช่ไหม? ระบบจะนำคำร้องนี้ออกจากรายการร้านของคุณ`
                : confirmation.action === 'delete'
                ? `ต้องการลบร้าน "${confirmation.shop.name}" แบบถาวรใช่ไหม? การลบไม่สามารถย้อนกลับได้ และหากมีธุรกรรมอ้างอิง ระบบจะไม่อนุญาตให้ลบ`
                : confirmation.action === 'close'
                ? `ต้องการปิดร้าน "${confirmation.shop.name}" ใช่ไหม? ร้านจะไม่แสดงบนระบบ แต่ข้อมูลและธุรกรรมจะยังคงอยู่ และสามารถเปิดร้านอีกครั้งได้`
                : `ต้องการเปิดร้าน "${confirmation.shop.name}" อีกครั้งใช่ไหม? ร้านจะกลับมาแสดงบนระบบ`}
            </p>
            <div className="button-row confirm-actions">
              <button className="button button-outline" type="button" onClick={() => setConfirmation(null)}>
                ยกเลิก
              </button>
              <button
                className={
                  confirmation.action === 'delete'
                    ? 'button button-danger'
                    : confirmation.action === 'cancel'
                    ? 'button button-warning'
                    : 'button button-primary'
                }
                type="button"
                onClick={handleConfirm}
              >
                ยืนยัน
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    ACTIVE: { label: 'เปิดใช้งาน', className: 'status-badge status-active' },
    PENDING: { label: 'รออนุมัติ', className: 'status-badge status-pending' },
    SUSPENDED: { label: 'ไม่อนุมัติ', className: 'status-badge status-suspended' },
    CLOSED: { label: 'ปิดร้าน', className: 'status-badge status-draft' },
  };
  const config = map[status] || { label: status, className: 'status-badge' };
  return <span className={config.className}>{config.label}</span>;
}
