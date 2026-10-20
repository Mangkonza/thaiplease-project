import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { 
  Store, 
  LogIn, 
  UserPlus, 
  AlertCircle, 
  CheckCircle2, 
  Mail, 
  Lock, 
  User, 
  ShoppingBag, 
  Users,
  Sparkles 
} from 'lucide-react';

export default function LoginPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('login'); // 'login' | 'register'

  // ฟอร์มเข้าสู่ระบบ
  const [loginEmail, setLoginEmail] = useState('owner@thaiplease.com');
  const [loginPassword, setLoginPassword] = useState('password123');

  // ฟอร์มสมัครสมาชิก
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regRole, setRegRole] = useState('MERCHANT'); // 'MERCHANT' | 'CITIZEN'

  // สถานะ UI
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // หากมี Token อยู่แล้วให้ข้ามไปหน้า Dashboard ทันที
  useEffect(() => {
    if (localStorage.getItem('token')) {
      navigate('/dashboard');
    }
  }, [navigate]);

  // เคลียร์ข้อความแจ้งเตือนเมื่อสลับแท็บ
  const handleSwitchTab = (newTab) => {
    setTab(newTab);
    setErrorMsg('');
    setSuccessMsg('');
  };

  // ดำเนินการเข้าสู่ระบบ
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const response = await api.post('/auth/login', {
        email: loginEmail,
        password: loginPassword,
      });

      if (response.data.success) {
        localStorage.setItem('token', response.data.token);
        localStorage.setItem('user', JSON.stringify(response.data.user));
        navigate('/dashboard');
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  // ดำเนินการสมัครสมาชิก
  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const response = await api.post('/auth/register', {
        email: regEmail,
        password: regPassword,
        display_name: regName,
        role: regRole,
      });

      if (response.data.success) {
        setSuccessMsg('สมัครสมาชิกสำเร็จเรียบร้อย! กำลังสลับไปหน้าเข้าสู่ระบบ...');
        setLoginEmail(regEmail);
        setLoginPassword(regPassword);
        
        // สลับกลับมาแท็บ Login พร้อมกรอกข้อมูลที่เพิ่งสมัครให้ทันที
        setTimeout(() => {
          setTab('login');
          setSuccessMsg('บัญชีของคุณพร้อมใช้งานแล้ว กรุณากดเข้าสู่ระบบ');
        }, 1200);
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'สมัครสมาชิกไม่สำเร็จ โปรดลองอีกครั้ง';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center p-4 selection:bg-indigo-500 selection:text-white">
      {/* Background Decorative Blur */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl"></div>
      </div>

      <div className="relative w-full max-w-md">
        {/* Main Card */}
        <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 p-8 sm:p-10 transition-all duration-300">
          
          {/* Header & Logo */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-tr from-indigo-600 to-violet-600 text-white rounded-2xl shadow-lg shadow-indigo-500/30 mb-3 transform hover:scale-105 transition-transform duration-200">
              <Store className="w-7 h-7" />
            </div>
            <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight flex items-center justify-center gap-1.5">
              ThaiPlease
              <Sparkles className="w-4 h-4 text-amber-500 fill-amber-400" />
            </h1>
            <p className="text-xs text-slate-500 mt-1 font-medium">AI Shop Performance Advisor</p>
          </div>

          {/* Segmented Tab Switcher */}
          <div className="bg-slate-100 p-1.5 rounded-2xl flex items-center mb-6 border border-slate-200/60 shadow-inner">
            <button
              type="button"
              onClick={() => handleSwitchTab('login')}
              className={`flex-1 py-2 text-xs sm:text-sm font-semibold rounded-xl transition-all duration-200 flex items-center justify-center gap-1.5 ${
                tab === 'login'
                  ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/50'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <LogIn className="w-4 h-4" />
              เข้าสู่ระบบ
            </button>
            <button
              type="button"
              onClick={() => handleSwitchTab('register')}
              className={`flex-1 py-2 text-xs sm:text-sm font-semibold rounded-xl transition-all duration-200 flex items-center justify-center gap-1.5 ${
                tab === 'register'
                  ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/50'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <UserPlus className="w-4 h-4" />
              สมัครสมาชิก
            </button>
          </div>

          {/* Alert Messages */}
          {errorMsg && (
            <div className="flex items-start gap-2.5 p-3.5 mb-5 text-xs sm:text-sm bg-rose-50 border border-rose-200/80 text-rose-600 rounded-2xl animate-shake">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="flex items-start gap-2.5 p-3.5 mb-5 text-xs sm:text-sm bg-emerald-50 border border-emerald-200/80 text-emerald-700 rounded-2xl">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Tab 1: Form Login */}
          {tab === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  อีเมลบัญชีผู้ใช้
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition text-sm text-slate-800 placeholder-slate-400"
                    placeholder="name@example.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  รหัสผ่าน
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition text-sm text-slate-800 placeholder-slate-400"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white rounded-xl font-semibold transition duration-150 flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/25 disabled:opacity-50 text-sm active:scale-[0.99]"
              >
                <LogIn className="w-4 h-4" />
                {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
              </button>
            </form>
          )}

          {/* Tab 2: Form Register */}
          {tab === 'register' && (
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  ชื่อที่ต้องการแสดง (Display Name)
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition text-sm text-slate-800 placeholder-slate-400"
                    placeholder="เช่น สมชาย ใจดี หรือชื่อร้าน"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  อีเมลสำหรับลงทะเบียน
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition text-sm text-slate-800 placeholder-slate-400"
                    placeholder="name@example.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  รหัสผ่าน
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition text-sm text-slate-800 placeholder-slate-400"
                    placeholder="อย่างน้อย 6 ตัวอักษร"
                  />
                </div>
              </div>

              {/* เลือกประเภทผู้ใช้งาน (Role Selection Card) */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  ประเภทบัญชีผู้ใช้
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setRegRole('MERCHANT')}
                    className={`p-3 rounded-xl border text-left transition-all duration-150 flex flex-col gap-1 ${
                      regRole === 'MERCHANT'
                        ? 'border-indigo-600 bg-indigo-50/70 text-indigo-900 ring-2 ring-indigo-600/20'
                        : 'border-slate-200 bg-slate-50/50 text-slate-600 hover:bg-slate-100/70'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      <ShoppingBag className="w-3.5 h-3.5 text-indigo-600" />
                      เจ้าของร้านค้า
                    </div>
                    <span className="text-[10px] text-slate-500 leading-tight">จัดการร้านและใช้ AI Advisor</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRegRole('CITIZEN')}
                    className={`p-3 rounded-xl border text-left transition-all duration-150 flex flex-col gap-1 ${
                      regRole === 'CITIZEN'
                        ? 'border-indigo-600 bg-indigo-50/70 text-indigo-900 ring-2 ring-indigo-600/20'
                        : 'border-slate-200 bg-slate-50/50 text-slate-600 hover:bg-slate-100/70'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs">
                      <Users className="w-3.5 h-3.5 text-indigo-600" />
                      ประชาชนทั่วไป
                    </div>
                    <span className="text-[10px] text-slate-500 leading-tight">สะสมเหรียญและรับส่วนลด</span>
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white rounded-xl font-semibold transition duration-150 flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/25 disabled:opacity-50 text-sm active:scale-[0.99]"
              >
                <UserPlus className="w-4 h-4" />
                {loading ? 'กำลังลงทะเบียน...' : 'ยืนยันการสมัครสมาชิก'}
              </button>
            </form>
          )}

          {/* Footer Info */}
          <div className="mt-8 pt-4 border-t border-slate-100 text-center">
            <p className="text-[11px] text-slate-400">
              ระบบวิเคราะห์ประสิทธิภาพร้านค้าชุมชนด้วย AI • โครงการ ThaiPlease
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}