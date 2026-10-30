import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Coins, History, Plus, ScanLine, Store } from 'lucide-react';
import api, { getErrorMessage } from '../api';
import { useAuth } from '../auth-context';
import ShopCard from '../components/ShopCard';
import { formatBaht } from '../utils/format';

const PREVIEW_SHOPS = 4;

function RightsMeter({ label, remaining, cap }) {
  const percent = cap > 0 ? Math.max(0, Math.min(100, (Number(remaining) / Number(cap)) * 100)) : 0;
  return (
    <div className="rights-meter">
      <div><span>{label}</span><strong>{formatBaht(remaining)}</strong></div>
      <div className="rights-track" aria-hidden="true"><span style={{ width: `${percent}%` }} /></div>
      <small>จากวงเงิน {formatBaht(cap)}</small>
    </div>
  );
}

// หน้าแรกของประชาชน: กระเป๋าเงิน สิทธิ์รัฐช่วยจ่าย ปุ่มลัด และร้านแนะนำ แบบแอปไทยช่วยไทยพลัส
export default function HomePage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api.get('/users/me/wallet'),
      api.get('/users/me/subsidy'),
      api.get('/users/me/coins'),
      api.get('/shops'),
    ])
      .then(([wallet, subsidy, coins, shops]) => setData({
        wallet: wallet.data,
        subsidy: subsidy.data,
        coins: coins.data.balance,
        shops: shops.data.shops,
      }))
      .catch((requestError) => setError(getErrorMessage(requestError)));
  }, []);

  if (!data) return error ? <p className="notice notice-error" role="alert">{error}</p> : <p className="muted">กำลังโหลดหน้าแรก…</p>;

  const { wallet, subsidy, coins, shops } = data;
  const { policy } = subsidy;

  return (
    <div className="content-stack home-page">
      <header className="home-greeting">
        <span className="eyebrow">สวัสดี {user?.display_name || ''}</span>
        <h1>ช้อปร้านในชุมชน<br /><span className="glow-text">รัฐช่วยจ่าย {policy.copay_percent}%</span></h1>
      </header>

      <div className="home-top">
        <section className="wallet-hero home-wallet">
          <span className="eyebrow">G-WALLET (จำลอง)</span>
          <p>ยอดเงินคงเหลือ</p>
          <strong>{formatBaht(wallet.balance)}</strong>
          <div className="wallet-actions">
            <Link className="wallet-action" to="/scan"><span><ScanLine size={22} /></span>สแกนจ่าย</Link>
            <Link className="wallet-action" to="/wallet#topup"><span><Plus size={22} /></span>เติมเงิน</Link>
          </div>
        </section>

        <section className="card rights-card">
          <div className="section-title-row">
            <h2>สิทธิ์รัฐช่วยจ่าย</h2>
            <span className="rights-badge">{policy.copay_percent}%</span>
          </div>
          <RightsMeter label="คงเหลือวันนี้" remaining={subsidy.remaining.today} cap={policy.daily_cap} />
          <RightsMeter label="คงเหลือเดือนนี้" remaining={subsidy.remaining.month} cap={policy.monthly_cap} />
          <p className="fine-print">วงเงินที่เหลือไม่ทบไปเดือนถัดไป</p>
        </section>
      </div>

      <nav className="quick-actions" aria-label="เมนูลัด">
        <Link to="/shops"><span className="quick-icon"><Store size={22} /></span>ร้านแนะนำ</Link>
        <Link to="/coins"><span className="quick-icon"><Coins size={22} /></span>เหรียญ {Number(coins).toLocaleString('th-TH')}</Link>
        <Link to="/wallet"><span className="quick-icon"><History size={22} /></span>ประวัติรายการ</Link>
      </nav>

      <div className="section-heading">
        <div>
          <span className="eyebrow">RECOMMENDED</span>
          <h2>ร้านแนะนำ</h2>
        </div>
        <Link className="button button-outline button-small" to="/shops">ดูทั้งหมด <ArrowUpRight size={14} /></Link>
      </div>
      {shops.length ? (
        <div className="shop-grid shop-grid-four">
          {shops.slice(0, PREVIEW_SHOPS).map((shop, index) => <ShopCard key={shop.shop_id} shop={shop} index={index} />)}
        </div>
      ) : <p className="empty-note">ยังไม่มีร้านที่เปิดให้บริการ</p>}
    </div>
  );
}
