import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, BadgeCheck, ChevronLeft, ChevronRight, LoaderCircle, LogOut, RefreshCw,
  ShieldCheck, Sparkles, Store, Target, TriangleAlert,
} from 'lucide-react';
import api from '../services/api';
import {
  aiErrorMessage, bangkokToday, describeKpi, describeParameters, formatChange,
  formatDateTime, formatNumber, formatPeriod, shiftDate,
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
  const tone = change > 0 ? 'text-emerald-600 bg-emerald-50' : change < 0 ? 'text-rose-600 bg-rose-50' : 'text-slate-500 bg-slate-100';
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="text-2xl font-bold text-slate-800">{formatNumber(value)}</span>
        {value !== null && <span className="text-xs text-slate-500">{unit}</span>}
      </div>
      <div className="mt-3 flex items-center justify-between text-xs">
        <span className={`px-2 py-0.5 rounded-full font-semibold ${tone}`}>{formatChange(change)}</span>
        <span className="text-slate-400">{previousLabel}: {formatNumber(previous)}</span>
      </div>
    </div>
  );
}

function SuggestionCard({ suggestion }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-full">ทางเลือกที่ {suggestion.rank}</span>
        <span className="text-[11px] text-slate-400 font-mono">{suggestion.template_code}</span>
      </div>
      <h4 className="font-bold text-slate-800 leading-tight">{suggestion.template_name}</h4>
      <div className="flex flex-wrap gap-1.5">
        {describeParameters(suggestion.parameters).map((text) => (
          <span key={text} className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded-lg">{text}</span>
        ))}
      </div>
      <p className="text-sm text-slate-600 leading-relaxed flex-1">{suggestion.reason}</p>
      <div className="flex items-center gap-1.5 text-xs text-slate-500 pt-3 border-t border-slate-100">
        <Target className="w-3.5 h-3.5" />
        KPI เป้าหมาย: <strong className="text-slate-700">{describeKpi(suggestion.target_kpi)}</strong>
      </div>
    </div>
  );
}

// ผลตรวจตัวเลขที่ AI อ้างกับข้อมูลที่ส่งให้ AI (SRS 3.4.2) คำนวณโดย backend
function NumberCheck({ check }) {
  if (!check || check.checked === 0) return null;
  if (check.unverified.length === 0) {
    return (
      <p className="mt-4 flex items-center gap-1.5 text-xs font-medium text-emerald-700">
        <BadgeCheck className="w-4 h-4" />
        ตัวเลขที่ AI อ้างถึง {check.checked} ค่า ตรงกับข้อมูลของร้านทั้งหมด
      </p>
    );
  }
  return (
    <p className="mt-4 flex items-start gap-1.5 text-xs font-medium text-amber-800">
      <TriangleAlert className="w-4 h-4 shrink-0" />
      ตัวเลขที่ตรวจสอบกับข้อมูลของร้านไม่ได้: {check.unverified.join(', ')} โปรดตรวจสอบก่อนตัดสินใจ
    </p>
  );
}

function ReportView({ report }) {
  return (
    <div className="space-y-5">
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
        <p className="text-xs font-semibold text-amber-700 mb-1">ปัญหาที่พบ</p>
        <p className="font-semibold text-slate-800">{report.problem}</p>
        <p className="text-sm text-slate-600 mt-2">{report.summary}</p>
        {report.possible_causes.length > 0 && (
          <>
            <p className="text-xs font-semibold text-slate-500 mt-4 mb-1">สาเหตุที่เป็นไปได้</p>
            <ul className="list-disc list-inside text-sm text-slate-600 space-y-0.5">
              {report.possible_causes.map((cause) => <li key={cause}>{cause}</li>)}
            </ul>
          </>
        )}
        <NumberCheck check={report.number_check} />
      </div>

      <div>
        <p className="text-sm font-semibold text-slate-700 mb-3">ข้อเสนอโปรโมชัน 3 ทางเลือก</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {report.suggestions.map((suggestion) => <SuggestionCard key={suggestion.suggestion_id} suggestion={suggestion} />)}
        </div>
      </div>

      <div className="text-xs text-slate-500 space-y-1">
        <p>วิเคราะห์เมื่อ {formatDateTime(report.created_at)} • โมเดล {report.model_version}</p>
        <p className="flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          ข้อมูลที่ส่งให้ AI เป็นตัวเลขสรุประดับร้านเท่านั้น ไม่มีข้อมูลส่วนบุคคลของลูกค้า
        </p>
        <p>AI เป็นผู้เสนอทางเลือกเท่านั้น เจ้าของร้านเป็นผู้ตัดสินใจ และระบบจะไม่สร้างแคมเปญให้อัตโนมัติ</p>
      </div>
    </div>
  );
}

