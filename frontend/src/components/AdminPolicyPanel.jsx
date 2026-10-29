import { useEffect, useState } from 'react';
import api, { getErrorMessage } from '../api';
import { formatBaht } from '../utils/format';

const FIELDS = [
  { key: 'copay_percent', label: 'รัฐช่วยจ่าย (%)', step: '0.01' },
  { key: 'daily_cap', label: 'เพดานต่อคนต่อวัน (บาท)', step: '0.01' },
  { key: 'monthly_cap', label: 'เพดานต่อคนต่อเดือน (บาท)', step: '0.01' },
  { key: 'lifetime_cap', label: 'เพดานต่อคนทั้งโครงการ (บาท) เว้นว่าง = ไม่จำกัด', step: '0.01', optional: true },
  { key: 'baht_per_coin', label: 'ยอดซื้อกี่บาทได้ 1 เหรียญ', step: '1' },
  { key: 'coupon_coin_cost', label: 'ใช้กี่เหรียญแลกคูปอง 1 ใบ', step: '1' },
  { key: 'coupon_value', label: 'มูลค่าคูปอง (บาท)', step: '0.01' },
  { key: 'coupon_min_spend', label: 'ยอดซื้อขั้นต่ำที่ใช้คูปองได้ (บาท)', step: '0.01' },
  { key: 'coupon_valid_days', label: 'คูปองมีอายุ (วัน)', step: '1' },
];

function toForm(policy) {
  const form = { program_start: policy.program_start, program_end: policy.program_end, note: '' };
  for (const field of FIELDS) form[field.key] = policy[field.key] === null ? '' : String(policy[field.key]);
  return form;
}

export default function AdminPolicyPanel() {
  const [policies, setPolicies] = useState([]);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data } = await api.get('/admin/policies');
    setPolicies(data.policies);
    if (data.policies[0]) setForm(toForm(data.policies[0]));
  }
  useEffect(() => {
    api.get('/admin/policies').then(({ data }) => {
      setPolicies(data.policies);
      if (data.policies[0]) setForm(toForm(data.policies[0]));
    }).catch((requestError) => setError(getErrorMessage(requestError)));
  }, []);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setSaved('');
    setBusy(true);
    try {
      const body = { program_start: form.program_start, program_end: form.program_end, note: form.note };
      // ช่องที่ไม่บังคับและเว้นว่างส่งเป็น null ไม่ใช่ 0 (Number('') เป็น 0)
      for (const field of FIELDS) body[field.key] = field.optional && form[field.key].trim() === '' ? null : Number(form[field.key]);
      const { data } = await api.post('/admin/policies', body);
      await load();
      setSaved(`บันทึกเป็นนโยบายเวอร์ชัน ${data.policy.policy_version} แล้ว มีผลกับการจ่ายเงินครั้งถัดไป`);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  const current = policies[0];
  return (
    <div className="content-stack">
      <section className="card">
        <div className="section-heading compact"><h2>แก้นโยบายโครงการ</h2>{current && <span className="muted">ใช้อยู่: เวอร์ชัน {current.policy_version}</span>}</div>
        <p className="muted">การแก้จะสร้างนโยบายเวอร์ชันใหม่ ใช้กับรายการที่จ่ายหลังบันทึกเท่านั้น รายการเก่ายังอ้างเวอร์ชันเดิม</p>
        {form && <form className="form-grid" onSubmit={submit}>
          {FIELDS.map((field) => <label key={field.key}>{field.label}<input type="number" min="0" step={field.step} required={!field.optional} value={form[field.key]} onChange={(event) => setForm({ ...form, [field.key]: event.target.value })} /></label>)}
          <label>วันเริ่มโครงการ<input type="date" required value={form.program_start} onChange={(event) => setForm({ ...form, program_start: event.target.value })} /></label>
          <label>วันสิ้นสุดโครงการ<input type="date" required value={form.program_end} onChange={(event) => setForm({ ...form, program_end: event.target.value })} /></label>
          <label>เหตุผลที่แก้<input maxLength={500} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="เช่น ปรับเพดานตามงบประมาณ" /></label>
          <div className="button-row"><button className="button button-primary" disabled={busy}>{busy ? 'กำลังบันทึก…' : 'บันทึกเป็นเวอร์ชันใหม่'}</button></div>
        </form>}
        {saved && <p className="notice notice-success">{saved}</p>}
        {error && <p className="notice notice-error" role="alert">{error}</p>}
      </section>
      <section className="card">
        <div className="section-heading compact"><h2>ประวัตินโยบาย</h2><span className="muted">{policies.length} เวอร์ชัน</span></div>
        {policies.length ? <div className="table-wrap"><table><thead><tr><th>เวอร์ชัน</th><th>รัฐช่วยจ่าย</th><th>เพดาน วัน/เดือน/รวม</th><th>เหรียญ</th><th>คูปอง</th><th>ช่วงโครงการ</th><th>แก้โดย</th><th>เหตุผล</th></tr></thead>
          <tbody>{policies.map((policy) => <tr key={policy.policy_version}><td>{policy.policy_version}</td><td>{policy.copay_percent}%</td><td>{formatBaht(policy.daily_cap)} / {formatBaht(policy.monthly_cap)} / {policy.lifetime_cap === null ? 'ไม่จำกัด' : formatBaht(policy.lifetime_cap)}</td><td>{policy.baht_per_coin} บาท = 1</td><td>{policy.coupon_coin_cost} เหรียญ = {formatBaht(policy.coupon_value)} (ขั้นต่ำ {formatBaht(policy.coupon_min_spend)}, {policy.coupon_valid_days} วัน)</td><td>{policy.program_start} ถึง {policy.program_end}</td><td>{policy.created_by_name || 'ระบบ'}</td><td>{policy.note || '—'}</td></tr>)}</tbody></table></div>
          : <p className="empty-note">ยังไม่มีนโยบาย</p>}
      </section>
    </div>
  );
}
