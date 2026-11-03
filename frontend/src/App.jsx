import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Coins, House, ShieldCheck, Store, Wallet } from 'lucide-react';
import { useAuth } from './auth-context';
import AuthPage from './pages/AuthPage';
import HomePage from './pages/HomePage';
import ShopsPage from './pages/ShopsPage';
import ShopPage from './pages/ShopPage';
import CheckoutPage from './pages/CheckoutPage';
import CoinsPage from './pages/CoinsPage';
import MerchantShopsPage from './pages/MerchantShopsPage';
import ShopDashboardPage from './pages/ShopDashboardPage';
import CampaignsPage from './pages/CampaignsPage';
import CampaignResultPage from './pages/CampaignResultPage';
import AdminPage from './pages/AdminPage';
import ScanPage from './pages/ScanPage';
import WalletPage from './pages/WalletPage';
import SlipPage from './pages/SlipPage';
import ShopQrPage from './pages/ShopQrPage';
import ShopManagePage from './pages/ShopManagePage';
import { homePathFor } from './utils/payment-links';

function ProtectedRoute({ roles, children }) {
  const { user } = useAuth();
  const location = useLocation();
  // ยังไม่ได้เข้าระบบ: ไปหน้า login ก่อน แล้วกลับมาหน้าเดิม เช่น ลิงก์จาก QR ของร้าน
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to={homePathFor(user)} replace />;
  return children;
}

// เข้าระบบแล้วไปหน้าที่ตั้งใจเปิดไว้ก่อนถูกพามา login หรือหน้าแรกของบทบาท
function LoginRoute() {
  const { user } = useAuth();
  const location = useLocation();
  if (user) return <Navigate to={location.state?.from || homePathFor(user)} replace />;
  return <AuthPage />;
}

// ลูกค้าสแกน QR ร้านแล้วเข้าลิงก์ /pay/:requestId ให้พาไปหน้าสรุปยอดเพื่อจ่าย
function PayLink() {
  const { requestId } = useParams();
  return <Navigate to={`/checkout/${requestId}`} replace />;
}

export default function App() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function onLogout() {
    logout();
    navigate('/login');
  }

  const roleNav = {
    CITIZEN: [['/home', 'หน้าแรก', House], ['/shops', 'ร้านแนะนำ', Store], ['/wallet', 'กระเป๋าเงิน', Wallet], ['/coins', 'เหรียญของฉัน', Coins]],
    MERCHANT: [['/merchant/shops', 'จัดการร้าน', Store]],
    ADMIN: [['/admin/shops', 'ระบบ', ShieldCheck]],
  };

  const navItems = user ? roleNav[user.role] || [] : [];
  const citizen = (page) => <ProtectedRoute roles={['CITIZEN']}>{page}</ProtectedRoute>;
  const merchant = (page) => <ProtectedRoute roles={['MERCHANT']}>{page}</ProtectedRoute>;

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" to="/">
          <span className="brand-mark">n</span>ThaiPlease
        </Link>
        <nav className="nav-links">
          {navItems.map(([path, label, Icon]) => (
            <NavLink key={path} to={path} className={({ isActive }) => (isActive ? 'active' : '')}>
              <Icon size={16} aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="account-actions">
          {user ? (
            <>
              <span className="user-name">{user.display_name || user.email}</span>
              <button className="button button-quiet button-small" onClick={onLogout}>ออกจากระบบ</button>
            </>
          ) : (
            <Link className="button button-primary button-small" to="/login">เข้าสู่ระบบ</Link>
          )}
        </div>
      </header>
      <main className="page-wrap">
        <Routes>
          <Route path="/" element={<Navigate to={homePathFor(user)} replace />} />
          <Route path="/home" element={citizen(<HomePage />)} />
          <Route path="/shops" element={citizen(<ShopsPage />)} />
          <Route path="/shops/:shopId" element={citizen(<ShopPage />)} />
          <Route path="/scan" element={citizen(<ScanPage />)} />
          <Route path="/pay/:requestId" element={citizen(<PayLink />)} />
          <Route path="/checkout/:requestId" element={citizen(<CheckoutPage />)} />
          <Route path="/wallet" element={citizen(<WalletPage />)} />
          <Route path="/slips/:paymentId" element={citizen(<SlipPage />)} />
          <Route path="/coins" element={citizen(<CoinsPage />)} />
          <Route path="/merchant/shops" element={merchant(<MerchantShopsPage />)} />
          <Route path="/merchant/shops/:shopId/dashboard" element={merchant(<ShopDashboardPage />)} />
          <Route path="/merchant/shops/:shopId/qr" element={merchant(<ShopQrPage />)} />
          <Route path="/merchant/shops/:shopId/manage" element={merchant(<ShopManagePage />)} />
          <Route path="/merchant/shops/:shopId/campaigns" element={merchant(<CampaignsPage />)} />
          <Route path="/merchant/shops/:shopId/campaigns/:campaignId" element={merchant(<CampaignResultPage />)} />
          <Route path="/admin/shops" element={<ProtectedRoute roles={['ADMIN']}><AdminPage /></ProtectedRoute>} />
          <Route path="/login" element={<LoginRoute />} />
          <Route path="*" element={<section className="empty-state"><h1>ไม่พบหน้าที่ต้องการ</h1><Link to={homePathFor(user)}>กลับหน้าแรก</Link></section>} />
        </Routes>
      </main>
      <footer className="site-footer"><span>ThaiPlease</span><span>สนับสนุนร้านค้าในชุมชน</span></footer>
    </div>
  );
}
