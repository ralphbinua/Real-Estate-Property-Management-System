import api from '../core/api';
import { fetchPage } from '../core/pagination';

export const fetchInquiriesPage = (params) => fetchPage('/properties/inquiries/', params);

export const fetchProspectActivities = async (inquiryId) => {
  const response = await api.get(`/properties/inquiries/${inquiryId}/activities/`);
  return response.data;
};

export const createProspectActivity = async (inquiryId, payload) => {
  const response = await api.post(`/properties/inquiries/${inquiryId}/activities/`, payload);
  return response.data;
};

export const createInquiry = async (payload) => {
  const response = await api.post('/properties/inquiries/', payload);
  return response.data;
};

export const updateInquiry = async (id, payload) => {
  const response = await api.patch(`/properties/inquiries/${id}/`, payload);
  return response.data;
};
