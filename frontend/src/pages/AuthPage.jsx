import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { getErrorMessage } from '../api';
import { useAuth } from '../auth-context';

export default function AuthPage() {
  const [mode, setMode] = useState('login');
  const [role, setRole] = useState('CITIZEN');
  const [form, setForm] = useState({ email: '', password: '', display_name: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();

  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'register') {
        await api.post('/auth/register', {
          email: form.email,
          password: form.password,
          display_name: form.display_name,
          role,
        });
      }
      const { data } = await api.post('/auth/login', { email: form.email, password: form.password });
      signIn(data.token, data.user);
      navigate(data.user.role === 'MERCHANT' ? '/merchant/shops' : data.user.role === 'ADMIN' ? '/admin/shops' : '/shops');
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="auth-layout">
      <div className="auth-story">
        <span className="eyebrow">LOCAL LOVE, EVERY DAY</span>
        <h1>ร้านดี ๆ<br />อยู่ใกล้กว่าที่คิด</h1>
        <p>ค้นพบร้านในชุมชน ชำระเงินง่าย และสะสมเหรียญทุกครั้งที่สนับสนุนร้านโปรด</p>
        <div className="story-stamp">ชุมชน<br />น่าแวะ</div>
      </div>
      <form className="card auth-card" onSubmit={submit}>
        <span className="eyebrow">{mode === 'login' ? 'WELCOME BACK' : 'JOIN OUR COMMUNITY'}</span>
        <h2>{mode === 'login' ? 'ยินดีต้อนรับกลับมา' : 'สร้างบัญชี ThaiPlease'}</h2>
        {mode === 'register' && <>
          <label>ชื่อที่แสดง<input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} maxLength="150" /></label>
          <label>สมัครเป็น<select value={role} onChange={(e) => setRole(e.target.value)}><option value="CITIZEN">ลูกค้า</option><option value="MERCHANT">เจ้าของร้าน</option></select></label>
        </>}
        <label>อีเมล<input type="email" required autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <label>รหัสผ่าน<input type="password" required minLength="6" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
        {error && <p className="notice notice-error" role="alert">{error}</p>}
        <button className="button button-primary button-wide" disabled={busy}>{busy ? 'กำลังดำเนินการ…' : mode === 'login' ? 'เข้าสู่ระบบ' : 'สมัครและเข้าสู่ระบบ'}</button>
        <p className="auth-switch">
          {mode === 'login' ? 'ยังไม่มีบัญชี?' : 'มีบัญชีอยู่แล้ว?'}{' '}
          <button type="button" className="text-button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
            {mode === 'login' ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ'}
          </button>
        </p>
      </form>
    </section>
  );
}
