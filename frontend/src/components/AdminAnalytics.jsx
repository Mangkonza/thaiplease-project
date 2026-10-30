import { useEffect, useState } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { X } from 'lucide-react';
import api, { getErrorMessage } from '../api';
import { formatBaht } from '../utils/format';
import { METRICS, GRANULARITIES, changePercent, periodLabel, subLabel } from '../utils/admin-analytics';

// สีของกราฟ: ช่วงนี้ = น้ำเงินหลักของธีม, ช่วงก่อน = เทาเส้นประ (บริบท ไม่ใช่อีกหมวดหนึ่ง)
const CURRENT = '#3279f9';
const PREVIOUS = '#80868b';
const GRID = '#eceff3';
const AXIS = { fontSize: 11, fill: '#5f6368' };
// ข้อความใน tooltip ใช้สีตัวอักษร ไม่ใช้สีของกราฟ
const TOOLTIP = { itemStyle: { color: '#121317' }, contentStyle: { borderRadius: 12, borderColor: '#e8eaed', fontSize: 12 } };

const formatValue = (metric, value) => (METRICS[metric].money ? formatBaht(value) : `${Number(value).toLocaleString('th-TH')} ${METRICS[metric].unit}`);
const compactAxis = (value) => (value >= 1000 ? `${(value / 1000).toLocaleString('th-TH', { maximumFractionDigits: 1 })}k` : value);

function ChangeBadge({ current, previous }) {
  const change = changePercent(current, previous);
  if (change === null) return <small className="muted">ช่วงก่อนไม่มีข้อมูล</small>;
  const direction = change > 0 ? 'up' : change < 0 ? 'down' : 'flat';
  return <small className={`change-badge change-${direction}`}>{change > 0 ? '▲' : change < 0 ? '▼' : '•'} {Math.abs(change).toLocaleString('th-TH', { maximumFractionDigits: 1 })}% จากช่วงก่อน</small>;
}

function ChartTooltip({ active, payload, granularity, metric }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <strong>{periodLabel(granularity, row.period)}</strong>
      {payload.map((item) => (
        <div key={item.dataKey}><i style={{ background: item.color }} />{item.name}<b>{formatValue(metric, item.value)}</b></div>
      ))}
      <small className="muted">คลิกเพื่อดูรายละเอียด</small>
    </div>
  );
}

function DetailPanel({ granularity, period, onClose }) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/admin/analytics/detail', { params: { granularity, period } })
      .then(({ data }) => setDetail(data.detail))
      .catch((requestError) => setError(getErrorMessage(requestError)));
  }, [granularity, period]);

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const t = detail?.totals;
  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true" aria-label={`รายละเอียด ${periodLabel(granularity, period)}`} onClick={onClose}>
      <section className="detail-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="section-title-row">
          <div><span className="eyebrow">DETAIL</span><h2>{periodLabel(granularity, period)}</h2></div>
          <button type="button" className="button button-quiet" aria-label="ปิด" onClick={onClose}><X size={18} /></button>
        </div>
        {error && <p className="notice notice-error" role="alert">{error}</p>}
        {!detail && !error && <p className="muted">กำลังโหลดรายละเอียด…</p>}
        {t && <>
          <div className="metric-grid detail-metrics">
            <div className="metric-card"><span className="muted">ยอดซื้อ</span><strong>{formatBaht(t.gross)}</strong><small className="muted">{t.orders} รายการ</small></div>
            <div className="metric-card"><span className="muted">รัฐช่วยจ่าย</span><strong>{formatBaht(t.subsidy)}</strong><small className="muted">ใช้สิทธิ์ {t.rights_uses} ครั้ง</small></div>
            <div className="metric-card"><span className="muted">คนใช้สิทธิ์</span><strong>{t.active_users} คน</strong><small className="muted">ไม่นับซ้ำ</small></div>
            <div className="metric-card"><span className="muted">ผู้เข้าร่วมใหม่</span><strong>{t.new_participants} คน</strong><small className="muted">ร้านใหม่ {t.new_shops} ร้าน</small></div>
          </div>
          <h3>ยอดซื้อราย{subLabel(detail.sub_granularity)}</h3>
          <div className="chart-box small">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={detail.breakdown} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} interval="preserveStartEnd" tickFormatter={(label) => (detail.sub_granularity === 'day' ? label.slice(8) : detail.sub_granularity === 'month' ? label.slice(5) : label.slice(0, 2))} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} tickFormatter={compactAxis} />
                <Tooltip {...TOOLTIP} cursor={{ fill: 'rgba(50,121,249,.06)' }} formatter={(value) => [formatBaht(value), 'ยอดซื้อ']} />
                <Bar dataKey="gross" name="ยอดซื้อ" fill={CURRENT} radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <h3>ร้านในช่วงนี้</h3>
          {detail.shops.length ? <div className="table-wrap"><table>
            <thead><tr><th>ร้าน</th><th>หมวด / พื้นที่</th><th>รายการ</th><th>ลูกค้า</th><th>ยอดซื้อ</th><th>รัฐช่วยจ่าย</th></tr></thead>
            <tbody>{detail.shops.map((shop) => <tr key={shop.shop_id}><td>{shop.name}</td><td>{shop.category || '—'} · {shop.area || '—'}</td><td>{shop.orders}</td><td>{shop.customers}</td><td>{formatBaht(shop.gross)}</td><td>{formatBaht(shop.subsidy)}</td></tr>)}</tbody>
          </table></div> : <p className="empty-note">ไม่มีรายการซื้อในช่วงนี้</p>}
        </>}
      </section>
    </div>
  );
}

