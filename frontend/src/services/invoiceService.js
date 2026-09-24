import api from './api';

export const fetchInvoices = async () => {
  const response = await api.get('/invoices/');
  return response.data;
};

export const fetchTenantInvoices = async (tenantId) => {
  const response = await api.get(`/invoices/tenant/?tenantId=${tenantId}`);
  return response.data;
};

export const triggerMonthlyBilling = async () => {
  const response = await api.post('/invoices/run-monthly-billing/');
  return response.data;
};

export const recordPayment = async (invoiceId, paymentData) => {
  const response = await api.patch(`/invoices/${invoiceId}/record-payment/`, paymentData);
  return response.data;
};

export const submitTenantPayment = async (invoiceId, paymentPayload) => {
  const response = await api.patch(`/invoices/${invoiceId}/submit-payment/`, paymentPayload);
  return response.data;
};