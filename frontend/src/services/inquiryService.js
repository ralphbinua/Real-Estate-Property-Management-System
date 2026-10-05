import api from './api';
import { fetchPage } from './pagination';

export const fetchInquiriesPage = (params) => fetchPage('/properties/inquiries/', params);

export const fetchInquiries = async () => {
  const response = await api.get('/properties/inquiries/');
  return Array.isArray(response.data) ? response.data : response.data.results || [];
};

export const createInquiry = async (payload) => {
  const response = await api.post('/properties/inquiries/', payload);
  return response.data;
};

export const updateInquiry = async (id, payload) => {
  const response = await api.patch(`/properties/inquiries/${id}/`, payload);
  return response.data;
};
