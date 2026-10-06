import api from './api';
import { fetchPage } from './pagination';

export const fetchInvoicesPage = (params) => fetchPage('/invoices/', params);
export const fetchTenantInvoicesPage = (tenantId, params = {}) => fetchPage('/invoices/tenant/', { ...params, tenantId });
export const fetchPaymentsPage = (params) => fetchPage('/payments/', params);

export const fetchPaymentAcknowledgment = async (paymentId) => {
  const response = await api.get(`/payments/${paymentId}/acknowledgment/`, { responseType: 'blob' });
  return response.data;
};

export const fetchInvoices = async () => {
  const response = await api.get('/invoices/');
  return response.data;
};

export const triggerMonthlyBilling = async () => {
  const response = await api.post('/invoices/run-monthly-billing/');
  return response.data;
};

export const recordPayment = async (invoiceId, paymentData) => {
  const response = await api.post('/payments/record/', { ...paymentData, invoice: invoiceId });
  return response.data;
};

export const submitTenantPayment = async (invoiceId, paymentPayload) => {
  const response = await api.post('/payments/', { ...paymentPayload, invoice: invoiceId });
  return response.data;
};

export const verifyPayment = async (paymentId) => {
  const response = await api.post(`/payments/${paymentId}/verify/`);
  return response.data;
};

export const rejectPayment = async (paymentId, reason) => {
  const response = await api.post(`/payments/${paymentId}/reject/`, { reason });
  return response.data;
};

export const reversePayment = async (paymentId, reason) => {
  const response = await api.post(`/payments/${paymentId}/reverse/`, { reason });
  return response.data;
};
