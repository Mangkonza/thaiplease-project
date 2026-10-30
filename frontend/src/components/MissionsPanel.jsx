import { useEffect, useState } from 'react';
import api, { getErrorMessage } from '../api';
import { missionGoalText, missionProgressText, missionRewardText } from '../utils/missions';

const ENROLLMENT_STATUS = {
  IN_PROGRESS: { text: 'กำลังทำ', className: 'status-pending' },
  COMPLETED: { text: 'สำเร็จ', className: 'status-active' },
  EXPIRED: { text: 'หมดเวลา', className: 'status-cancelled' },
};
const shortDate = (value) => new Date(value).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });

// ภารกิจของประชาชน: กดรับก่อน แล้วค่อยนับความคืบหน้า รางวัลเป็นเหรียญหรือคูปองเฉพาะร้าน
export default function MissionsPanel() {
  const [missions, setMissions] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/users/me/missions')
      .then(({ data }) => setMissions(data.missions))
      .catch((requestError) => setError(getErrorMessage(requestError)));
  }, []);

  async function accept(mission) {
    setBusy(true);
    setError('');
    try {
      await api.post(`/users/me/missions/${mission.mission_id}/accept`);
      const { data } = await api.get('/users/me/missions');
      setMissions(data.missions);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <div className="section-heading compact"><h2>ภารกิจ</h2><span className="muted">{missions.length} ภารกิจ</span></div>
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      {missions.length ? <div className="list-rows">{missions.map((mission) => {
        const { enrollment } = mission;
        return <article className="list-row" key={mission.mission_id}>
          <div><strong>{mission.title}</strong>
            <small>{missionGoalText(mission)}</small>
            <small>รางวัล: {missionRewardText(mission)}</small>
            {enrollment && <small>ความคืบหน้า {missionProgressText(mission, enrollment.progress)} · {enrollment.status === 'COMPLETED' ? `สำเร็จเมื่อ ${shortDate(enrollment.completed_at)}` : `ทำได้ถึง ${shortDate(enrollment.deadline_at)}`}</small>}
          </div>
          {enrollment
            ? <span className={`status-badge ${ENROLLMENT_STATUS[enrollment.status].className}`}>{ENROLLMENT_STATUS[enrollment.status].text}</span>
            : <button className="button button-primary button-small" disabled={busy} onClick={() => accept(mission)}>รับภารกิจ</button>}
        </article>;
      })}</div> : <p className="empty-note">ยังไม่มีภารกิจที่เปิดอยู่</p>}
    </section>
  );
}
