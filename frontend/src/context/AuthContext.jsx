import { useEffect, useState } from 'react';
import AuthContext from './AuthContextValue';
import api, { resetSessionExpiry } from '../services/core/api';

export const AuthProvider = ({ children }) => {
  const [sessionExpired, setSessionExpired] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api.get('/users/me/')
      .then(({ data }) => { if (active) setUser(data); })
      .catch(() => { if (active) setUser(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const handleSessionExpired = () => {
      setUser(null);
      setSessionExpired(true);
    };

    window.addEventListener('auth:session-expired', handleSessionExpired);
    return () => window.removeEventListener('auth:session-expired', handleSessionExpired);
  }, []);

  const login = async (email, password) => {
    setSessionExpired(false);
    try {
      await api.get('/auth/csrf/');
      const response = await api.post('/auth/login/', {
        email,
        password,
      });

      const userData = response.data;
      resetSessionExpiry();
      setSessionExpired(false);
      setUser(userData);
      return { success: true, user: userData };
    } catch (error) {
      return { 
        success: false, 
        message: error.response?.data?.detail
          || error.response?.data?.message
          || (error.code === 'ERR_NETWORK'
            ? 'Cannot reach the server. Start the Django backend and try again.'
            : 'Login failed. Check your email and password.')
      };
    }
  };

  const logout = async () => {
    try {
      await api.get('/auth/csrf/');
      await api.post('/auth/logout/');
    } catch (error) {
      if (error.response?.status === 403) {
        try {
          await api.get('/users/me/');
          return false;
        } catch (probeError) {
          if (![401, 403].includes(probeError.response?.status)) return false;
        }
      } else if (error.response?.status !== 401) {
        return false;
      }
    }
    resetSessionExpiry();
    setSessionExpired(false);
    setUser(null);
    return true;
  };

  const updateUser = (updates) => {
    setUser((current) => {
      const updated = { ...current, ...updates };
      return updated;
    });
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, updateUser, sessionExpired, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
