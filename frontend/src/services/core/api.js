import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
  withXSRFToken: true,
  xsrfCookieName: 'csrftoken',
  xsrfHeaderName: 'X-CSRFToken',
  headers: {
    'Content-Type': 'application/json',
  },
});

let sessionExpiryReported = false;

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const requestUrl = error.config?.url || '';
    if (
      [401, 403].includes(error.response?.status)
      && !requestUrl.includes('/auth/')
      && !requestUrl.includes('/users/me/')
      && !sessionExpiryReported
    ) {
      try {
        await api.get('/users/me/');
      } catch (probeError) {
        if ([401, 403].includes(probeError.response?.status)) {
          sessionExpiryReported = true;
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('auth:session-expired'));
          }
        }
      }
    }

    return Promise.reject(error);
  },
);

export const resetSessionExpiry = () => {
  sessionExpiryReported = false;
};

export default api;
