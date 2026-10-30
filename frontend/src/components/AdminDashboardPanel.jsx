import { useEffect, useState } from 'react';
import api, { getErrorMessage } from '../api';
import { formatBaht } from '../utils/format';

const CHART = { width: 720, height: 220, top: 16, bottom: 28, left: 8, right: 8 };
const dayLabel = (day) => new Date(`${day}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });

// ยอดซื้อรายวัน (ชุดข้อมูลเดียว จึงไม่มีคำอธิบายสี) ชี้ที่แท่งเพื่อดูตัวเลขของวันนั้น
function DailyChart({ trend }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...trend.map((d) => d.gross));
  const plotHeight = CHART.height - CHART.top - CHART.bottom;
  const slot = (CHART.width - CHART.left - CHART.right) / trend.length;
  const barWidth = Math.max(4, slot - 4);
  const active = hover === null ? null : trend[hover];

  return (
    <div className="daily-chart">
      <div className="chart-readout" aria-live="polite">
        {active
          ? <><strong>{dayLabel(active.day)}</strong> ยอดซื้อ {formatBaht(active.gross)} · {active.orders} รายการ · รัฐช่วยจ่าย {formatBaht(active.subsidy)}</>
          : <span className="muted">สูงสุด {formatBaht(max)}</span>}
      </div>
      <svg viewBox={`0 0 ${CHART.width} ${CHART.height}`} role="img" aria-label={`ยอดซื้อรายวัน ${trend.length} วันล่าสุด`} onMouseLeave={() => setHover(null)}>
        <line x1={CHART.left} x2={CHART.width - CHART.right} y1={CHART.top + plotHeight} y2={CHART.top + plotHeight} className="chart-axis" />
        {trend.map((d, i) => {
          const h = d.gross > 0 ? Math.max(2, (d.gross / max) * plotHeight) : 0;
          const x = CHART.left + i * slot + (slot - barWidth) / 2;
          return (
            <g key={d.day} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0}>
              {/* พื้นที่ชี้ใหญ่กว่าแท่ง เพื่อให้ชี้วันที่ยอดน้อยได้ง่าย */}
              <rect x={CHART.left + i * slot} y={CHART.top} width={slot} height={plotHeight} fill="transparent" />
              {h > 0 && <rect x={x} y={CHART.top + plotHeight - h} width={barWidth} height={h} rx="3" className={hover === i ? 'chart-bar active' : 'chart-bar'} />}
              {(i % 5 === 0 || i === trend.length - 1) && <text x={x + barWidth / 2} y={CHART.height - 8} textAnchor="middle" className="chart-label">{dayLabel(d.day)}</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

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

      <div className="dashboard-split">
        <section className="card">
          <h2>ยอดซื้อรายวัน {data.trend_days} วันล่าสุด</h2>
          <DailyChart trend={data.trend} />
        </section>
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
            <div><dt>ประชาชนที่ใช้งานได้</dt><dd>{data.citizens.active} คน</dd></div>
          </dl>
        </section>
      </div>

      <section className="card">
        <h2>ร้านยอดซื้อสูงสุด {data.trend_days} วันล่าสุด</h2>
        {data.top_shops.length ? <div className="table-wrap"><table>
          <thead><tr><th>อันดับ</th><th>ร้าน</th><th>หมวดหมู่</th><th>รายการ</th><th>ยอดซื้อ</th></tr></thead>
          <tbody>{data.top_shops.map((shop, i) => <tr key={shop.shop_id}><td>{i + 1}</td><td>{shop.name}</td><td>{shop.category || '—'}</td><td>{shop.orders}</td><td>{formatBaht(shop.gross)}</td></tr>)}</tbody>
        </table></div> : <p className="empty-note">ยังไม่มียอดซื้อในช่วงนี้</p>}
      </section>
    </div>
  );
}
