import api from '../core/api';
import { fetchPage } from '../core/pagination';

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

export const assignMaintenanceRequest = async (id, assignedTo) => {
  const response = await api.patch(`/maintenance/${id}/`, { assignedTo });
  return response.data;
};
