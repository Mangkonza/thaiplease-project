import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api, { getErrorMessage } from '../api';

const futureDateTime = (days) => {
  const date = new Date(Date.now() + days * 86400000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};

export default function CampaignsPage() {
  const { shopId } = useParams();
  const [campaigns, setCampaigns] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [campaignParameters, setCampaignParameters] = useState({});
  const [settings, setSettings] = useState({ name: '', start_at: futureDateTime(0), end_at: futureDateTime(7), treatment_ratio: 0.5 });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await api.get(`/shops/${shopId}/campaigns`);
    setCampaigns(data.campaigns);
  }, [shopId]);

  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      try {
        const [history] = await Promise.all([
          api.get(`/shops/${shopId}/ai-reports`),
          load(),
        ]);
        if (history.data.reports.length) {
          const reportResponse = await api.get(`/ai-reports/${history.data.reports[0].report_id}`);
          if (!cancelled) setSuggestions(reportResponse.data.report.suggestions.filter((item) => item.status === 'PROPOSED'));
        }
      } catch (requestError) {
        if (!cancelled) setError(getErrorMessage(requestError));
      }
    }
    initialize();
    return () => { cancelled = true; };
  }, [shopId, load]);

  async function generateSuggestions() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const { data } = await api.post(`/shops/${shopId}/ai-reports`, {});
      setSuggestions(data.report.suggestions);
      setNotice('AI สร้างข้อเสนอแคมเปญให้แล้ว');
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function chooseSuggestion(suggestion) {
    setBusy(true);
    setError('');
    try {
      await api.post(`/ai-suggestions/${suggestion.suggestion_id}/select`, { shop_id: shopId });
      setSelected(suggestion);
      setCampaignParameters({ ...suggestion.parameters });
      setSettings({ ...settings, name: suggestion.template_name || suggestion.template_code });
      setSuggestions([]);
      setNotice('เลือกข้อเสนอแล้ว ตั้งค่าช่วงเวลาและสร้างแคมเปญฉบับร่างได้เลย');
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function createDraft(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/campaigns', {
        shop_id: shopId,
        suggestion_id: selected.suggestion_id,
        parameters: campaignParameters,
        ...settings,
        start_at: new Date(settings.start_at).toISOString(),
        end_at: new Date(settings.end_at).toISOString(),
        treatment_ratio: Number(settings.treatment_ratio),
      });
      setSelected(null);
      setNotice('สร้างแคมเปญฉบับร่างแล้ว');
      await load();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(campaign, action) {
    setBusy(true);
    setError('');
    try {
      await api.post(`/campaigns/${campaign.campaign_id}/${action}`);
      setNotice(action === 'activate' ? 'เปิดแคมเปญแล้ว' : 'ปิดแคมเปญแล้ว');
      await load();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="content-stack">
      <Link className="back-link" to="/merchant/shops">← กลับไปร้านของฉัน</Link>
      <div className="section-heading"><div><span className="eyebrow">SMART CAMPAIGNS</span><h1>แคมเปญของร้าน</h1><p className="muted">เลือกข้อเสนอจาก AI ตั้งค่า ทดลองใช้งาน และวัดผล</p></div><button className="button button-dark" disabled={busy} onClick={generateSuggestions}>{busy ? 'กำลังทำงาน…' : '✦ สร้างข้อเสนอจาก AI'}</button></div>
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      {notice && <p className="notice notice-success" role="status">{notice}</p>}

      {selected && <form className="card campaign-config" onSubmit={createDraft}>
        <div className="section-heading compact"><div><span className="eyebrow">CONFIGURE CAMPAIGN</span><h2>{selected.template_name || selected.template_code}</h2></div></div>
        <p>{selected.reason}</p>
        <div className="suggestion-parameters">{Object.entries(selected.parameters).map(([key, value]) => <span key={key}><small>{key.replaceAll('_', ' ')}</small><b>{Array.isArray(value) ? value.join(', ') : String(value)}</b></span>)}</div>
        <div className="form-grid">
          <label>ชื่อแคมเปญ<input required maxLength="150" value={settings.name} onChange={(e) => setSettings({ ...settings, name: e.target.value })} /></label>
          <label>สัดส่วนกลุ่มทดลอง (%)<input type="number" min="0" max="100" step="1" value={Math.round(settings.treatment_ratio * 100)} onChange={(e) => setSettings({ ...settings, treatment_ratio: Number(e.target.value) / 100 })} /></label>
          <label>เริ่มแคมเปญ<input type="datetime-local" required value={settings.start_at} onChange={(e) => setSettings({ ...settings, start_at: e.target.value })} /></label>
          <label>สิ้นสุดแคมเปญ<input type="datetime-local" required value={settings.end_at} onChange={(e) => setSettings({ ...settings, end_at: e.target.value })} /></label>
          {Object.entries(campaignParameters).map(([key, value]) => <label key={key}>{key.replaceAll('_', ' ')}
            {Array.isArray(value)
              ? <input required value={value.join(', ')} onChange={(e) => setCampaignParameters({ ...campaignParameters, [key]: e.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} />
              : <input required type={key.endsWith('_time') ? 'time' : typeof value === 'number' ? 'number' : 'text'}
                step={Number.isInteger(value) ? '1' : '0.01'} value={value}
                onChange={(e) => setCampaignParameters({
                  ...campaignParameters,
                  [key]: typeof value === 'number' ? Number(e.target.value) : e.target.value,
                })} />}
          </label>)}
        </div>
        <button className="button button-primary" disabled={busy}>บันทึกฉบับร่าง</button>
      </form>}

      {suggestions.length > 0 && <section className="content-stack"><div className="section-heading compact"><h2>ข้อเสนอจาก AI</h2><span className="muted">เลือกข้อเสนอที่เหมาะกับร้าน</span></div><div className="suggestion-grid">{suggestions.map((item) => <article className="card suggestion-card" key={item.suggestion_id}><span className="rank-label">ข้อเสนอ #{item.rank}</span><h3>{item.template_name || item.template_code}</h3><p>{item.reason}</p><div className="suggestion-parameters">{Object.entries(item.parameters).map(([key, value]) => <span key={key}><small>{key.replaceAll('_', ' ')}</small><b>{Array.isArray(value) ? value.join(', ') : String(value)}</b></span>)}</div><button className="button button-outline" disabled={busy} onClick={() => chooseSuggestion(item)}>เลือกข้อเสนอนี้</button></article>)}</div></section>}

      <section className="card"><div className="section-heading compact"><h2>แคมเปญทั้งหมด</h2><span className="muted">{campaigns.length} รายการ</span></div>
        {campaigns.length ? <div className="list-rows">{campaigns.map((campaign) => <article className="list-row campaign-row" key={campaign.campaign_id}><div><strong>{campaign.name}</strong><small>{campaign.template_name} · {new Date(campaign.start_at).toLocaleDateString('th-TH')} – {new Date(campaign.end_at).toLocaleDateString('th-TH')}</small><CampaignStatus status={campaign.status} /></div><div className="button-row">
          {campaign.status === 'DRAFT' && <button className="button button-primary button-small" disabled={busy} onClick={() => updateStatus(campaign, 'activate')}>เปิดแคมเปญ</button>}
          {campaign.status === 'ACTIVE' && <button className="button button-outline button-small" disabled={busy} onClick={() => updateStatus(campaign, 'end')}>ปิดแคมเปญ</button>}
          {campaign.status === 'ENDED' && <Link className="button button-outline button-small" to={`/merchant/shops/${shopId}/campaigns/${campaign.campaign_id}`}>ดูผลแคมเปญ</Link>}
        </div></article>)}</div> : <p className="empty-note">ยังไม่มีแคมเปญ สร้างข้อเสนอจาก AI เพื่อเริ่มต้น</p>}
      </section>
    </div>
  );
}

function CampaignStatus({ status }) {
  const labels = { DRAFT: 'ฉบับร่าง', ACTIVE: 'กำลังทำงาน', ENDED: 'สิ้นสุดแล้ว', CANCELLED: 'ยกเลิก' };
  return <span className={`status-badge status-${status.toLowerCase()}`}>{labels[status] || status}</span>;
}
