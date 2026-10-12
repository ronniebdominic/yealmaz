import { createContext, useContext, useState, useEffect } from 'react';
import api from './api';
import { reconnectSocket } from './socket';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    // A corrupted value must not blank the whole app — treat it as logged out.
    try {
      const stored = localStorage.getItem('ya_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      localStorage.removeItem('ya_user');
      return null;
    }
  });
  const [loading, setLoading] = useState(false);

  const login = async (email, password) => {
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { email, password });
      const { token, user } = res.data;
      localStorage.setItem('ya_token', token);
      localStorage.setItem('ya_user', JSON.stringify(user));
      setUser(user);
      reconnectSocket();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.response?.data?.error || 'Login failed' };
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('ya_token');
    localStorage.removeItem('ya_user');
    setUser(null);
    reconnectSocket();
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
