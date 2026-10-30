import { useEffect, useState } from 'react';
import { Inbox, LayoutDashboard, Settings, Store, Tags, Trophy, Wallet } from 'lucide-react';
import api, { getErrorMessage } from '../api';
import AdminPolicyPanel from '../components/AdminPolicyPanel';
import AdminCasesPanel from '../components/AdminCasesPanel';
import AdminMissionsPanel from '../components/AdminMissionsPanel';
import AdminBudgetPanel from '../components/AdminBudgetPanel';
import AdminShopsPanel from '../components/AdminShopsPanel';
import AdminDashboardPanel from '../components/AdminDashboardPanel';
import AdminTemplatesPanel from '../components/AdminTemplatesPanel';

const MENU = [
  { key: 'overview', label: 'ภาพรวม', Icon: LayoutDashboard },
  { key: 'shops', label: 'ร้านค้า', Icon: Store },
  { key: 'budget', label: 'งบโครงการ', Icon: Wallet },
  { key: 'templates', label: 'แม่แบบแคมเปญ', Icon: Tags },
  { key: 'cases', label: 'คำร้อง', Icon: Inbox },
  { key: 'missions', label: 'ภารกิจ', Icon: Trophy },
  { key: 'policy', label: 'นโยบายโครงการ', Icon: Settings },
];

export default function AdminPage() {
  const [view, setView] = useState('overview');
  const [pendingShops, setPendingShops] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/admin/shops', { params: { status: 'PENDING' } })
      .then(({ data }) => setPendingShops(data.shops.length))
      .catch((requestError) => setError(getErrorMessage(requestError)));
  }, []);

  const current = MENU.find((item) => item.key === view);
  return (
    <div className="admin-layout">
      <nav className="admin-sidebar" aria-label="เมนูผู้ดูแลระบบ">
        <span className="eyebrow">ADMIN</span>
        {MENU.map(({ key, label, Icon }) => (
          <button key={key} type="button" className={view === key ? 'admin-menu-item active' : 'admin-menu-item'}
            aria-current={view === key ? 'page' : undefined} onClick={() => setView(key)}>
            <Icon size={18} aria-hidden="true" />
            <span>{label}</span>
            {key === 'shops' && pendingShops > 0 && <b className="admin-menu-badge">{pendingShops}</b>}
          </button>
        ))}
      </nav>
      <div className="admin-content">
        <h1 className="admin-title">{current.label}</h1>
        {error && <p className="notice notice-error" role="alert">{error}</p>}
        {view === 'overview' && <AdminDashboardPanel onOpen={setView} />}
        {view === 'shops' && <AdminShopsPanel onPendingCount={setPendingShops} />}
        {view === 'budget' && <AdminBudgetPanel />}
        {view === 'templates' && <AdminTemplatesPanel />}
        {view === 'cases' && <AdminCasesPanel />}
        {view === 'missions' && <AdminMissionsPanel />}
        {view === 'policy' && <AdminPolicyPanel />}
      </div>
    </div>
  );
}
