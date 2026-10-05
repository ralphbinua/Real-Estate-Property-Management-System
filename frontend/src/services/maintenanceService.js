import api from './api';
import { fetchPage } from './pagination';

export const fetchMaintenanceRequestsPage = (params) => fetchPage('/maintenance/', params);

export const fetchMaintenanceRequests = async () => {
  const response = await api.get('/maintenance/');
  return response.data;
};

export const createMaintenanceRequest = async (data) => {
  const response = await api.post('/maintenance/', data);
  return response.data;
};

export const updateMaintenanceStatus = async (id, status) => {
  const response = await api.patch(`/maintenance/${id}/`, { status });
  return response.data;
};
