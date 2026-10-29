import { useEffect, useState } from 'react';
import api, { getErrorMessage } from '../api';

const EMPTY_FORM = { title: '', description: '', target_count: '2', window_days: '30', reward_coins: '50' };

// Admin สร้างและปิดภารกิจ (D-16)
export default function AdminMissionsPanel() {
  const [missions, setMissions] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/admin/missions')
      .then(({ data }) => setMissions(data.missions))
      .catch((requestError) => setError(getErrorMessage(requestError)));
  }, []);

  async function run(request) {
    setBusy(true);
    setError('');
    try {
      await request();
      const { data } = await api.get('/admin/missions');
      setMissions(data.missions);
      return true;
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function create(event) {
    event.preventDefault();
    const ok = await run(() => api.post('/admin/missions', {
      title: form.title,
      description: form.description || null,
      target_count: Number(form.target_count),
      window_days: Number(form.window_days),
      reward_coins: Number(form.reward_coins),
    }));
    if (ok) setForm(EMPTY_FORM);
  }

  function close(mission) {
    if (!window.confirm(`ปิดภารกิจ "${mission.title}"? คนที่รับไปแล้วยังทำต่อได้จนครบกำหนด`)) return;
    run(() => api.post(`/admin/missions/${mission.mission_id}/close`));
  }

  const field = (key) => ({ value: form[key], onChange: (event) => setForm({ ...form, [key]: event.target.value }) });
  return (
    <div className="content-stack">
      <section className="card">
        <div className="section-heading compact"><h2>สร้างภารกิจใหม่</h2></div>
        <p className="muted">ประชาชนกดรับ แล้วซื้อจากร้านที่ไม่เคยซื้อมาก่อนให้ครบตามจำนวนภายในเวลาที่กำหนด</p>
        <form className="form-grid" onSubmit={create}>
        <label>ชื่อภารกิจ<input required maxLength={200} {...field('title')} /></label>
        <label>รายละเอียด<input maxLength={1000} {...field('description')} /></label>
        <label>จำนวนร้านใหม่<input type="number" min="1" max="50" step="1" required {...field('target_count')} /></label>
        <label>ภายในกี่วันหลังกดรับ<input type="number" min="1" max="365" step="1" required {...field('window_days')} /></label>
        <label>เหรียญรางวัล<input type="number" min="1" max="100000" step="1" required {...field('reward_coins')} /></label>
        <div className="button-row"><button className="button button-primary" disabled={busy}>สร้างภารกิจ</button></div>
        </form>
        {error && <p className="notice notice-error" role="alert">{error}</p>}
      </section>
      <section className="card"><div className="section-heading compact"><h2>ภารกิจทั้งหมด</h2><span className="muted">{missions.length} ภารกิจ</span></div>
        {missions.length ? <div className="list-rows">{missions.map((mission) => <article className="list-row" key={mission.mission_id}>
          <div><strong>{mission.title}</strong><small>ร้านใหม่ {mission.target_count} ร้าน ภายใน {mission.window_days} วัน · รางวัล {mission.reward_coins} เหรียญ</small><small>รับแล้ว {mission.accepted_count} คน · สำเร็จ {mission.completed_count} คน · สร้างโดย {mission.created_by_name || 'ระบบ'}</small></div>
          {mission.status === 'ACTIVE'
            ? <button className="button button-outline button-small" disabled={busy} onClick={() => close(mission)}>ปิดภารกิจ</button>
            : <span className="status-badge status-ended">ปิดแล้ว</span>}
        </article>)}</div> : <p className="empty-note">ยังไม่มีภารกิจ</p>}
      </section>
    </div>
  );
}
