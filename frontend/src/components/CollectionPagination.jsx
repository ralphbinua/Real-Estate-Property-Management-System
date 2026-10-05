import { Button } from 'react-bootstrap';

export default function CollectionPagination({ count, page, pageCount, onPageChange, pageSize = 50 }) {
  if (count <= pageSize) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, count);
  return (
    <div className="d-flex align-items-center justify-content-between gap-3 px-3 py-2 border-top bg-white">
      <small className="text-muted">Showing {first}–{last} of {count}</small>
      <div className="d-flex gap-2">
        <Button size="sm" variant="outline-secondary" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Previous</Button>
        <span className="small text-muted align-self-center">Page {page} of {pageCount}</span>
        <Button size="sm" variant="outline-secondary" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>Next</Button>
      </div>
    </div>
  );
}
