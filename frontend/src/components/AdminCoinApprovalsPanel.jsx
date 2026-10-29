import { useEffect, useState } from 'react';
import api, { getErrorMessage } from '../api';
import { describeParameters } from '../utils/format';

// แคมเปญแจกเหรียญที่ร้านส่งมาขออนุมัติ (D-18)
export default function AdminCoinApprovalsPanel() {
  const [campaigns, setCampaigns] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/admin/campaign-approvals')
      .then(({ data }) => setCampaigns(data.campaigns))
      .catch((requestError) => setError(getErrorMessage(requestError)));
  }, []);

  async function decide(campaign, decision) {
    let note;
    if (decision === 'REJECT') {
      note = window.prompt('เหตุผลที่ไม่อนุมัติ');
      if (!note?.trim()) return;
    }
    setBusy(true);
    setError('');
    try {
      await api.post(`/admin/campaigns/${campaign.campaign_id}/approval`, { decision, note });
      const { data } = await api.get('/admin/campaign-approvals');
      setCampaigns(data.campaigns);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <div className="section-heading compact"><div><h2>แคมเปญแจกเหรียญรออนุมัติ</h2><span className="muted">เหรียญเป็นภาระของโครงการ ร้านจึงเปิดแคมเปญแบบนี้ได้หลังผ่านการอนุมัติ</span></div><span className="muted">{campaigns.length} รายการ</span></div>
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      {campaigns.length ? <div className="list-rows">{campaigns.map((campaign) => <article className="list-row" key={campaign.campaign_id}>
        <div><strong>{campaign.name} · {campaign.shop_name}</strong><small>{campaign.template_name} · {new Date(campaign.start_at).toLocaleDateString('th-TH')} – {new Date(campaign.end_at).toLocaleDateString('th-TH')} · กลุ่มทดลอง {Math.round(Number(campaign.treatment_ratio) * 100)}%</small><small>{describeParameters(campaign.parameters).join(' · ')}</small></div>
        <div className="button-row"><button className="button button-primary button-small" disabled={busy} onClick={() => decide(campaign, 'APPROVE')}>อนุมัติ</button><button className="button button-outline button-small" disabled={busy} onClick={() => decide(campaign, 'REJECT')}>ไม่อนุมัติ</button></div>
      </article>)}</div> : <p className="empty-note">ไม่มีแคมเปญรออนุมัติ</p>}
    </section>
  );
}
