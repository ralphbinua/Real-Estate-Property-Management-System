import api from './api';

export const fetchOwnerPortfolio = async () => {
  const response = await api.get('/owner/portfolio');
  return response.data;
};