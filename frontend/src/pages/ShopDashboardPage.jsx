import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Store,
  Target,
  TriangleAlert,
} from 'lucide-react';
import api from '../services/api';
import {
  aiErrorMessage,
  bangkokToday,
  describeKpi,
  describeParameters,
  formatChange,
  formatDateTime,
  formatNumber,
  formatPeriod,
  shiftDate,
} from '../utils/format';

const METRIC_CARDS = [
  { key: 'revenue', label: 'ยอดขายสุทธิ', unit: 'บาท' },
  { key: 'orders', label: 'จำนวนออเดอร์', unit: 'รายการ' },
  { key: 'unique_buyers', label: 'ผู้ซื้อ (ไม่ซ้ำ)', unit: 'คน' },
  { key: 'new_customers', label: 'ลูกค้าใหม่', unit: 'คน' },
  { key: 'repeat_customers', label: 'ลูกค้าซื้อซ้ำ', unit: 'คน' },
  { key: 'aov', label: 'ยอดเฉลี่ยต่อออเดอร์ (AOV)', unit: 'บาท' },
];

const PERIOD_TABS = [
  { value: 'week', label: 'รายสัปดาห์' },
  { value: 'month', label: 'รายเดือน' },
];

function MetricCard({ label, unit, value, previous, change, previousLabel }) {
  const isPositive = change > 0;
  const isNegative = change < 0;
  const badgeStyle = {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '12px',
    fontSize: '0.75rem',
    fontWeight: '600',
    backgroundColor: isPositive ? '#ecfdf5' : isNegative ? '#fff1f2' : '#f1f5f9',
    color: isPositive ? '#059669' : isNegative ? '#e11d48' : '#64748b',
  };

  return (
    <div style={{
      background: '#fff',
      borderRadius: '16px',
      border: '1px solid #e2e8f0',
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      <div>
        <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>{label}</p>
        <div style={{ marginTop: '8px', display: 'flex', alignItems: 'baseline', gap: '6px' }}>
          <span style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#1e293b' }}>
            {formatNumber(value)}
          </span>
          {value !== null && <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{unit}</span>}
        </div>
      </div>
      <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={badgeStyle}>{formatChange(change)}</span>
        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{previousLabel}: {formatNumber(previous)}</span>
      </div>
    </div>
  );
}

function SuggestionCard({ suggestion }) {
  return (
    <div style={{
      background: '#fff',
      borderRadius: '16px',
      border: '1px solid #e2e8f0',
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{
          fontSize: '0.75rem',
          fontWeight: 'bold',
          color: '#2e7d32',
          background: '#e8f5e9',
          padding: '2px 10px',
          borderRadius: '12px',
        }}>
          ทางเลือกที่ {suggestion.rank}
        </span>
        <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontFamily: 'monospace' }}>
          {suggestion.template_code}
        </span>
      </div>
      <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 'bold', color: '#1e293b' }}>
        {suggestion.template_name}
      </h4>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {describeParameters(suggestion.parameters).map((text) => (
          <span key={text} style={{
            fontSize: '0.75rem',
            background: '#f1f5f9',
            color: '#334155',
            padding: '4px 8px',
            borderRadius: '6px',
          }}>
            {text}
          </span>
        ))}
      </div>
      <p style={{ margin: 0, fontSize: '0.875rem', color: '#475569', lineHeight: 1.6, flex: 1 }}>
        {suggestion.reason}
      </p>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '0.75rem',
        color: '#64748b',
        paddingTop: '12px',
        borderTop: '1px solid #f1f5f9',
      }}>
        <Target style={{ width: 14, height: 14 }} />
        <span>KPI เป้าหมาย: <strong style={{ color: '#1e293b' }}>{describeKpi(suggestion.target_kpi)}</strong></span>
      </div>
    </div>
  );
}

function NumberCheck({ check }) {
  if (!check || check.checked === 0) return null;
  if (check.unverified.length === 0) {
    return (
      <p style={{ margin: '16px 0 0', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: '#15803d', fontWeight: '500' }}>
        <BadgeCheck style={{ width: 16, height: 16 }} />
        ตัวเลขที่ AI อ้างถึง {check.checked} ค่า ตรงกับข้อมูลของร้านทั้งหมด
      </p>
    );
  }
  return (
    <p style={{ margin: '16px 0 0', display: 'flex', alignItems: 'flex-start', gap: '6px', fontSize: '0.8rem', color: '#92400e', fontWeight: '500' }}>
      <TriangleAlert style={{ width: 16, height: 16, flexShrink: 0 }} />
      ตัวเลขที่ตรวจสอบกับข้อมูลของร้านไม่ได้: {check.unverified.join(', ')} โปรดตรวจสอบก่อนตัดสินใจ
    </p>
  );
}

