import { useEffect, useState } from 'react';
import api, { getErrorMessage } from '../api';

const EMPTY = { code: '', mechanic: 'PERCENT_DISCOUNT', name: '', description: '', target_kpi: '', limits: {} };

// ช่วงค่าที่ตั้งได้ของแต่ละช่องตัวเลข แสดงเป็น "ต่ำสุด–สูงสุด"
function rangeText(schema) {
  return Object.entries(schema?.properties || {})
    .filter(([, p]) => p.type === 'number' || p.type === 'integer')
    .map(([key, p]) => `${key} ${p.minimum ?? '–'}…${p.maximum ?? '∞'}`)
    .join(' · ');
}

// ค่าในฟอร์ม → limits ที่ส่งให้ backend (ช่องว่าง = ใช้ขอบเขตของกลไก)
function toLimits(limits) {
  const result = {};
  for (const [key, bounds] of Object.entries(limits)) {
    const entry = {};
    for (const bound of ['minimum', 'maximum']) {
      if (bounds[bound] !== undefined && String(bounds[bound]).trim() !== '') entry[bound] = Number(bounds[bound]);
    }
    if (Object.keys(entry).length) result[key] = entry;
  }
  return result;
}

const limitsFromSchema = (schema) => Object.fromEntries(Object.entries(schema?.properties || {})
  .filter(([, p]) => p.type === 'number' || p.type === 'integer')
  .map(([key, p]) => [key, { minimum: p.minimum ?? '', maximum: p.maximum ?? '' }]));

