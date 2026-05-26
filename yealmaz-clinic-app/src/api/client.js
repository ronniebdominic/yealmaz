import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Production backend ──
export const API_BASE = 'https://yealmaz-production.up.railway.app/api';

console.log('[API] Base URL:', API_BASE);

const api = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
});

// Attach token to every request + log
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('ya_clinic_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  console.log(`[API] --> ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`, config.params || '');
  return config;
});

// Log responses and errors; auto logout on 401
api.interceptors.response.use(
  (res) => {
    console.log(`[API] <-- ${res.status} ${res.config.url}`);
    return res;
  },
  async (err) => {
    if (err.response) {
      console.error(
        `[API] ERROR ${err.response.status} ${err.config?.url}:`,
        JSON.stringify(err.response.data)
      );
      if (err.response.status === 401) {
        await AsyncStorage.removeItem('ya_clinic_token');
        await AsyncStorage.removeItem('ya_clinic_data');
      }
    } else if (err.request) {
      console.error('[API] NO RESPONSE — server unreachable or timed out. Check API_BASE URL and that the backend is running.');
      console.error('[API] Request URL:', err.config?.baseURL + err.config?.url);
    } else {
      console.error('[API] Request setup error:', err.message);
    }
    return Promise.reject(err);
  }
);

export default api;
