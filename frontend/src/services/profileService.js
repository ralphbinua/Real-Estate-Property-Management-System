import api from './api';

export const fetchMyProfile = async () => (await api.get('/users/me/')).data;
export const updateMyProfile = async (data) => (await api.patch('/users/me/', data)).data;
