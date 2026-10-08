import { useEffect, useState } from 'react';
import AuthContext from './AuthContextValue';
import api, { resetSessionExpiry } from '../services/api';

export const AuthProvider = ({ children }) => {
  const [sessionExpired, setSessionExpired] = useState(false);
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('user');
    return savedUser ? JSON.parse(savedUser) : null;
  });

  useEffect(() => {
    const handleSessionExpired = () => {
      setUser(null);
      localStorage.removeItem('user');
      setSessionExpired(true);
    };

    window.addEventListener('auth:session-expired', handleSessionExpired);
    return () => window.removeEventListener('auth:session-expired', handleSessionExpired);
  }, []);

  const login = async (email, password) => {
    setSessionExpired(false);
    try {
      const response = await api.post('/auth/login/', {
        email,
        password,
      });

      const userData = response.data;
      resetSessionExpiry();
      setSessionExpired(false);
      setUser(userData);
      localStorage.setItem('user', JSON.stringify(userData));
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

  const logout = () => {
    resetSessionExpiry();
    setSessionExpired(false);
    setUser(null);
    localStorage.removeItem('user');
  };

  const updateUser = (updates) => {
    setUser((current) => {
      const updated = { ...current, ...updates };
      localStorage.setItem('user', JSON.stringify(updated));
      return updated;
    });
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, updateUser, sessionExpired }}>
      {children}
    </AuthContext.Provider>
  );
};
