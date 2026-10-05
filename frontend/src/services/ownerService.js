import api from './api';
import { normalizePage } from './pagination';

export const fetchOwnerPortfolio = async (section) => {
  const response = await api.get('/owner/portfolio/', {
    params: section ? { section } : undefined,
  });
  return response.data;
};

export const fetchOwnerPortfolioPage = async (section, params = {}) => {
  const { pageSize = 50, ...query } = params;
  const response = await api.get('/owner/portfolio/', {
    params: { ...query, section, page_size: pageSize },
  });
  const responseKey = {
    properties: 'properties',
    pricing: 'rentChangeRequests',
    contracts: 'contracts',
    history: 'leaseSigningHistory',
    maintenance: 'maintenanceRequests',
    payments: 'invoices',
  }[section];
  return normalizePage(response.data?.[responseKey]);
};