function ReportView({ report }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{
        background: '#fffbeb',
        border: '1px solid #fef3c7',
        borderRadius: '16px',
        padding: '20px',
      }}>
        <p style={{ margin: '0 0 6px', fontSize: '0.8rem', fontWeight: 'bold', color: '#b45309' }}>ปัญหาที่พบ</p>
        <p style={{ margin: '0 0 8px', fontSize: '1.1rem', fontWeight: 'bold', color: '#1e293b' }}>{report.problem}</p>
        <p style={{ margin: 0, fontSize: '0.9rem', color: '#475569', lineHeight: 1.6 }}>{report.summary}</p>
        {report.possible_causes.length > 0 && (
          <div style={{ marginTop: '16px' }}>
            <p style={{ margin: '0 0 6px', fontSize: '0.8rem', fontWeight: '600', color: '#64748b' }}>สาเหตุที่เป็นไปได้</p>
            <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.875rem', color: '#475569' }}>
              {report.possible_causes.map((cause) => <li key={cause} style={{ marginBottom: '4px' }}>{cause}</li>)}
            </ul>
          </div>
        )}
        <NumberCheck check={report.number_check} />
      </div>

      <div>
        <h3 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 'bold', color: '#1e293b' }}>
          ข้อเสนอโปรโมชัน 3 ทางเลือก
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
          {report.suggestions.map((suggestion) => (
            <SuggestionCard key={suggestion.suggestion_id} suggestion={suggestion} />
          ))}
        </div>
      </div>

      <div style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <p style={{ margin: 0 }}>วิเคราะห์เมื่อ {formatDateTime(report.created_at)} โดยโมเดล {report.model_version}</p>
        <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
          <ShieldCheck style={{ width: 14, height: 14, color: '#16a34a' }} />
          ข้อมูลที่ส่งให้ AI เป็นตัวเลขสรุประดับร้านเท่านั้น ไม่มีข้อมูลส่วนบุคคลของลูกค้า
        </p>
        <p style={{ margin: 0 }}>AI เป็นผู้เสนอทางเลือกเท่านั้น เจ้าของร้านเป็นผู้ตัดสินใจ และระบบจะไม่สร้างแคมเปญให้อัตโนมัติ</p>
      </div>
    </div>
  );
}

