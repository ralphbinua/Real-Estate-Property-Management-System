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

export const updateMaintenanceWorkOrder = async (id, data) => (await api.patch(`/maintenance/${id}/`, data)).data;
export const requestMaintenanceApproval = async (id) => (await api.post(`/maintenance/${id}/request-approval/`)).data;
export const decideMaintenanceApproval = async (id, approved, note = '') => (await api.post(`/maintenance/${id}/decide-approval/`, { approved, note })).data;
export const createMaintenanceExpenseDraft = async (id) => (await api.post(`/maintenance/${id}/create-expense/`)).data;