// กราฟสถิติโครงการของ Admin: เลือกวัน/เดือน/ปี เทียบช่วงก่อน และกดช่วงไหนก็ได้เพื่อดูรายละเอียด
export default function AdminAnalytics() {
  const [granularity, setGranularity] = useState('day');
  const [metric, setMetric] = useState('gross');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [openPeriod, setOpenPeriod] = useState(null);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.get('/admin/analytics', { params: { granularity } })
      .then(({ data: body }) => { if (!cancelled) { setData(body.analytics); setError(''); } })
      .catch((requestError) => { if (!cancelled) setError(getErrorMessage(requestError)); });
    return () => { cancelled = true; };
  }, [granularity]);

  if (error) return <p className="notice notice-error" role="alert">{error}</p>;
  if (!data || data.granularity !== granularity) return <section className="card"><p className="muted">กำลังโหลดสถิติ…</p></section>;

  const { totals } = data;
  const series = data.series.map((row) => ({ ...row, previous_value: row.previous[metric] }));
  const unitName = GRANULARITIES[granularity].unit;
  const cards = ['total_participants', 'active_users', 'rights_uses', 'subsidy', 'gross'];
  // ตารางแยกหมวดมีเฉพาะยอดซื้อขาย ตัวชี้วัดผู้เข้าร่วมจึงแสดงเป็นยอดซื้อแทน
  const categoryMetric = metric in (data.by_category[0] || METRICS) && !metric.endsWith('participants') ? metric : 'gross';

  return (
    <section className="card analytics-card">
      <div className="analytics-toolbar">
        <div><span className="eyebrow">PROGRAM ANALYTICS</span><h2>สถิติโครงการ</h2></div>
        <div className="segmented" role="tablist" aria-label="ช่วงเวลา">
          {Object.entries(GRANULARITIES).map(([key, option]) => (
            <button key={key} type="button" role="tab" aria-selected={granularity === key} className={granularity === key ? 'active' : ''} onClick={() => setGranularity(key)}>{option.label}</button>
          ))}
        </div>
      </div>

      <div className="compare-grid">
        {cards.map((key) => (
          <button key={key} type="button" className={metric === key ? 'compare-card active' : 'compare-card'} onClick={() => setMetric(key)} aria-pressed={metric === key}>
            <span>{METRICS[key].label}</span>
            <strong>{formatValue(key, totals.current[key])}</strong>
            <ChangeBadge current={totals.current[key]} previous={totals.previous[key]} />
          </button>
        ))}
      </div>
      <p className="fine-print">ตัวเลขเป็นยอดรวม {GRANULARITIES[granularity].span} ล่าสุด เทียบกับ {GRANULARITIES[granularity].span} ก่อนหน้า · กดการ์ดเพื่อเปลี่ยนตัวชี้วัดในกราฟ</p>

      <div className="analytics-chart-head">
        <h3>{METRICS[metric].label}ราย{unitName}</h3>
        <div className="chip-row">
          {Object.keys(METRICS).filter((key) => !cards.includes(key)).map((key) => (
            <button key={key} type="button" className={metric === key ? 'chip active' : 'chip'} onClick={() => setMetric(key)}>{METRICS[key].label}</button>
          ))}
          <button type="button" className="chip" onClick={() => setShowTable((on) => !on)}>{showTable ? 'ดูเป็นกราฟ' : 'ดูเป็นตาราง'}</button>
        </div>
      </div>

      {showTable ? (
        <div className="table-wrap"><table>
          <thead><tr><th>ช่วง</th><th>{METRICS[metric].label}</th><th>ช่วงก่อน</th><th /></tr></thead>
          <tbody>{series.map((row) => (
            <tr key={row.period}><td>{periodLabel(granularity, row.period)}</td><td>{formatValue(metric, row[metric])}</td><td>{formatValue(metric, row.previous_value)}</td>
              <td><button type="button" className="text-button" onClick={() => setOpenPeriod(row.period)}>รายละเอียด</button></td></tr>
          ))}</tbody>
        </table></div>
      ) : (
        <div className="chart-box">
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="period" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(period) => periodLabel(granularity, period, true)} interval="preserveStartEnd" minTickGap={16} />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} width={48} tickFormatter={compactAxis} allowDecimals={false} />
              <Tooltip cursor={{ fill: 'rgba(50,121,249,.06)' }} content={<ChartTooltip granularity={granularity} metric={metric} />} />
              <Legend verticalAlign="top" align="right" height={28} iconType="plainline" wrapperStyle={{ fontSize: 12, color: '#3c4043' }} />
              <Bar dataKey={metric} name={`${GRANULARITIES[granularity].span}นี้`} fill={CURRENT} radius={[4, 4, 0, 0]} maxBarSize={32} cursor="pointer"
                onClick={(entry) => setOpenPeriod(entry.payload?.period ?? entry.period)} />
              <Line dataKey="previous_value" name={`${GRANULARITIES[granularity].span}ก่อน`} stroke={PREVIOUS} strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={{ r: 4 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="analytics-split">
        <div>
          <h3>ผู้เข้าร่วมโครงการสะสม</h3>
          <div className="chart-box small">
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} onClick={(state) => state?.activeLabel && setOpenPeriod(state.activeLabel)}>
                <defs><linearGradient id="participantsFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={CURRENT} stopOpacity={0.25} /><stop offset="100%" stopColor={CURRENT} stopOpacity={0.02} /></linearGradient></defs>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis dataKey="period" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(period) => periodLabel(granularity, period, true)} interval="preserveStartEnd" minTickGap={16} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} width={40} allowDecimals={false} />
                <Tooltip {...TOOLTIP} formatter={(value, name, item) => [`${value} คน (ใหม่ ${item.payload.new_participants})`, 'สะสม']} labelFormatter={(period) => periodLabel(granularity, period)} />
                <Area dataKey="total_participants" name="สะสม" stroke={CURRENT} strokeWidth={2} fill="url(#participantsFill)" activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div>
          <h3>{METRICS[categoryMetric].label}แยกตามหมวดร้าน</h3>
          <div className="chart-box small">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.by_category} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid horizontal={false} stroke={GRID} />
                <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={compactAxis} />
                <YAxis type="category" dataKey="label" tick={AXIS} tickLine={false} axisLine={false} width={120} />
                <Tooltip {...TOOLTIP} cursor={{ fill: 'rgba(50,121,249,.06)' }} formatter={(value) => [formatValue(categoryMetric, value), METRICS[categoryMetric].label]} />
                <Bar dataKey={categoryMetric} fill={CURRENT} radius={[0, 4, 4, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <h3>แยกตามพื้นที่ ({GRANULARITIES[granularity].span}นี้)</h3>
      <div className="table-wrap"><table>
        <thead><tr><th>พื้นที่</th><th>ร้านที่มียอด</th><th>รายการ</th><th>ใช้สิทธิ์</th><th>คนใช้สิทธิ์</th><th>ยอดซื้อ</th><th>รัฐช่วยจ่าย</th></tr></thead>
        <tbody>{data.by_area.map((row) => <tr key={row.label}><td>{row.label}</td><td>{row.shops}</td><td>{row.orders}</td><td>{row.rights_uses}</td><td>{row.active_users}</td><td>{formatBaht(row.gross)}</td><td>{formatBaht(row.subsidy)}</td></tr>)}</tbody>
      </table></div>

      {openPeriod && <DetailPanel granularity={granularity} period={openPeriod} onClose={() => setOpenPeriod(null)} />}
    </section>
  );
}
