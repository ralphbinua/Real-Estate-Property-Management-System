import { useState } from 'react';
import { Form, Alert, Spinner } from 'react-bootstrap';
import Table from './ResponsiveTable.jsx';
import { fetchMaintenanceRequestsPage, updateMaintenanceStatus } from '../services/maintenanceService';
import usePaginatedCollection from '../hooks/usePaginatedCollection';
import CollectionPagination from './CollectionPagination';

const STATUS_PILL_CLASS = {
  open: 'pm-pill-pending',
  'in progress': 'pm-pill-occupied',
  resolved: 'pm-pill-available',
  closed: 'pm-pill-default',
};

function StatusPill({ status }) {
  if (!status) return null;
  const cls = STATUS_PILL_CLASS[status.toLowerCase()] || 'pm-pill-default';
  return (
    <span className={`pm-pill ${cls}`}>
      <span className="pm-pill-dot" />
      {status}
    </span>
  );
}

export default function AdminMaintenanceManager() {
  const { items: requests, count, page, pageCount, loading, error: loadError, setPage, refresh } = usePaginatedCollection(fetchMaintenanceRequestsPage);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleStatusChange = async (id, newStatus) => {
    setError('');
    setSuccess('');
    try {
      await updateMaintenanceStatus(id, newStatus);
      setSuccess('Maintenance status updated.');
      refresh();
    } catch {
      setError('Failed to update ticket status.');
    }
  };

  return (
    <>
        {(error || loadError) && <Alert variant="danger" className="m-3" dismissible onClose={() => setError('')}>{error || loadError}</Alert>}
        {success && <Alert variant="success" className="m-3" dismissible onClose={() => setSuccess('')}>{success}</Alert>}

        {loading ? (
          <div className="text-center py-4 text-muted">
            <Spinner animation="border" size="sm" className="me-2" />
            Loading tickets...
          </div>
        ) : (
          <Table hover responsive className="mb-0 align-middle bg-white pm-table">
            <thead className="table-light">
              <tr>
                <th>Property</th>
                <th>Tenant</th>
                <th>Description</th>
                <th>Status</th>
                <th className="text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {requests.length > 0 ? (
                requests.map((req) => {
                  const reqId = req._id || req.id;
                  const propertyTitle =
                    req.propertyDetails?.title ||
                    req.property?.title ||
                    req.propertyTitle ||
                    (typeof req.property === 'string' ? req.property : null) ||
                    'N/A';

                  const tenantName =
                    req.tenantDetails?.name ||
                    req.tenant?.name ||
                    req.tenantName ||
                    (typeof req.tenant === 'string' ? req.tenant : null) ||
                    'N/A';

                  return (
                    <tr key={reqId}>
                      <td className="fw-bold pm-cell-title">{propertyTitle}</td>
                      <td>{tenantName}</td>
                      <td className="text-secondary">{req.issueDescription || req.title}</td>
                      <td>
                        <StatusPill status={req.status} />
                      </td>
                      <td className="text-center">
                        <Form.Select
                          size="sm"
                          className="pm-input d-inline-block"
                          value={req.status}
                          onChange={(e) => handleStatusChange(reqId, e.target.value)}
                          style={{ width: '140px' }}
                        >
                          <option value="Open">Open</option>
                          <option value="In Progress">In Progress</option>
                          <option value="Resolved">Resolved</option>
                        </Form.Select>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="5" className="text-center text-muted py-4">No maintenance tickets submitted.</td>
                </tr>
              )}
            </tbody>
          </Table>
        )}
        {!loading && <CollectionPagination count={count} page={page} pageCount={pageCount} onPageChange={setPage} />}
    </>
  );
}
