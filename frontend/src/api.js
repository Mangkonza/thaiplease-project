import axios from 'axios';
import { uploadUrl } from './utils/payment-links';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('thaiplease_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export function getErrorMessage(error) {
  return error.response?.data?.message || error.message || 'เกิดข้อผิดพลาด กรุณาลองอีกครั้ง';
}

export function imageSrc(imagePath) {
  return uploadUrl(api.defaults.baseURL, imagePath, window.location.origin);
}

export default api;
