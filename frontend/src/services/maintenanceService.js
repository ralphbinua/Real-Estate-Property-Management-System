import api from './api';

export const fetchMaintenanceRequests = async () => {
  const response = await api.get('/maintenance');
  return response.data;
};

export const createMaintenanceRequest = async (data) => {
  const response = await api.post('/maintenance', data);
  return response.data;
};

export const updateMaintenanceStatus = async (id, status) => {
  const response = await api.patch(`/maintenance/${id}`, { status });
  return response.data;
};