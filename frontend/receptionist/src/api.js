import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const api = axios.create({ baseURL: API_URL });

// Attach JWT to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('ya_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto logout on 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('ya_token');
      localStorage.removeItem('ya_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// Trigger an authenticated file download from an export endpoint (e.g. .xlsx).
// Uses the axios instance so the JWT interceptor is applied (a plain <a href> would not be authed).
export async function downloadExport(path, params = {}, filename = 'export.xlsx') {
  const res = await api.get(path, { params, responseType: 'blob' });
  const url = window.URL.createObjectURL(new Blob([res.data]));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export default api;
