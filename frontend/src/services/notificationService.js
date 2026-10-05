import api from './api';

export async function listNotifications({ page = 1, pageSize = 20 } = {}) {
  const response = await api.get('/notifications/', {
    params: { page, page_size: pageSize },
  });
  return response.data;
}

export async function markNotificationRead(id) {
  const response = await api.post(`/notifications/${encodeURIComponent(id)}/read/`);
  return response.data;
}

export async function markAllNotificationsRead() {
  const response = await api.post('/notifications/mark-all-read/');
  return response.data;
}
