import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

// Intercept requests to automatically attach the JWT token
api.interceptors.request.use((config) => {
  // We will store the logged-in user in localStorage shortly
  const user = JSON.parse(localStorage.getItem('user')); 
  
  if (user && user.token) {
    config.headers.Authorization = `Bearer ${user.token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

export default api;