import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { useAuth } from './auth-context';
import AuthPage from './pages/AuthPage';
import ShopsPage from './pages/ShopsPage';
import ShopPage from './pages/ShopPage';
import CheckoutPage from './pages/CheckoutPage';
import CoinsPage from './pages/CoinsPage';
import MerchantShopsPage from './pages/MerchantShopsPage';
import CampaignsPage from './pages/CampaignsPage';
import CampaignResultPage from './pages/CampaignResultPage';
import AdminPage from './pages/AdminPage';

function ProtectedRoute({ roles, children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/shops" replace />;
  return children;
}

export default function App() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  function logout() {
    signOut();
    navigate('/shops');
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" to="/shops"><span className="brand-mark">ท</span> ThaiPlease</Link>
        <nav className="nav-links">
          <Link to="/shops">ค้นหาร้าน</Link>
          {user?.role === 'CITIZEN' && <Link to="/coins">เหรียญของฉัน</Link>}
          {user?.role === 'MERCHANT' && <Link to="/merchant/shops">จัดการร้าน</Link>}
          {user?.role === 'ADMIN' && <Link to="/admin/shops">ผู้ดูแลระบบ</Link>}
        </nav>
        <div className="account-actions">
          {user ? (
            <>
              <span className="user-name">{user.display_name || user.email}</span>
              <button className="button button-quiet" onClick={logout}>ออกจากระบบ</button>
            </>
          ) : <Link className="button button-primary" to="/login">เข้าสู่ระบบ</Link>}
        </div>
      </header>

      <main className="page-wrap">
        <Routes>
          <Route path="/" element={<Navigate to="/shops" replace />} />
          <Route path="/shops" element={<ShopsPage />} />
          <Route path="/shops/:shopId" element={<ShopPage />} />
          <Route path="/checkout/:shopId" element={<ProtectedRoute roles={['CITIZEN']}><CheckoutPage /></ProtectedRoute>} />
          <Route path="/coins" element={<ProtectedRoute roles={['CITIZEN']}><CoinsPage /></ProtectedRoute>} />
          <Route path="/merchant/shops" element={<ProtectedRoute roles={['MERCHANT']}><MerchantShopsPage /></ProtectedRoute>} />
          <Route path="/merchant/shops/:shopId/campaigns" element={<ProtectedRoute roles={['MERCHANT']}><CampaignsPage /></ProtectedRoute>} />
          <Route path="/merchant/shops/:shopId/campaigns/:campaignId" element={<ProtectedRoute roles={['MERCHANT']}><CampaignResultPage /></ProtectedRoute>} />
          <Route path="/admin/shops" element={<ProtectedRoute roles={['ADMIN']}><AdminPage /></ProtectedRoute>} />
          <Route path="/login" element={user ? <Navigate to="/shops" replace /> : <AuthPage />} />
          <Route path="*" element={<section className="empty-state"><h1>ไม่พบหน้าที่ต้องการ</h1><Link to="/shops">กลับไปค้นหาร้าน</Link></section>} />
        </Routes>
      </main>
      <footer className="site-footer"><span>ThaiPlease</span><span>สนับสนุนร้านค้าในชุมชน</span></footer>
    </div>
  );
}