// Admin จัดการแม่แบบแคมเปญที่ AI เลือกได้: เพิ่มจากกลไกที่มี แก้ไข เปิด/ปิด และลบหรือเก็บเข้าคลัง
export default function AdminTemplatesPanel() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/admin/templates').then((response) => setData(response.data)).catch((requestError) => setError(getErrorMessage(requestError)));
  }, []);

  async function run(request, message) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await request();
      setData((await api.get('/admin/templates')).data);
      setNotice(typeof message === 'function' ? message(result) : message);
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
    const ok = await run(() => api.post('/admin/templates', {
      code: form.code.trim().toUpperCase(), mechanic: form.mechanic, name: form.name, description: form.description || null,
      target_kpi: form.target_kpi, limits: toLimits(form.limits),
    }), `เพิ่มแม่แบบ "${form.name}" แล้ว AI จะเลือกแม่แบบนี้ได้ตั้งแต่รายงานครั้งถัดไป`);
    if (ok) setForm(EMPTY);
  }

  async function saveEdit(event) {
    event.preventDefault();
    const ok = await run(() => api.patch(`/admin/templates/${editing.template_id}`, {
      name: editing.name, description: editing.description || null, target_kpi: editing.target_kpi, limits: toLimits(editing.limits),
    }), `บันทึกแม่แบบ "${editing.name}" แล้ว`);
    if (ok) setEditing(null);
  }

  function toggle(template) {
    run(() => api.patch(`/admin/templates/${template.template_id}`, { active: !template.active }),
      template.active ? `ปิดแม่แบบ "${template.name}" แล้ว AI จะไม่เลือกแม่แบบนี้` : `เปิดแม่แบบ "${template.name}" แล้ว`);
  }

  function remove(template) {
    const used = template.campaign_count + template.suggestion_count > 0;
    const question = used
      ? `แม่แบบ "${template.name}" เคยถูกใช้แล้ว จะเก็บเข้าคลังแทนการลบ (แคมเปญเก่ายังดูได้) ยืนยันไหม?`
      : `ลบแม่แบบ "${template.name}" ถาวร ยืนยันไหม?`;
    if (!window.confirm(question)) return;
    run(() => api.delete(`/admin/templates/${template.template_id}`),
      ({ data: result }) => (result.result === 'ARCHIVED' ? `เก็บ "${template.name}" เข้าคลังแล้ว` : `ลบ "${template.name}" แล้ว`));
  }

  if (!data) return error ? <p className="notice notice-error" role="alert">{error}</p> : <p className="muted">กำลังโหลดแม่แบบ…</p>;

  const mechanicOf = (code) => data.mechanics.find((m) => m.code === code);
  const mechanicLimits = mechanicOf(form.mechanic)?.limits || [];
  const activeCount = data.templates.filter((t) => t.active && !t.archived_at).length;
  const limitInputs = (state, setState, limits) => limits.map((limit) => (
    <div className="limit-row" key={limit.key}>
      <span>{limit.key} <small className="muted">({limit.minimum ?? '–'} ถึง {limit.maximum ?? '∞'})</small></span>
      {['minimum', 'maximum'].map((bound) => (
        <input key={bound} type="number" step={limit.type === 'integer' ? 1 : 'any'} placeholder={bound === 'minimum' ? 'ต่ำสุด' : 'สูงสุด'}
          value={state.limits[limit.key]?.[bound] ?? ''}
          onChange={(event) => setState({ ...state, limits: { ...state.limits, [limit.key]: { ...state.limits[limit.key], [bound]: event.target.value } } })} />
      ))}
    </div>
  ));

  return (
    <div className="content-stack">
      {error && <p className="notice notice-error" role="alert">{error}</p>}
      {notice && <p className="notice notice-success" role="status">{notice}</p>}

      <section className="card">
        <div className="section-heading compact"><h2>แม่แบบแคมเปญ</h2><span className="muted">เปิดอยู่ {activeCount} แบบ</span></div>
        <div className="list-rows">{data.templates.map((template) => (
          <article className="list-row template-row" key={template.template_id}>
            {editing?.template_id === template.template_id ? (
              <form className="form-stack template-edit" onSubmit={saveEdit}>
                <label>ชื่อ<input required maxLength={120} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></label>
                <label>คำอธิบาย<input maxLength={500} value={editing.description || ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></label>
                <label>KPI เป้าหมาย<input required maxLength={80} value={editing.target_kpi} onChange={(e) => setEditing({ ...editing, target_kpi: e.target.value })} /></label>
                {limitInputs(editing, setEditing, mechanicOf(template.mechanic)?.limits || [])}
                <div className="button-row"><button className="button button-primary button-small" disabled={busy}>บันทึก</button><button type="button" className="button button-quiet button-small" onClick={() => setEditing(null)}>ยกเลิก</button></div>
              </form>
            ) : <>
              <div>
                <strong>{template.name} <code className="template-code">{template.code}</code></strong>
                <small>กลไก: {mechanicOf(template.mechanic)?.label || template.mechanic} · KPI: {template.target_kpi}</small>
                {template.description && <small>{template.description}</small>}
                {rangeText(template.parameter_schema) && <small>ช่วงค่า: {rangeText(template.parameter_schema)}</small>}
                <small>ข้อเสนอ AI {template.suggestion_count} ครั้ง · แคมเปญ {template.campaign_count} แคมเปญ</small>
                <span className={`status-badge ${template.archived_at ? 'status-ended' : template.active ? 'status-active' : 'status-draft'}`}>
                  {template.archived_at ? 'เก็บเข้าคลัง' : template.active ? 'เปิดใช้งาน' : 'ปิดอยู่'}
                </span>
              </div>
              {!template.archived_at && <div className="button-row">
                <button className="button button-outline button-small" disabled={busy} onClick={() => setEditing({ ...template, limits: limitsFromSchema(template.parameter_schema) })}>แก้ไข</button>
                <button className="button button-outline button-small" disabled={busy} onClick={() => toggle(template)}>{template.active ? 'ปิด' : 'เปิด'}</button>
                <button className="button button-quiet button-small" disabled={busy} onClick={() => remove(template)}>ลบ</button>
              </div>}
            </>}
          </article>
        ))}</div>
      </section>

      <section className="card">
        <h2>เพิ่มแม่แบบใหม่</h2>
        <form className="form-stack" onSubmit={create}>
          <div className="form-grid">
            <label>รหัส (A-Z, 0-9, _)<input required pattern="[A-Za-z][A-Za-z0-9_]{2,49}" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="เช่น MONDAY_DEAL" /></label>
            <label>กลไก<select value={form.mechanic} onChange={(e) => setForm({ ...form, mechanic: e.target.value, limits: {} })}>
              {data.mechanics.map((m) => <option key={m.code} value={m.code}>{m.label}</option>)}
            </select></label>
            <label>ชื่อแม่แบบ<input required maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label>KPI เป้าหมาย<input required maxLength={80} value={form.target_kpi} onChange={(e) => setForm({ ...form, target_kpi: e.target.value })} placeholder="เช่น revenue_by_day" /></label>
          </div>
          <label>คำอธิบาย<input maxLength={500} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          {mechanicLimits.length > 0 && <div className="form-stack"><span className="muted">ช่วงค่าที่อนุญาต</span>{limitInputs(form, setForm, mechanicLimits)}</div>}
          <div className="button-row"><button className="button button-primary" disabled={busy}>เพิ่มแม่แบบ</button></div>
        </form>
      </section>
    </div>
  );
}
