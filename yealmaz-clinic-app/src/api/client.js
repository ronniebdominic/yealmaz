import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Change this to your deployed backend URL when going live ──
export const API_BASE = 'http://10.0.2.2:5000/api'; // Android emulator → host PC. Use localhost for Expo Web
// export const API_BASE = 'https://your-backend.railway.app/api'; // Production

console.log('[API] Base URL:', API_BASE);
if (API_BASE.includes('10.0.2.2')) {
  console.warn('[API] WARNING: Using Android emulator address (10.0.2.2). If running on a real device, update API_BASE in src/api/client.js to your PC\'s local IP (run `ipconfig` to find it).');
}

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
