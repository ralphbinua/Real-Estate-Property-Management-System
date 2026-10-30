import { Fragment, useState } from 'react';
import { Form, Alert, Spinner, Button } from 'react-bootstrap';
import Table from '../ui/ResponsiveTable.jsx';
import { assignMaintenanceRequest, fetchMaintenanceRequestsPage, updateMaintenanceStatus, updateMaintenanceWorkOrder, requestMaintenanceApproval, createMaintenanceExpenseDraft } from '../../services/maintenance/maintenanceService';
import usePaginatedCollection from '../../hooks/usePaginatedCollection';
import CollectionPagination from '../ui/CollectionPagination';
import ExportCsvButton from '../ui/ExportCsvButton';
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
  const [expanded, setExpanded] = useState(null);
  const [draft, setDraft] = useState({});

  const workAction = async (id, approval = false) => {
    setError(''); setSuccess('');
    try {
      if (approval) await requestMaintenanceApproval(id);
      else await updateMaintenanceWorkOrder(id, draft[id] || {});
      setSuccess(approval ? 'Owner approval requested.' : 'Work order saved.');
      refresh();
    } catch (err) {
      const data = err.response?.data;
      setError(data?.estimateAmount?.[0] || data?.approvalStatus?.[0] || data?.status?.[0] || 'Could not update the work order.');
    }
  };

  const handleStatusChange = async (id, newStatus) => {
    setError('');
    setSuccess('');
    try {
      await updateMaintenanceStatus(id, newStatus);
      setSuccess('Maintenance status updated.');
      refresh();
    } catch (err) {
      setError(err.response?.data?.status?.[0] || 'Failed to update ticket status.');
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

  const createExpenseDraft = async (id) => {
    setError(''); setSuccess('');
    try {
      const result = await createMaintenanceExpenseDraft(id);
      setSuccess(result.linkedExpenseId
        ? `Expense #${result.linkedExpenseId} is linked. Review or edit it under Property expenses before submitting.`
        : 'Expense draft linked. Review or edit it under Property expenses before submitting.');
      refresh();
    } catch (err) {
      const data = err.response?.data;
      setError(data?.expense?.[0] || data?.actualCost?.[0] || data?.status?.[0] || 'Could not create the expense draft.');
    }
  };

  return (
    <>
        <div className="d-flex justify-content-end p-2"><ExportCsvButton resource="maintenance" /></div>
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
                <th>Priority</th>
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

                  const values = draft[reqId] || {};
                  const field = (name, label, type = 'text') => <Form.Group key={name}><Form.Label className="small">{label}</Form.Label><Form.Control size="sm" type={type} min={type === 'number' ? '0' : undefined} step={type === 'number' ? '0.01' : undefined} value={values[name] ?? req[name] ?? ''} onChange={(e) => setDraft((current) => ({ ...current, [reqId]: { ...current[reqId], [name]: e.target.value } }))} /></Form.Group>;
                  return (
                    <Fragment key={reqId}><tr>
                      <td className="fw-bold pm-cell-title">{propertyTitle}</td>
                      <td>{tenantName}</td>
                      <td className="text-secondary">{req.issueDescription || req.title}</td>
                      <td>{req.priority}</td>
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
                        <Button size="sm" variant="link" onClick={() => setExpanded(expanded === reqId ? null : reqId)} aria-expanded={expanded === reqId}>Work order</Button>
                      </td>
                    </tr>
                    {expanded === reqId && <tr><td colSpan="7"><div className="d-flex flex-wrap gap-3 p-2 align-items-end">
                      {field('vendorName', 'Vendor')}{field('vendorContact', 'Vendor contact')}{field('estimateAmount', 'Estimate', 'number')}{field('actualCost', 'Actual cost', 'number')}
                      <Button size="sm" onClick={() => workAction(reqId)}>Save details</Button>
                      <Button size="sm" variant="outline-primary" disabled={req.approvalStatus === 'Pending' || req.approvalStatus === 'Approved' || !req.estimateAmount} onClick={() => workAction(reqId, true)}>Request Owner approval</Button>
                    </div><div className="px-2 pb-2">Approval: {req.approvalStatus}{req.approvalNote && ` · ${req.approvalNote}`}</div>
                    {req.linkedExpenseId ? <div className="px-2 pb-2 small text-success">Expense #{req.linkedExpenseId} · {req.linkedExpenseStatus}</div> : <div className="px-2 pb-2"><Button size="sm" variant="outline-success" disabled={req.status !== 'Resolved' || !Number(req.actualCost) || req.approvalStatus !== 'Approved'} onClick={() => createExpenseDraft(reqId)}>Create expense draft</Button><small className="ms-2 text-muted">Available after resolution, Owner estimate approval, and final cost entry.</small></div>}
                    {req.activity?.length > 0 && <details className="px-2 pb-2"><summary>History</summary><ul>{req.activity.map((event, index) => <li key={`${event.at}-${index}`}>{event.summary}</li>)}</ul></details>}
                    </td></tr>}
                    </Fragment>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="7" className="text-center text-muted py-4">No maintenance tickets submitted.</td>
                </tr>
              )}
            </tbody>
          </Table>
        )}
        {!loading && <CollectionPagination count={count} page={page} pageCount={pageCount} onPageChange={setPage} />}
    </>
  );
}
