import api from '../core/api';

export const fetchExpenses = async (params = {}) => (await api.get('/expenses/', { params })).data;
export const createExpense = async (data) => (await api.post('/expenses/', data)).data;
export const reviseExpense = async (id, data) => (await api.patch(`/expenses/${id}/`, data)).data;
export const decideExpense = async (id, approved, note = '') => (await api.post(`/expenses/${id}/decide/`, { approved, note })).data;
export const reverseExpense = async (id, reason) => (await api.post(`/expenses/${id}/reverse/`, { reason })).data;
export const fetchOwnerStatement = async (propertyId, month) => (await api.get('/expenses/statement/', { params: { propertyId, month } })).data;
