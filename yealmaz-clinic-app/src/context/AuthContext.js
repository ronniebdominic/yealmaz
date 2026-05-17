import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [clinic, setClinic] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Force past splash screen after 3 seconds no matter what
    const safetyTimeout = setTimeout(() => {
      setLoading(false);
    }, 3000);

    loadStoredAuth().finally(() => {
      clearTimeout(safetyTimeout);
      setLoading(false);
    });

    return () => clearTimeout(safetyTimeout);
  }, []);

  const loadStoredAuth = async () => {
    try {
      const [token, data] = await Promise.all([
        AsyncStorage.getItem('ya_clinic_token'),
        AsyncStorage.getItem('ya_clinic_data'),
      ]);
      if (token && data) {
        setClinic(JSON.parse(data));
      }
    } catch (err) {
      // AsyncStorage failed — just show login screen
      console.log('Storage error:', err.message);
    }
  };

  const login = async (email, password) => {
    try {
      const res = await api.post('/auth/clinic/login', { email, password });
      const { token, clinic } = res.data;
      try {
        await AsyncStorage.setItem('ya_clinic_token', token);
        await AsyncStorage.setItem('ya_clinic_data', JSON.stringify(clinic));
      } catch (storageErr) {
        console.log('Could not save session:', storageErr.message);
      }
      setClinic(clinic);
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err.response?.data?.error || 'Login failed. Please try again.'
      };
    }
  };

  const logout = async () => {
    try {
      await AsyncStorage.multiRemove(['ya_clinic_token', 'ya_clinic_data']);
    } catch (err) {
      console.log('Logout storage error:', err.message);
    }
    setClinic(null);
  };

  const updateClinic = async (data) => {
    const updated = { ...clinic, ...data };
    try {
      await AsyncStorage.setItem('ya_clinic_data', JSON.stringify(updated));
    } catch (err) {}
    setClinic(updated);
  };

  return (
    <AuthContext.Provider value={{ clinic, login, logout, loading, updateClinic }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);