export default function ShopDashboardPage() {
  const { shopId } = useParams();
  const navigate = useNavigate();
  const [user] = useState(() => JSON.parse(localStorage.getItem('user') || 'null'));
  const [today] = useState(() => bangkokToday());

  const [periodType, setPeriodType] = useState('week');
  const [anchorDate, setAnchorDate] = useState(null); // null = ช่วงล่าสุดที่จบไปแล้ว (ค่าเริ่มต้นของ backend)
  const requestKey = `${periodType}|${anchorDate ?? 'latest'}`;

  const [shopState, setShopState] = useState({ shop: null, error: null });
  const [dashboardState, setDashboardState] = useState({ key: null, data: null, error: null });
  const [savedReport, setSavedReport] = useState({ key: null, report: null, error: null });
  const [generation, setGeneration] = useState({ key: null, running: false, error: null });

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

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

  // รายงานที่บันทึกไว้ของช่วงนี้ แสดงได้ทันทีโดยไม่ต้องรอ AI (แผนสำรองตอน demo)
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
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      navigate('/login');
    }
  }, [authError, navigate]);

  const forbidden = [shopState.error, dashboardState.error].some((err) => err?.response?.status === 403);
  const dashboardLoading = dashboardState.key !== requestKey;
  const isOngoingPeriod = period ? period.end >= today : false;
  const previousLabel = period?.type === 'MONTH' ? 'เดือนก่อน' : 'สัปดาห์ก่อน';
  const report = savedReport.key === periodKey ? savedReport.report : null;
  const reportLoading = periodKey !== null && savedReport.key !== periodKey;
  const generating = generation.running && generation.key === periodKey;
  const aiError = generation.key === periodKey ? generation.error : null;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/dashboard" className="p-2 -ml-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition" title="กลับไปร้านค้าของฉัน">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center shadow-md shadow-indigo-600/20 shrink-0">
              <Store className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-slate-800 leading-tight truncate">{shopState.shop?.name || 'ภาพรวมร้านค้า'}</h1>
              <p className="text-xs text-slate-500">ภาพรวมยอดขายและ AI Shop Advisor</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <p className="text-sm font-semibold text-slate-700 hidden sm:block">{user?.display_name}</p>
            <button onClick={handleLogout} className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition" title="ออกจากระบบ">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {forbidden ? (
          <div className="bg-white border border-rose-200 rounded-2xl p-8 text-center text-rose-700">คุณไม่มีสิทธิ์ดูข้อมูลของร้านนี้</div>
        ) : (
          <>
            <section>
              <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-5">
                <div>
                  <h2 className="text-xl font-bold text-slate-800">ภาพรวมยอดขาย</h2>
                  <p className="text-sm text-slate-500">
                    {period ? <>เทียบกับ{previousLabel} ({formatPeriod(dashboard.comparison.period)})</> : 'กำลังโหลดช่วงเวลา...'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex bg-slate-100 p-1 rounded-xl">
                    {PERIOD_TABS.map((tab) => (
                      <button
                        key={tab.value}
                        onClick={() => { setPeriodType(tab.value); setAnchorDate(null); }}
                        className={`px-3 py-1.5 text-sm rounded-lg font-medium transition ${periodType === tab.value ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center bg-white border border-slate-200 rounded-xl shadow-sm">
                    <button onClick={() => setAnchorDate(shiftDate(period.start, -1))} disabled={!period} className="p-2 text-slate-500 hover:text-indigo-600 disabled:opacity-40" title="ช่วงก่อนหน้า">
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="px-2 text-sm font-semibold text-slate-700 min-w-[9rem] text-center">{period ? formatPeriod(period) : '...'}</span>
                    <button onClick={() => setAnchorDate(shiftDate(period.end, 1))} disabled={!period || isOngoingPeriod} className="p-2 text-slate-500 hover:text-indigo-600 disabled:opacity-40" title="ช่วงถัดไป">
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {dashboardState.error && !forbidden && dashboardState.key === requestKey ? (
                <div className="bg-white border border-rose-200 rounded-2xl p-6 text-rose-700 text-sm">
                  โหลดตัวชี้วัดไม่สำเร็จ: {dashboardState.error.response?.data?.message || dashboardState.error.message}
                </div>
              ) : !dashboard ? (
                <div className="p-12 text-center text-slate-400">กำลังคำนวณตัวชี้วัด...</div>
              ) : (
                <div className={`transition-opacity ${dashboardLoading ? 'opacity-50' : ''}`}>
                  {isOngoingPeriod && (
                    <p className="mb-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 inline-block">
                      ช่วงเวลานี้ยังไม่จบ ตัวเลขจะเปลี่ยนตามรายการชำระเงินใหม่
                    </p>
                  )}
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
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
                  {dashboard.metrics.orders === 0 && (
                    <p className="mt-4 text-sm text-slate-500">ยังไม่มีรายการขายที่สำเร็จในช่วงเวลานี้</p>
                  )}
                </div>
              )}
            </section>

            <section className="bg-gradient-to-br from-indigo-50 to-white border border-indigo-100 rounded-3xl p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-purple-600 text-white rounded-xl flex items-center justify-center">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800">AI Shop Advisor</h3>
                    <p className="text-xs text-slate-500">วิเคราะห์ปัญหาและเสนอโปรโมชัน 3 ทางเลือกจากแม่แบบ 10 แบบ</p>
                  </div>
                </div>
                <button
                  onClick={generateReport}
                  disabled={!period || generating || isOngoingPeriod}
                  className={`flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed ${report ? 'bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md shadow-indigo-600/20'}`}
                >
                  {generating ? <LoaderCircle className="w-4 h-4 animate-spin" /> : report ? <RefreshCw className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
                  {generating ? 'กำลังวิเคราะห์...' : report ? 'วิเคราะห์ใหม่' : 'วิเคราะห์ด้วย AI'}
                </button>
              </div>

              {isOngoingPeriod && (
                <p className="text-sm text-slate-500 mb-4">รอให้ช่วงเวลานี้จบก่อนจึงจะวิเคราะห์ได้ เพื่อไม่ให้ AI เทียบตัวเลขที่ยังไม่ครบช่วง</p>
              )}
              {aiError && (
                <div className="mb-4 flex items-start gap-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
                  <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{aiError}{report && ' — ด้านล่างคือรายงานล่าสุดที่บันทึกไว้'}</span>
                </div>
              )}
              {savedReport.error && savedReport.key === periodKey && (
                <p className="mb-4 text-sm text-rose-700">{savedReport.error}</p>
              )}

              {generating ? (
                <div className="py-12 text-center text-slate-500">
                  <LoaderCircle className="w-8 h-8 animate-spin mx-auto text-indigo-600 mb-3" />
                  <p className="font-medium">AI กำลังวิเคราะห์ตัวเลขของร้าน...</p>
                  <p className="text-xs mt-1">โดยปกติใช้เวลา 10–30 วินาที ระบบจะตรวจคำตอบก่อนบันทึกทุกครั้ง</p>
                </div>
              ) : reportLoading ? (
                <div className="py-8 text-center text-slate-400 text-sm">กำลังโหลดรายงานที่บันทึกไว้...</div>
              ) : report ? (
                <ReportView report={report} />
              ) : (
                !isOngoingPeriod && (
                  <div className="py-8 text-center text-slate-500 text-sm">
                    ยังไม่มีรายงาน AI สำหรับช่วง {period ? formatPeriod(period) : ''} กด “วิเคราะห์ด้วย AI” เพื่อเริ่ม
                  </div>
                )
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
