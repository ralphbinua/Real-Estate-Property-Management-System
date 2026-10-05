import { Button, Spinner, Table } from 'react-bootstrap';
import { fetchSystemActivityPage } from '../services/userService';
import usePaginatedCollection from '../hooks/usePaginatedCollection';
import CollectionPagination from './CollectionPagination';

export default function AdminActivityLog() {
  const { items: events, count, page, pageCount, loading, error, setPage, refresh } = usePaginatedCollection(fetchSystemActivityPage);

  const handleRefresh = () => {
    refresh();
  };

  return (
    <div>
      <div className="d-flex justify-content-end mb-2"><Button size="sm" variant="outline-secondary" onClick={handleRefresh}>Refresh</Button></div>
      {error && <div className="alert alert-danger">{error} <Button size="sm" variant="outline-danger" onClick={refresh}>Retry</Button></div>}
      {loading ? <div className="py-4 text-center"><Spinner size="sm" className="me-2" />Loading activity…</div> : (
        <Table responsive className="pm-table mb-0">
          <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Record</th><th>Details</th></tr></thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id}>
                <td>{new Date(event.createdAt).toLocaleString()}</td><td>{event.actor}</td><td>{event.action}</td>
                <td>{event.entityType} {event.entityId}</td><td>{event.summary}</td>
              </tr>
            ))}
            {events.length === 0 && <tr><td colSpan="5" className="text-center text-muted py-4">No activity recorded yet.</td></tr>}
          </tbody>
        </Table>
      )}
      {!loading && <CollectionPagination count={count} page={page} pageCount={pageCount} onPageChange={setPage} />}
    </div>
  );
}
