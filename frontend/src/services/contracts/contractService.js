import api from '../core/api';
import { fetchPage } from '../core/pagination';

export const fetchContractsPage = (params) => fetchPage('/contracts/', params);

export const fetchContracts = async () => {
  const response = await api.get('/contracts/');
  return response.data;
};

export const createContract = async (contractData) => {
  const response = await api.post('/contracts/', contractData);
  return response.data;
};

export const terminateContract = async (id, terminationData) => {
  const response = await api.post(`/contracts/${id}/terminate/`, terminationData);
  return response.data;
};

export const activateContract = async (id, activationData) => {
  const response = await api.post(`/contracts/${id}/activate/`, activationData);
  return response.data;
};

export const proposeLeaseRenewal = async (id, data) => {
  const response = await api.post(`/contracts/${id}/renewal/`, data);
  return response.data;
};

export const decideLeaseRenewal = async (id, approve) => {
  const response = await api.post(`/contracts/${id}/renewal-decision/`, { approve });
  return response.data;
};

export const prepareLeaseRenewal = async (id) => {
  const response = await api.post(`/contracts/${id}/prepare-renewal/`);
  return response.data;
};

export const moveOutLease = async (id, data) => (await api.post(`/contracts/${id}/move-out/`, data)).data;
export const fetchLeaseInspections = async (id) => (await api.get(`/contracts/${id}/inspection/`)).data;
export const recordLeaseInspection = async (id, data) => (await api.post(`/contracts/${id}/inspection/`, data)).data;
export const acknowledgeLeaseInspection = async (id, inspectionId) => (await api.post(`/contracts/${id}/inspection-acknowledge/`, { inspectionId })).data;
export const fetchDepositSettlement = async (id) => (await api.get(`/contracts/${id}/deposit-settlement/`)).data;
export const requestDepositSettlement = async (id, data) => (await api.post(`/contracts/${id}/deposit-settlement/`, data)).data;
export const decideDepositSettlement = async (id, approved, note = '') => (await api.post(`/contracts/${id}/deposit-decision/`, { approved, note })).data;
export const completeLeaseTurnover = async (id) => (await api.post(`/contracts/${id}/complete-turnover/`)).data;
