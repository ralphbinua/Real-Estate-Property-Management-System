import api from './api';
import { fetchPage } from './pagination';

export const fetchProperties = async () => {
  const response = await api.get('/properties/');
  return Array.isArray(response.data) ? response.data : response.data.results;
};

export const createProperty = async (propertyData) => {
  const response = await api.post('/properties/', propertyData);
  return response.data;
};

export const updateProperty = async (id, propertyData) => {
  const response = await api.patch(`/properties/${id}/`, propertyData);
  return response.data;
};

export const deleteProperty = async (id) => {
  const response = await api.delete(`/properties/${id}/`);
  return response.data;
};

export const setLeaseSigningAuthority = async (id, authorityData) => {
  const response = await api.patch(`/properties/${id}/lease-signing-authority/`, authorityData);
  return response.data;
};

export const setLeaseTerminationAuthority = async (id, authorityData) => {
  const response = await api.patch(`/properties/${id}/termination-authority/`, authorityData);
  return response.data;
};

export const setUnitPricingAuthority = async (id, authorityData) => {
  const response = await api.patch(`/properties/${id}/rent-pricing-authority/`, authorityData);
  return response.data;
};

export const setApplicationApprovalPolicy = async (id, policyData) => {
  const response = await api.patch(`/properties/${id}/approval-policy/`, policyData);
  return response.data;
};

export const fetchRentChangeRequestsPage = (params) => fetchPage('/properties/rent-change-requests/', params);

export const proposeRentChange = async (proposal) => {
  const response = await api.post('/properties/rent-change-requests/', proposal);
  return response.data;
};

export const decideRentChange = async (id, decision) => {
  const response = await api.patch(`/properties/rent-change-requests/${id}/decision/`, decision);
  return response.data;
};
