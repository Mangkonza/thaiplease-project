import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { Store, LogOut, MapPin, Tag, PlusCircle, RefreshCw } from 'lucide-react';

export default function DashboardPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);

  // ดึงข้อมูลเมื่อเปิดหน้าเว็บ
  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    fetchMyShops();
  }, []);

  const fetchMyShops = async () => {
    setLoading(true);
    try {
      const response = await api.get('/shops/my');
      if (response.data.success) {
        setShops(response.data.shops);
      }
    } catch (err) {
      console.error('Failed to fetch shops:', err);
      // หาก Token หมดอายุ ให้ดีดออกไปหน้า Login
      if (err.response?.status === 401 || err.response?.status === 403) {
        handleLogout();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* แถบ Navbar ด้านบน */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center shadow-md shadow-indigo-600/20">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-slate-800 leading-tight">ThaiPlease</h1>
              <p className="text-xs text-slate-500">Merchant Portal</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold text-slate-700">{user?.display_name || 'เจ้าของร้าน'}</p>
              <span className="text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full font-medium">
                {user?.role}
              </span>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
              title="ออกจากระบบ"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* เนื้อหาหลัก */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-800">ร้านค้าของคุณ</h2>
            <p className="text-sm text-slate-500">จัดการข้อมูลร้านค้าและเตรียมพร้อมสำหรับ AI Advisor</p>
          </div>
          <button
            onClick={fetchMyShops}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            รีเฟรช
          </button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400">กำลังโหลดข้อมูลร้านค้า...</div>
        ) : shops.length === 0 ? (
          /* กรณีที่ยังไม่มีร้านค้า */
          <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-12 text-center max-w-lg mx-auto">
            <Store className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-slate-700 mb-1">ยังไม่มีร้านค้าในระบบ</h3>
            <p className="text-sm text-slate-500 mb-4">เริ่มต้นสร้างร้านค้าของคุณเพื่อเปิดรับออเดอร์และใช้ระบบคำแนะนำ AI</p>
          </div>
        ) : (
          /* การ์ดแสดงรายการร้านค้า */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {shops.map((shop) => (
              <div
                key={shop.shop_id}
                className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <h3 className="font-bold text-slate-800 text-lg leading-tight">{shop.name}</h3>
                    <span className="px-2.5 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-700 rounded-full shrink-0">
                      {shop.status}
                    </span>
                  </div>

                  <p className="text-sm text-slate-600 line-clamp-2 mb-4">
                    {shop.description || 'ไม่มีคำอธิบายร้านค้า'}
                  </p>

                  <div className="space-y-1.5 text-xs text-slate-500">
                    <div className="flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5 text-slate-400" />
                      <span>หมวดหมู่: <strong className="text-slate-700">{shop.category || '-'}</strong></span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      <span>พื้นที่: <strong className="text-slate-700">{shop.area || '-'}</strong></span>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                  <span>ID: {shop.shop_id.slice(0, 8)}...</span>
                  <span className="text-indigo-600 font-semibold cursor-pointer hover:underline">
                    ดูภาพรวมยอดขาย &rarr;
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}