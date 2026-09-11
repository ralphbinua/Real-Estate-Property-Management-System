import api from './api';

export const fetchUsers = async () => {
  const response = await api.get('/users');
  return response.data;
};

export const createUserByAdmin = async (userData) => {
  const response = await api.post('/users', userData);
  return response.data;
};

export const updateUserRole = async (userId, role) => {
  const response = await api.put(`/users/${userId}/role`, { role });
  return response.data;
};

export const deleteUser = async (userId) => {
  const response = await api.delete(`/users/${userId}`);
  return response.data;
};