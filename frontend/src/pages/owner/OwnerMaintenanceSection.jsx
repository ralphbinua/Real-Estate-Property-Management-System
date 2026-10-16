import { useState } from 'react';
import { Alert, Button, Form } from 'react-bootstrap';
import Table from '../../components/ui/ResponsiveTable.jsx';
import OwnerStatusPill from './OwnerStatusPill.jsx';
import ExportCsvButton from '../../components/ui/ExportCsvButton.jsx';
import { decideMaintenanceApproval } from '../../services/maintenance/maintenanceService';

export default function OwnerMaintenanceSection({ requests, onRefresh }) {
  const [error, setError] = useState('');
  const [note, setNote] = useState({});
  const decide = async (id, approved) => {
    setError('');
    try {
      await decideMaintenanceApproval(id, approved, note[id] || '');
      await onRefresh();
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not record your decision.');
    }
  };
  return (
    <div>
      {error && <Alert variant="danger">{error}</Alert>}
      <div className="d-flex justify-content-end mb-2"><ExportCsvButton resource="maintenance" /></div>
      <Table responsive className="pm-table mb-0">
        <thead>
          <tr>
            <th>Property</th>
            <th>Issue Description</th>
            <th>Status</th>
            <th>Work order</th>
          </tr>
        </thead>
        <tbody>
          {requests.length > 0 ? (
            requests.map((request) => {
              const requestId = request._id || request.id;
              const propertyTitle = request.propertyDetails?.title
                || request.property?.title
                || request.property
                || 'Property Asset';

              return (
                <tr key={requestId}>
                  <td className="pm-cell-title">{propertyTitle}</td>
                  <td>{request.title || request.issueDescription}</td>
                  <td><OwnerStatusPill status={request.status} /></td>
                  <td>
                    <div>{request.priority} priority · Approval: {request.approvalStatus}</div>
                    {request.estimateAmount != null && <div>Estimate: {request.estimateAmount}</div>}
                    {request.actualCost != null && <div>Actual cost: {request.actualCost}</div>}
                    {request.approvalStatus === 'Pending' && <div className="mt-2">
                      <Form.Control size="sm" className="pm-input mb-2" aria-label={`Decision note for request ${requestId}`} placeholder="Decision note (optional)" value={note[requestId] || ''} onChange={(e) => setNote((current) => ({ ...current, [requestId]: e.target.value }))} />
                      <Button size="sm" className="me-2" onClick={() => decide(requestId, true)}>Approve</Button>
                      <Button size="sm" variant="outline-danger" onClick={() => decide(requestId, false)}>Reject</Button>
                    </div>}
                    {request.activity?.length > 0 && <details className="mt-2"><summary>History</summary><ul className="mb-0 ps-3">{request.activity.map((event, index) => <li key={`${event.at}-${index}`}>{event.summary}</li>)}</ul></details>}
                  </td>
                </tr>
              );
            })
          ) : (
            <tr>
              <td colSpan="4" className="pm-empty-row">
                No maintenance requests on record for your properties.
              </td>
            </tr>
          )}
        </tbody>
      </Table>
    </div>
  );
}
