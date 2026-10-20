import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ProtectedRoute from './components/ProtectedRoute';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* หน้า Login สาธารณะ */}
        <Route path="/login" element={<LoginPage />} />

        {/* หน้า Dashboard สำหรับเจ้าของร้านที่มีสิทธิ์ */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />

        {/* ถ้าเปิดหน้าแรกสุด หรือเข้า URL มั่ว ให้ส่งไปหน้า /login */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;