export default function ShopDashboardPage() {
  const { shopId } = useParams();
  const navigate = useNavigate();
  const [today] = useState(() => bangkokToday());

  const [periodType, setPeriodType] = useState('week');
  const [anchorDate, setAnchorDate] = useState(null);
  const requestKey = `${periodType}|${anchorDate ?? 'latest'}`;

  const [shopState, setShopState] = useState({ shop: null, error: null });
  const [dashboardState, setDashboardState] = useState({ key: null, data: null, error: null });
  const [savedReport, setSavedReport] = useState({ key: null, report: null, error: null });
  const [generation, setGeneration] = useState({ key: null, running: false, error: null });

  useEffect(() => {
    let cancelled = false;
    api.get(`/shops/${shopId}`)
      .then((res) => { if (!cancelled) setShopState({ shop: res.data.shop, error: null }); })
      .catch((err) => { if (!cancelled) setShopState({ shop: null, error: err }); });
    return () => { cancelled = true; };
  }, [shopId]);

  useEffect(() => {
    let cancelled = false;
    const params = { period: periodType, ...(anchorDate ? { date: anchorDate } : {}) };
    api.get(`/shops/${shopId}/dashboard`, { params })
      .then((res) => { if (!cancelled) setDashboardState({ key: requestKey, data: res.data, error: null }); })
      .catch((err) => { if (!cancelled) setDashboardState({ key: requestKey, data: null, error: err }); });
    return () => { cancelled = true; };
  }, [shopId, periodType, anchorDate, requestKey]);

  const dashboard = dashboardState.data;
  const period = dashboard?.period;
  const periodKey = period ? `${period.type}|${period.start}` : null;

  useEffect(() => {
    if (!periodKey) return undefined;
    let cancelled = false;
    const [type, start] = periodKey.split('|');
    api.get(`/shops/${shopId}/ai-reports`, { params: { period_type: type, period_start: start } })
      .then(async (res) => {
        const latest = res.data.reports[0];
        const report = latest ? (await api.get(`/ai-reports/${latest.report_id}`)).data.report : null;
        if (!cancelled) setSavedReport({ key: periodKey, report, error: null });
      })
      .catch((err) => {
        const detail = err.response?.data?.message || err.message;
        if (!cancelled) setSavedReport({ key: periodKey, report: null, error: `โหลดรายงานที่บันทึกไว้ไม่สำเร็จ: ${detail}` });
      });
    return () => { cancelled = true; };
  }, [shopId, periodKey]);

  const generateReport = async () => {
    const key = periodKey;
    setGeneration({ key, running: true, error: null });
    try {
      const res = await api.post(`/shops/${shopId}/ai-reports`, {
        period_type: period.type,
        period_start: period.start,
        period_end: period.end,
      });
      setSavedReport({ key, report: res.data.report, error: null });
      setGeneration({ key, running: false, error: null });
    } catch (err) {
      setGeneration({ key, running: false, error: aiErrorMessage(err.response?.data) });
    }
  };

  const authError = [shopState.error, dashboardState.error].find((err) => err?.response?.status === 401);
  useEffect(() => {
    if (authError) {
      localStorage.removeItem('thaiplease_token');
      localStorage.removeItem('thaiplease_user');
      navigate('/login');
    }
  }, [authError, navigate]);

  const forbidden = [shopState.error, dashboardState.error].some((err) => err?.response?.status === 403);
  const isOngoingPeriod = period ? period.end >= today : false;
  const previousLabel = period?.type === 'MONTH' ? 'เดือนก่อน' : 'สัปดาห์ก่อน';
  const report = savedReport.key === periodKey ? savedReport.report : null;
  const reportLoading = periodKey !== null && savedReport.key !== periodKey;
  const generating = generation.running && generation.key === periodKey;
  const aiError = generation.key === periodKey ? generation.error : null;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 32 }}>
      {/* ส่วนหัวแสดงชื่อร้านและปุ่มย้อนกลับ */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link to="/merchant/shops" style={{ color: '#64748b', display: 'flex', alignItems: 'center', textDecoration: 'none' }} title="กลับไปร้านค้าของฉัน">
            <ArrowLeft style={{ width: 20, height: 20 }} />
          </Link>
          <div style={{ background: '#2e7d32', color: '#fff', borderRadius: 12, padding: 8, display: 'flex' }}>
            <Store style={{ width: 22, height: 22 }} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 'bold', color: '#1e293b' }}>
              {shopState.shop?.name || 'ภาพรวมร้านค้า'}
            </h1>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>ภาพรวมยอดขายและ AI Shop Advisor</p>
          </div>
        </div>
      </div>

      {forbidden ? (
        <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', color: '#e11d48', padding: 24, borderRadius: 16, textAlign: 'center' }}>
          คุณไม่มีสิทธิ์ดูข้อมูลของร้านนี้
        </div>
      ) : (
        <>
          {/* ส่วนสถิติตัวเลขและตัวเลือกช่วงเวลา */}
          <section>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16, marginBottom: 20 }}>
              <div>
                <h2 style={{ margin: '0 0 4px', fontSize: '1.25rem', fontWeight: 'bold', color: '#1e293b' }}>ภาพรวมยอดขาย</h2>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
                  {period ? <>เทียบกับ{previousLabel} ({formatPeriod(dashboard.comparison.period)})</> : 'กำลังโหลดช่วงเวลา...'}
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ background: '#f1f5f9', padding: 4, borderRadius: 10, display: 'flex', gap: 4 }}>
                  {PERIOD_TABS.map((tab) => (
                    <button
                      key={tab.value}
                      onClick={() => { setPeriodType(tab.value); setAnchorDate(null); }}
                      style={{
                        border: 'none',
                        background: periodType === tab.value ? '#fff' : 'transparent',
                        color: periodType === tab.value ? '#2e7d32' : '#64748b',
                        fontWeight: '600',
                        fontSize: '0.85rem',
                        padding: '6px 14px',
                        borderRadius: 8,
                        cursor: 'pointer',
                        boxShadow: periodType === tab.value ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, display: 'flex', alignItems: 'center', padding: '2px 4px' }}>
                  <button
                    onClick={() => setAnchorDate(shiftDate(period.start, -1))}
                    disabled={!period}
                    style={{ border: 'none', background: 'transparent', padding: 6, cursor: 'pointer', color: '#64748b' }}
                  >
                    <ChevronLeft style={{ width: 16, height: 16 }} />
                  </button>
                  <span style={{ fontSize: '0.85rem', fontWeight: '600', color: '#334155', minWidth: 140, textAlign: 'center' }}>
                    {period ? formatPeriod(period) : '...'}
                  </span>
                  <button
                    onClick={() => setAnchorDate(shiftDate(period.end, 1))}
                    disabled={!period || isOngoingPeriod}
                    style={{ border: 'none', background: 'transparent', padding: 6, cursor: 'pointer', color: '#64748b' }}
                  >
                    <ChevronRight style={{ width: 16, height: 16 }} />
                  </button>
                </div>
              </div>
            </div>

            {!dashboard ? (
              <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>กำลังคำนวณตัวชี้วัด...</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
                {METRIC_CARDS.map((card) => (
                  <MetricCard
                    key={card.key}
                    label={card.label}
                    unit={card.unit}
                    value={dashboard.metrics[card.key]}
                    previous={dashboard.comparison.metrics[card.key]}
                    change={dashboard.change_percent[card.key]}
                    previousLabel={previousLabel}
                  />
                ))}
              </div>
            )}
          </section>

          {/* ส่วน AI Shop Advisor */}
          <section style={{
            background: '#fafbf9',
            border: '1px solid #e2e8f0',
            borderRadius: 20,
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ background: '#2e7d32', color: '#fff', padding: 8, borderRadius: 12, display: 'flex' }}>
                  <Sparkles style={{ width: 20, height: 20 }} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 'bold', color: '#1e293b' }}>AI Shop Advisor</h3>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>วิเคราะห์ปัญหาและเสนอโปรโมชัน 3 ทางเลือกจากแม่แบบ 10 แบบ</p>
                </div>
              </div>

              <button
                onClick={generateReport}
                disabled={!period || generating || isOngoingPeriod}
                style={{
                  border: 'none',
                  background: '#2e7d32',
                  color: '#fff',
                  padding: '10px 20px',
                  borderRadius: 10,
                  fontSize: '0.9rem',
                  fontWeight: '600',
                  cursor: (!period || generating || isOngoingPeriod) ? 'not-allowed' : 'pointer',
                  opacity: (!period || generating || isOngoingPeriod) ? 0.6 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                {generating ? <LoaderCircle style={{ width: 16, height: 16 }} className="animate-spin" /> : report ? <RefreshCw style={{ width: 16, height: 16 }} /> : <Sparkles style={{ width: 16, height: 16 }} />}
                {generating ? 'กำลังวิเคราะห์...' : report ? 'วิเคราะห์ใหม่' : 'วิเคราะห์ด้วย AI'}
              </button>
            </div>

            {aiError && (
              <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', color: '#e11d48', padding: '12px 16px', borderRadius: 12, fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                <TriangleAlert style={{ width: 16, height: 16, flexShrink: 0 }} />
                <span>{aiError}</span>
              </div>
            )}

            {generating ? (
              <div style={{ padding: '36px 0', textAlign: 'center', color: '#64748b' }}>
                <LoaderCircle style={{ width: 32, height: 32, margin: '0 auto 12px', color: '#2e7d32' }} className="animate-spin" />
                <p style={{ margin: 0, fontWeight: '600' }}>AI กำลังวิเคราะห์ตัวเลขของร้าน...</p>
                <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>ระบบตรวจสอบคำตอบกับตัวเลขจริงในร้านก่อนบันทึกทุกครั้ง</p>
              </div>
            ) : reportLoading ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: '#94a3b8', fontSize: '0.875rem' }}>กำลังโหลดรายงานที่บันทึกไว้...</div>
            ) : report ? (
              <ReportView report={report} />
            ) : (
              !isOngoingPeriod && (
                <div style={{ padding: '28px 0', textAlign: 'center', color: '#64748b', fontSize: '0.9rem' }}>
                  ยังไม่มีรายงาน AI สำหรับช่วง {period ? formatPeriod(period) : ''} กด “วิเคราะห์ด้วย AI” เพื่อเริ่ม
                </div>
              )
            )}
          </section>
        </>
      )}
    </div>
  );
}