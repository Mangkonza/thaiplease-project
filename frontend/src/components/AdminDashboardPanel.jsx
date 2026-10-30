import { lazy, Suspense, useEffect, useState } from 'react';
import api, { getErrorMessage } from '../api';
import { formatBaht } from '../utils/format';
// Recharts ใหญ่ จึงโหลดเฉพาะตอน Admin เปิดหน้านี้ ไม่ให้หน้าประชาชนต้องโหลดด้วย
const AdminAnalytics = lazy(() => import('./AdminAnalytics'));

export default function AdminDashboardPanel({ onOpen }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/admin/dashboard')
      .then((response) => setData(response.data.dashboard))
      .catch((requestError) => setError(getErrorMessage(requestError)));
  }, []);

  if (error) return <p className="notice notice-error" role="alert">{error}</p>;
  if (!data) return <p className="muted">กำลังโหลดภาพรวม…</p>;

  const tasks = [
    { key: 'shops', label: 'ร้านรออนุมัติ', count: data.pending.shops },
    { key: 'cases', label: 'คำร้องรอพิจารณา', count: data.pending.cases },
  ];

  return (
    <div className="content-stack admin-overview">
      <div className="metric-grid">
        <div className="card metric-card"><span className="muted">ยอดซื้อเดือนนี้</span><strong>{formatBaht(data.month.gross)}</strong><small className="muted">{data.month.orders.toLocaleString('th-TH')} รายการ · ผู้ซื้อ {data.month.buyers} คน</small></div>
        <div className="card metric-card"><span className="muted">รัฐช่วยจ่ายเดือนนี้</span><strong>{formatBaht(data.month.subsidy)}</strong><small className="muted">วันนี้ {formatBaht(data.today.subsidy)}</small></div>
        <div className="card metric-card"><span className="muted">ยอดซื้อวันนี้</span><strong>{formatBaht(data.today.gross)}</strong><small className="muted">{data.today.orders} รายการ</small></div>
        <div className="card metric-card"><span className="muted">ยอดรอโอนให้ร้าน</span><strong>{formatBaht(data.payouts.outstanding)}</strong><small className="muted">โอนแล้ว {formatBaht(data.payouts.paid_out)}</small></div>
      </div>

      <Suspense fallback={<section className="card"><p className="muted">กำลังโหลดสถิติ…</p></section>}><AdminAnalytics /></Suspense>

      <div className="dashboard-split">
        <section className="card">
          <h2>งานที่รอดำเนินการ</h2>
          <div className="list-rows">{tasks.map((task) => (
            <button key={task.key} type="button" className="list-row task-row" onClick={() => onOpen(task.key)}>
              <span>{task.label}</span>
              <b className={task.count ? 'task-count has-items' : 'task-count'}>{task.count}</b>
            </button>
          ))}</div>
          <h2 className="section-gap">ร้านค้าและประชาชน</h2>
          <dl className="receipt-list">
            <div><dt>ร้านเปิดใช้งาน</dt><dd>{data.shops.ACTIVE} ร้าน</dd></div>
            <div><dt>ร้านรออนุมัติ / ระงับ</dt><dd>{data.shops.PENDING} / {data.shops.SUSPENDED} ร้าน</dd></div>
            <div><dt>ร้านปิดชั่วคราว</dt><dd>{data.shops.CLOSED ?? 0} ร้าน</dd></div>
            <div><dt>ประชาชนที่ใช้งานได้</dt><dd>{data.citizens.active} คน</dd></div>
          </dl>
        </section>
        <section className="card">
          <h2>ร้านยอดซื้อสูงสุด {data.trend_days} วันล่าสุด</h2>
        {data.top_shops.length ? <div className="table-wrap"><table>
          <thead><tr><th>อันดับ</th><th>ร้าน</th><th>หมวดหมู่</th><th>รายการ</th><th>ยอดซื้อ</th></tr></thead>
          <tbody>{data.top_shops.map((shop, i) => <tr key={shop.shop_id}><td>{i + 1}</td><td>{shop.name}</td><td>{shop.category || '—'}</td><td>{shop.orders}</td><td>{formatBaht(shop.gross)}</td></tr>)}</tbody>
        </table></div> : <p className="empty-note">ยังไม่มียอดซื้อในช่วงนี้</p>}
        </section>
      </div>
    </div>
  );
}
