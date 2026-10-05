import api from './api';
import { fetchPage } from './pagination';

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
