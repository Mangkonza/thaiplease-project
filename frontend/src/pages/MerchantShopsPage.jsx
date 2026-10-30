import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
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

const initialForm = { name: '', category: '', area: '', description: '' };

export default function MerchantShopsPage() {
  const [shops, setShops] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [categoryChoice, setCategoryChoice] = useState(PRESET_CATEGORIES[0]);
  const [customCategory, setCustomCategory] = useState('');
  const [areaChoice, setAreaChoice] = useState(PRESET_AREAS[0]);
  const [customArea, setCustomArea] = useState('');

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

    const payload = {
      ...form,
      category: finalCategory || null,
      area: finalArea || null,
    };

    try {
      const { data } = editingShopId
        ? await api.put(`/shops/${editingShopId}`, payload)
        : await api.post('/shops', payload);
      setNotice(editingShopId ? 'ส่งคำขอพิจารณาร้านอีกครั้งแล้ว' : data.message);
      setEditingShopId('');
      setForm(initialForm);
      setCategoryChoice(PRESET_CATEGORIES[0]);
      setCustomCategory('');
      setAreaChoice(PRESET_AREAS[0]);
      setCustomArea('');
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
    setCategoryChoice(PRESET_CATEGORIES[0]);
    setCustomCategory('');
    setAreaChoice(PRESET_AREAS[0]);
    setCustomArea('');
  }

  async function deleteShop(shop) {
    setDeletingShopId(shop.shop_id);
    setError('');
    setNotice('');
    try {
      const { data } = await api.delete(`/shops/${shop.shop_id}`);
      setNotice(data.message === 'Shop deleted' ? 'ลบร้านค้าเรียบร้อยแล้ว' : data.message);
      await loadShops();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setDeletingShopId('');
    }
  }

  async function changeShopStatus(shop, status) {
    const action = status === 'CLOSED' ? 'ปิดร้าน' : 'เปิดร้านอีกครั้ง';
    setUpdatingShopId(shop.shop_id);
    setError('');
    setNotice('');
    try {
      await api.patch(`/shops/${shop.shop_id}/status`, { status });
      setNotice(`${action}เรียบร้อยแล้ว`);
      await loadShops();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setUpdatingShopId('');
    }
  }

  function askConfirmation(action, shop) {
    setConfirmation({ action, shop });
  }

  async function confirmShopAction() {
    if (!confirmation) return;
    const { action, shop } = confirmation;
    setConfirmation(null);
    if (action === 'delete' || action === 'cancel') {
      await deleteShop(shop);
    } else {
      await changeShopStatus(shop, action === 'close' ? 'CLOSED' : 'ACTIVE');
    }
  }

  return (
    <div className="content-stack">
      <div className="section-heading">
        <div>
          <span className="eyebrow">MERCHANT SPACE</span>
          <h1>จัดการร้านของคุณ</h1>
          <p className="muted">เพิ่มร้าน รออนุมัติ และจัดการแคมเปญสำหรับร้านที่เปิดใช้งาน</p>
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
                    <ShopImageUpload shop={shop} onUploaded={(imagePath) => setShops((current) => current.map((item) => (item.shop_id === shop.shop_id ? { ...item, image_path: imagePath } : item)))} />
                  </div>
                  {shop.status === 'ACTIVE' ? (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
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
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
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
              {confirmation.action === 'cancel' ? 'ยกเลิกคำร้องร้านค้า' : confirmation.action === 'delete' ? 'ลบร้านค้า' : confirmation.action === 'close' ? 'ปิดร้านค้า' : 'เปิดร้านค้าอีกครั้ง'}
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
                className={confirmation.action === 'delete'
                  ? 'button button-danger'
                  : confirmation.action === 'cancel'
                    ? 'button button-warning'
                    : 'button button-primary'}
                type="button"
                onClick={confirmShopAction}
              >
                {confirmation.action === 'cancel' ? 'ยืนยันยกเลิกคำร้อง' : confirmation.action === 'delete' ? 'ยืนยันลบร้าน' : confirmation.action === 'close' ? 'ยืนยันปิดร้าน' : 'ยืนยันเปิดร้าน'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const labels = { ACTIVE: 'เปิดใช้งาน', PENDING: 'รออนุมัติ', SUSPENDED: 'ไม่อนุมัติ', CLOSED: 'ปิดร้าน' };
  return <span className={`status-badge status-${status?.toLowerCase()}`}>{labels[status] || status}</span>;
}