import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor: ดึง Token จาก localStorage แนบไปกับ Header ทุก Request อัตโนมัติ
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('thaiplease_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;