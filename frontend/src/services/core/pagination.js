import api from './api';

export const PAGE_SIZE = 50;

export function normalizePage(data) {
  if (Array.isArray(data)) {
    return { count: data.length, next: null, previous: null, results: data };
  }
  return {
    count: Number(data?.count || 0),
    next: data?.next || null,
    previous: data?.previous || null,
    results: Array.isArray(data?.results) ? data.results : [],
  };
}

export async function fetchPage(url, { page = 1, pageSize = PAGE_SIZE, ...filters } = {}) {
  const response = await api.get(url, {
    params: { ...filters, page, page_size: pageSize },
  });
  return normalizePage(response.data);
}
