import api from './api';

export const fetchApplications = async () => {
  const response = await api.get('/properties/applications/');
  return Array.isArray(response.data) ? response.data : response.data.results || [];
};

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
