import api from './api';
import { fetchPage } from './pagination';

export const fetchApplicationsPage = (params) => fetchPage('/properties/applications/', params);

export const createApplication = async (payload) => {
  const response = await api.post('/properties/applications/', payload);
  return response.data;
};

export const reviewApplication = async (id, payload) => {
  const response = await api.patch(`/properties/applications/${id}/`, payload);
  return response.data;
};

export const createLeaseFromApplication = async (id, payload) => {
  const response = await api.post(`/properties/applications/${id}/create-lease/`, payload);
  return response.data;
};
