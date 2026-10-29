import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from './auth-context';
import AuthPage from './pages/AuthPage';
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
// ต้องเปลี่ยนหน้าจากที่นี่ที่เดียว ถ้า AuthPage สั่ง navigate เองด้วย สองคำสั่งจะแข่งกันและหน้านี้ชนะ
function LoginRoute() {
  const { user } = useAuth();
  const from = useLocation().state?.from;
  return user ? <Navigate to={from || homePathFor(user)} replace /> : <AuthPage />;
}

// ลิงก์ใน QR รับเงินของร้าน พาไปหน้าจ่ายเงินของร้านนั้น
function PayLink() {
  const { shopId } = useParams();
  return <Navigate to={`/checkout/${shopId}`} replace />;
}

const NAV_LINKS = {
  CITIZEN: [['/shops', 'ค้นหาร้าน'], ['/scan', 'สแกนจ่าย'], ['/wallet', 'กระเป๋าเงิน'], ['/coins', 'เหรียญของฉัน']],
  MERCHANT: [['/merchant/shops', 'จัดการร้าน']],
  ADMIN: [['/admin/shops', 'ผู้ดูแลระบบ']],
};

export default function App() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const citizen = (page) => <ProtectedRoute roles={['CITIZEN']}>{page}</ProtectedRoute>;
  const merchant = (page) => <ProtectedRoute roles={['MERCHANT']}>{page}</ProtectedRoute>;

  function logout() {
    signOut();
    navigate('/login');
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" to={homePathFor(user)}><span className="brand-mark">ท</span> ThaiPlease</Link>
        <nav className="nav-links">
          {(NAV_LINKS[user?.role] || []).map(([to, label]) => <Link key={to} to={to}>{label}</Link>)}
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
          <Route path="/" element={<Navigate to={homePathFor(user)} replace />} />
          <Route path="/shops" element={citizen(<ShopsPage />)} />
          <Route path="/shops/:shopId" element={citizen(<ShopPage />)} />
          <Route path="/scan" element={citizen(<ScanPage />)} />
          <Route path="/pay/:shopId" element={citizen(<PayLink />)} />
          <Route path="/checkout/:shopId" element={citizen(<CheckoutPage />)} />
          <Route path="/wallet" element={citizen(<WalletPage />)} />
          <Route path="/slips/:paymentId" element={citizen(<SlipPage />)} />
          <Route path="/coins" element={citizen(<CoinsPage />)} />
          <Route path="/merchant/shops" element={merchant(<MerchantShopsPage />)} />
          <Route path="/merchant/shops/:shopId/dashboard" element={merchant(<ShopDashboardPage />)} />
          <Route path="/merchant/shops/:shopId/qr" element={merchant(<ShopQrPage />)} />
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
