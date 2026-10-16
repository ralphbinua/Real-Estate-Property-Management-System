import api from '../core/api';

export const fetchMyProfile = async () => (await api.get('/users/me/')).data;
export const updateMyProfile = async (data) => (await api.patch('/users/me/', data)).data;
export const changeMyPassword = async (data) => (await api.post('/auth/password/change/', data)).data;
export const requestEmailChange = async (data) => (await api.post('/auth/email/change/', data)).data;
