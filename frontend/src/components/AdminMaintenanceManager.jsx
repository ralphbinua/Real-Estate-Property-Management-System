import { useState, useEffect } from 'react';
import { Table, Form, Card, Alert } from 'react-bootstrap';
import { fetchMaintenanceRequests, updateMaintenanceStatus } from '../services/maintenanceService';
import { renderStatusBadge } from '../utils/badgeUtils';

export default function AdminMaintenanceManager() {
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadRequests = async () => {
    try {
      const data = await fetchMaintenanceRequests();
      setRequests(data);
    } catch (err) {
      setError('Failed to load maintenance tickets.');
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const handleStatusChange = async (id, newStatus) => {
    setError('');
    setSuccess('');
    try {
      await updateMaintenanceStatus(id, newStatus);
      setSuccess('Maintenance status updated.');
      loadRequests();
    } catch (err) {
      setError('Failed to update ticket status.');
    }
  };

  return (
    <Card className="shadow-sm border-0 mb-4">
      <Card.Header className="bg-white fw-bold py-3 text-dark border-bottom">
        System-Wide Maintenance Request Queue
      </Card.Header>
      <Card.Body className="p-0">
        {error && <Alert variant="danger" className="m-3">{error}</Alert>}
        {success && <Alert variant="success" className="m-3">{success}</Alert>}
        
        <Table hover responsive className="mb-0 align-middle bg-white">
          <thead className="table-light">
            <tr>
              <th>Property</th>
              <th>Tenant</th>
              <th>Description</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {requests.length > 0 ? (
              requests.map((req) => (
                <tr key={req._id}>
                  <td className="fw-bold">{req.property?.title || req.property}</td>
                  <td>{req.tenant?.name || req.tenant}</td>
                  <td className="text-secondary">{req.issueDescription}</td>
                  <td>{renderStatusBadge(req.status)}</td>
                  <td>
                    <Form.Select 
                      size="sm" 
                      value={req.status} 
                      onChange={(e) => handleStatusChange(req._id, e.target.value)}
                      style={{ width: '140px' }}
                    >
                      <option value="Open">Open</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Resolved">Resolved</option>
                    </Form.Select>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="5" className="text-center text-muted py-4">No maintenance tickets submitted.</td>
              </tr>
            )}
          </tbody>
        </Table>
      </Card.Body>
    </Card>
  );
}