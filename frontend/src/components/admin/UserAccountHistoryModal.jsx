import { Alert, Button, Modal, Spinner } from 'react-bootstrap';
import Table from '../ui/ResponsiveTable.jsx';
import { fetchSystemActivityPage } from '../../services/users/userService';
import usePaginatedCollection from '../../hooks/usePaginatedCollection';
import CollectionPagination from '../ui/CollectionPagination';

export default function UserAccountHistoryModal({ user, onHide }) {
  const userId = user?._id || user?.id;
  const { items, count, page, pageCount, loading, error, setPage, refresh } = usePaginatedCollection(
    fetchSystemActivityPage,
    { entityType: 'User', entityId: String(userId || '') },
  );

  return (
    <Modal show onHide={onHide} size="xl" centered aria-labelledby="user-account-history-title">
      <Modal.Header closeButton>
        <Modal.Title id="user-account-history-title" className="fs-5">Account history: {user?.name || user?.email}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="text-muted small">Read-only record of administrative changes to this account.</p>
        {error && <Alert variant="danger">{error} <Button size="sm" variant="outline-danger" onClick={refresh}>Retry</Button></Alert>}
        {loading ? (
          <div className="py-4 text-center"><Spinner size="sm" className="me-2" />Loading account history…</div>
        ) : (
          <Table responsive className="pm-table mb-0">
            <thead><tr><th>Time</th><th>Changed by</th><th>Action</th><th>Details</th></tr></thead>
            <tbody>
              {items.map((event) => (
                <tr key={event.id}>
                  <td>{new Date(event.createdAt).toLocaleString()}</td>
                  <td>{event.actor}</td>
                  <td>{event.action}</td>
                  <td>{event.summary}</td>
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan="4" className="text-center text-muted py-4">No account changes are recorded.</td></tr>}
            </tbody>
          </Table>
        )}
      </Modal.Body>
      <Modal.Footer className="justify-content-between">
        {!loading && <CollectionPagination count={count} page={page} pageCount={pageCount} onPageChange={setPage} />}
        <Button variant="outline-secondary" onClick={onHide}>Close</Button>
      </Modal.Footer>
    </Modal>
  );
}
