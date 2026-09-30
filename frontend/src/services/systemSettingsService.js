import api from './api';

export const fetchSystemSettings = async () => (await api.get('/settings/')).data;
export const updateSystemSettings = async (data) => (await api.patch('/settings/', data)).data;
