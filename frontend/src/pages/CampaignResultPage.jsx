import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api, { getErrorMessage } from '../api';
import { formatCampaignMetric, formatUplift } from '../utils/format';

export default function CampaignResultPage() {
  const { shopId, campaignId } = useParams();
  const [campaign, setCampaign] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/campaigns/${campaignId}`)
      .then(({ data }) => setCampaign(data.campaign))
      .catch((requestError) => setError(getErrorMessage(requestError)));
    api.get(`/campaigns/${campaignId}/result`).then(({ data }) => setResult(data.result)).catch((requestError) => {
      if (requestError.response?.status !== 404) setError(getErrorMessage(requestError));
    });
  }, [campaignId]);

  async function evaluate() {
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post(`/campaigns/${campaignId}/evaluate`);
      setResult(data.result);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="content-stack">
      <Link className="back-link" to={`/merchant/shops/${shopId}/campaigns`}>← กลับไปแคมเปญ</Link>
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      {campaign && <div className="section-heading"><div><span className="eyebrow">CAMPAIGN REPORT</span><h1>{campaign.name}</h1><p className="muted">{campaign.template_name} · {new Date(campaign.start_at).toLocaleDateString('th-TH')} – {new Date(campaign.end_at).toLocaleDateString('th-TH')}</p></div>{!result && <button className="button button-primary" disabled={busy} onClick={evaluate}>{busy ? 'กำลังคำนวณ…' : 'คำนวณผลแคมเปญ'}</button>}</div>}
      {result ? <>
        <section className={`result-banner result-${result.result_status.toLowerCase()}`}><span className="eyebrow">EVALUATION RESULT</span><h2>{result.result_status === 'SUCCESS' ? 'แคมเปญได้ผลดี' : result.result_status === 'FAILED' ? 'แคมเปญยังไม่บรรลุเป้าหมาย' : 'ข้อมูลยังไม่เพียงพอ'}</h2><p>{result.explanation}</p></section>
        <div className="metric-grid"><Metric label="Uplift" value={formatUplift(result.uplift, campaign?.template_code)} /><Metric label="กลุ่มทดลอง" value={result.treatment_size} suffix=" คน" /><Metric label="กลุ่มควบคุม" value={result.control_size} suffix=" คน" /><Metric label="ใช้สิทธิ์" value={result.redemption_count} suffix=" ครั้ง" /></div>
        <section className="card"><h2>ผลตัวชี้วัด</h2><div className="metric-comparison"><span>ค่าฐาน 7 วันก่อนแคมเปญ <b>{formatCampaignMetric(result.baseline_metric, campaign?.template_code)}</b></span><span>กลุ่มทดลอง <b>{formatCampaignMetric(result.treatment_metric, campaign?.template_code)}</b></span><span>กลุ่มควบคุม <b>{formatCampaignMetric(result.control_metric, campaign?.template_code)}</b></span><span>ประเมินเมื่อ <b>{new Date(result.evaluated_at).toLocaleString('th-TH')}</b></span></div></section>
      </> : campaign && <div className="empty-state"><div className="empty-icon">◷</div><h2>ยังไม่มีผลการประเมิน</h2><p>ปิดแคมเปญและรอให้ถึงเวลาสิ้นสุดก่อนคำนวณผล</p>{campaign.status === 'ENDED' && <button className="button button-primary" disabled={busy} onClick={evaluate}>{busy ? 'กำลังคำนวณ…' : 'คำนวณผลแคมเปญ'}</button>}</div>}
    </div>
  );
}

function Metric({ label, value, suffix = '' }) {
  return <div className="card metric-card"><span className="muted">{label}</span><strong>{value}{suffix}</strong></div>;
}
