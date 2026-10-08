import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

let sessionExpiryReported = false;

// Interceptor to attach JWT token if present
api.interceptors.request.use((config) => {
  const user = JSON.parse(localStorage.getItem('user'));
  if (user && user.token) {
    config.headers.Authorization = `Bearer ${user.token}`;
    config._sentWithAuthToken = true;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isLoginRequest = error.config?.url?.includes('/auth/login/');
    if (
      error.response?.status === 401
      && error.config?._sentWithAuthToken
      && !isLoginRequest
      && !sessionExpiryReported
    ) {
      sessionExpiryReported = true;
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('auth:session-expired'));
      }
    }

    return Promise.reject(error);
  },
);

export const resetSessionExpiry = () => {
  sessionExpiryReported = false;
};

export default api;
