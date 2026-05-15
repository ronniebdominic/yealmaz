import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Change this to your deployed backend URL when going live ──
export const API_BASE = 'http://10.0.2.2:5000/api'; // Replace with your PC's local IP
// export const API_BASE = 'https://your-backend.railway.app/api'; // Production

const api = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
});

// Attach token to every request
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('ya_clinic_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto logout on 401
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (err.response?.status === 401) {
      await AsyncStorage.removeItem('ya_clinic_token');
      await AsyncStorage.removeItem('ya_clinic_data');
    }
    return Promise.reject(err);
  }
);

export default api;
