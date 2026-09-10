import api from './api';

export const fetchContracts = async () => {
  const response = await api.get('/contracts');
  return response.data;
};

export const createContract = async (contractData) => {
  const response = await api.post('/contracts', contractData);
  return response.data;
};