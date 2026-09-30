import api from './api';

export const createUnit = async (data) => (await api.post('/properties/units/', data)).data;
export const updateUnit = async (id, data) => (await api.patch(`/properties/units/${id}/`, data)).data;
export const deleteUnit = async (id) => (await api.delete(`/properties/units/${id}/`)).data;
