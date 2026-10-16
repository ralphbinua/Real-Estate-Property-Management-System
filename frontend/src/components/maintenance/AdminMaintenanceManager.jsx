import { useState } from 'react';
import { Form, Alert, Spinner } from 'react-bootstrap';
import Table from '../ui/ResponsiveTable.jsx';
import { assignMaintenanceRequest, fetchMaintenanceRequestsPage, updateMaintenanceStatus } from '../../services/maintenance/maintenanceService';
import usePaginatedCollection from '../../hooks/usePaginatedCollection';
import CollectionPagination from '../ui/CollectionPagination';
import { useAuth } from '../../context/useAuth';

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
  const { user } = useAuth();
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

  const handleAssignmentChange = async (id, assignedTo) => {
    setError('');
    setSuccess('');
    try {
      await assignMaintenanceRequest(id, assignedTo ? Number(assignedTo) : null);
      setSuccess('Maintenance assignment updated.');
      refresh();
    } catch (err) {
      setError(err.response?.data?.assignedTo?.[0] || 'Failed to assign the request.');
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
                <th>Assigned to</th>
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

                  const assigneeOptions = [user, req.propertyDetails?.managerDetails, req.assignedToDetails]
                    .filter((person) => person?._id && person.isActive !== false && person.isDeleted !== true)
                    .filter((person, index, people) => people.findIndex((candidate) => candidate._id === person._id) === index);

                  return (
                    <tr key={reqId}>
                      <td className="fw-bold pm-cell-title">{propertyTitle}</td>
                      <td>{tenantName}</td>
                      <td className="text-secondary">{req.issueDescription || req.title}</td>
                      <td>
                        <StatusPill status={req.status} />
                      </td>
                      <td>
                        <Form.Select
                          size="sm"
                          className="pm-input"
                          aria-label={`Assign maintenance request ${reqId}`}
                          value={req.assignedTo ?? ''}
                          onChange={(e) => handleAssignmentChange(reqId, e.target.value)}
                        >
                          <option value="">Unassigned</option>
                          {assigneeOptions.map((person) => (
                            <option key={person._id} value={person._id}>{person.name || person.email}</option>
                          ))}
                        </Form.Select>
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
                  <td colSpan="6" className="text-center text-muted py-4">No maintenance tickets submitted.</td>
                </tr>
              )}
            </tbody>
          </Table>
        )}
        {!loading && <CollectionPagination count={count} page={page} pageCount={pageCount} onPageChange={setPage} />}
    </>
  );
}
