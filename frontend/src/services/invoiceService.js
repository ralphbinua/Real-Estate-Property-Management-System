import api from './api';

export const fetchInvoices = async () => {
  const response = await api.get('/invoices/');
  return response.data;
};

export const fetchTenantInvoices = async (tenantId) => {
  const response = await api.get(`/invoices/tenant/?tenantId=${tenantId}`);
  return response.data;
};

export const generateMonthlyInvoices = async () => {
  const response = await api.post('/invoices/generate/');
  return response.data;
};

export const updateInvoiceStatus = async (id, status) => {
  const response = await api.patch(`/invoices/${id}/`, { status });
  return response.data;
};