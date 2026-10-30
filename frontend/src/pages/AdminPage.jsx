import { useEffect, useState } from 'react';
import api, { getErrorMessage } from '../api';
import AdminPolicyPanel from '../components/AdminPolicyPanel';
import AdminCasesPanel from '../components/AdminCasesPanel';
import AdminMissionsPanel from '../components/AdminMissionsPanel';
import AdminBudgetPanel from '../components/AdminBudgetPanel';
import AdminCoinApprovalsPanel from '../components/AdminCoinApprovalsPanel';

export default function AdminPage() {
  const [shops, setShops] = useState([]);
  const [logs, setLogs] = useState([]);
  const [view, setView] = useState('shops');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [rejectedShop, setRejectedShop] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [reviewError, setReviewError] = useState('');

  async function load() {
    const [shopResponse, logResponse] = await Promise.all([
      api.get('/admin/shops', { params: { status: 'PENDING' } }),
      api.get('/admin/audit-logs', { params: { limit: 50 } }),
    ]);
    setShops(shopResponse.data.shops);
    setLogs(logResponse.data.audit_logs);
  }
  useEffect(() => {
    Promise.all([
      api.get('/admin/shops', { params: { status: 'PENDING' } }),
      api.get('/admin/audit-logs', { params: { limit: 50 } }),
    ]).then(([shopResponse, logResponse]) => {
      setShops(shopResponse.data.shops);
      setLogs(logResponse.data.audit_logs);
    }).catch((requestError) => setError(getErrorMessage(requestError)));
  }, []);

  async function review(shop, status, reason) {
    setBusy(true);
    setError('');
    setReviewError('');
    try {
      await api.patch(`/admin/shops/${shop.shop_id}/status`, { status, reason });
      setRejectedShop(null);
      setRejectionReason('');
      await load();
    } catch (requestError) {
      const message = getErrorMessage(requestError);
      setError(message);
      if (status === 'SUSPENDED') setReviewError(message);
    } finally {
      setBusy(false);
    }
  }

  function openRejectDialog(shop) {
    setRejectedShop(shop);
    setRejectionReason('');
    setReviewError('');
  }

  return (
    <div className="content-stack">
      <div className="section-heading"><div><span className="eyebrow">ADMIN CONSOLE</span><h1>จัดการระบบ</h1><p className="muted">ตรวจสอบคำขอร้านค้า คำร้องของประชาชน และติดตามกิจกรรมสำคัญ</p></div></div>
      <div className="tab-bar"><button className={view === 'shops' ? 'tab active' : 'tab'} onClick={() => setView('shops')}>คำขอร้านค้า <span>{shops.length}</span></button><button className={view === 'budget' ? 'tab active' : 'tab'} onClick={() => setView('budget')}>งบโครงการ</button><button className={view === 'coin-campaigns' ? 'tab active' : 'tab'} onClick={() => setView('coin-campaigns')}>แคมเปญแจกเหรียญ</button><button className={view === 'cases' ? 'tab active' : 'tab'} onClick={() => setView('cases')}>คำร้อง</button><button className={view === 'missions' ? 'tab active' : 'tab'} onClick={() => setView('missions')}>ภารกิจ</button><button className={view === 'policy' ? 'tab active' : 'tab'} onClick={() => setView('policy')}>นโยบายโครงการ</button><button className={view === 'logs' ? 'tab active' : 'tab'} onClick={() => setView('logs')}>Audit log</button></div>
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      {view === 'policy' && <AdminPolicyPanel />}
      {view === 'budget' && <AdminBudgetPanel />}
      {view === 'coin-campaigns' && <AdminCoinApprovalsPanel />}
      {view === 'cases' && <AdminCasesPanel />}
      {view === 'missions' && <AdminMissionsPanel />}
      {view === 'shops' && <section className="card"><div className="section-heading compact"><h2>ร้านที่รออนุมัติ</h2><span className="muted">{shops.length} ร้าน</span></div>
        {shops.length ? <div className="list-rows">{shops.map((shop) => <article className="list-row admin-shop" key={shop.shop_id}><div><strong>{shop.name}</strong><small>{shop.owner_name || shop.owner_email} · {shop.category || 'ร้านค้า'} · {shop.area || 'ไม่ระบุพื้นที่'}</small><p>{shop.description}</p><span className="status-badge status-pending">รออนุมัติ</span></div><div className="button-row"><button className="button button-primary button-small" disabled={busy} onClick={() => review(shop, 'ACTIVE')}>อนุมัติ</button><button className="button button-danger button-small" disabled={busy} onClick={() => openRejectDialog(shop)}>ไม่อนุมัติ</button></div></article>)}</div> : <p className="empty-note">ไม่มีร้านที่รออนุมัติ</p>}
      </section>}
      {view === 'logs' && <section className="card"><div className="section-heading compact"><h2>Audit log ล่าสุด</h2><span className="muted">{logs.length} รายการ</span></div>
        {logs.length ? <div className="table-wrap"><table><thead><tr><th>เวลา</th><th>ผู้กระทำ</th><th>การกระทำ</th><th>รายการ</th><th>รายละเอียด</th></tr></thead><tbody>{logs.map((log) => <tr key={log.audit_id}><td>{new Date(log.created_at).toLocaleString('th-TH')}</td><td>{log.actor_id?.slice(0, 8) || 'ระบบ'}</td><td>{log.action}</td><td>{log.entity_type}</td><td><code>{JSON.stringify(log.detail)}</code></td></tr>)}</tbody></table></div> : <p className="empty-note">ยังไม่มี audit log</p>}
      </section>}
      {rejectedShop && (
        <div className="confirm-overlay" role="presentation" onClick={() => !busy && setRejectedShop(null)}>
          <section
            className="confirm-sheet confirm-sheet-danger"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reject-shop-title"
            onClick={(event) => event.stopPropagation()}
          >
            <span className="eyebrow confirm-danger-label">พิจารณาคำขอร้านค้า</span>
            <h2 id="reject-shop-title">ไม่อนุมัติร้านค้า</h2>
            <p>ระบุเหตุผลที่ไม่อนุมัติร้าน “{rejectedShop.name}” เพื่อแจ้งให้เจ้าของร้านทราบ</p>
            <label>
              เหตุผลที่ไม่อนุมัติ *
              <textarea
                autoFocus
                required
                rows="4"
                maxLength="1000"
                value={rejectionReason}
                onChange={(event) => setRejectionReason(event.target.value)}
                placeholder="ระบุเหตุผลที่เจ้าของร้านควรทราบ"
              />
            </label>
            {reviewError && <p className="notice notice-error" role="alert">{reviewError}</p>}
            <div className="button-row confirm-actions">
              <button className="button button-outline" type="button" disabled={busy} onClick={() => setRejectedShop(null)}>
                ยกเลิก
              </button>
              <button
                className="button button-danger"
                type="button"
                disabled={busy || !rejectionReason.trim()}
                onClick={() => review(rejectedShop, 'SUSPENDED', rejectionReason.trim())}
              >
                {busy ? 'กำลังบันทึก…' : 'ยืนยันไม่อนุมัติ'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
