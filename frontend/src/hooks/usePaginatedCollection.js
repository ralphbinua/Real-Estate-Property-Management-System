import { useCallback, useEffect, useMemo, useState } from 'react';
import { PAGE_SIZE, normalizePage } from '../services/pagination';

export default function usePaginatedCollection(fetchPage, filters = {}) {
  const filtersKey = JSON.stringify(filters || {});
  const stableFilters = useMemo(() => JSON.parse(filtersKey), [filtersKey]);
  const [pageState, setPageState] = useState({ page: 1, filtersKey });
  const page = pageState.filtersKey === filtersKey ? pageState.page : 1;
  const [items, setItems] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let current = true;
    Promise.resolve().then(() => {
      if (!current) return null;
      setLoading(true);
      setError('');
      return fetchPage({ ...stableFilters, page, pageSize: PAGE_SIZE });
    })
      .then((data) => {
        if (!current || !data) return;
        const result = normalizePage(data);
        setItems(result.results);
        setCount(result.count);
        setError('');
      })
      .catch((requestError) => {
        if (!current) return;
        if (page > 1 && requestError.response?.status === 404) {
          setPageState({ page: page - 1, filtersKey });
          return;
        }
        setError('Could not load this list. Please try again.');
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => { current = false; };
  }, [fetchPage, filtersKey, page, revision, stableFilters]);

  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const pageCount = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const changePage = useCallback((nextPage) => {
    setPageState((current) => {
      const currentPage = current.filtersKey === filtersKey ? current.page : 1;
      const target = typeof nextPage === 'function' ? nextPage(currentPage) : nextPage;
      return { page: Math.max(1, Math.min(pageCount, target)), filtersKey };
    });
  }, [filtersKey, pageCount]);

  return { items, count, page, pageCount, loading, error, setPage: changePage, refresh };
}
