import { useState, useEffect } from 'react';
import { Container, Table, Alert, Badge } from 'react-bootstrap';
import { fetchProperties } from '../services/propertyService';
import { fetchMaintenanceRequests, updateMaintenanceStatus } from '../services/maintenanceService';

export default function ManagerDashboard() {
  const [properties, setProperties] = useState([]);
  const [maintenance, setMaintenance] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadData = async () => {
    try {
      const propData = await fetchProperties();
      const maintData = await fetchMaintenanceRequests();
      setProperties(propData);
      setMaintenance(maintData);
    } catch (err) {
      setError('Failed to load manager dashboard data.');
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleStatusChange = async (id, newStatus) => {
    try {
      await updateMaintenanceStatus(id, newStatus);
      setSuccess(`Maintenance status updated to ${newStatus}`);
      loadData();
    } catch (err) {
      setError('Failed to update maintenance status');
    }
  };

  return (
    <Container className="mt-5 mb-5">
      <h2>Property Manager Dashboard</h2>
      {error && <Alert variant="danger">{error}</Alert>}
      {success && <Alert variant="success">{success}</Alert>}

      <h4 className="mt-4">Managed Properties</h4>
      <Table striped bordered hover>
        <thead>
          <tr>
            <th>Title</th>
            <th>Type</th>
            <th>Price</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {properties.map((prop) => (
            <tr key={prop._id}>
              <td>{prop.title}</td>
              <td>{prop.propertyType}</td>
              <td>₱{prop.price?.toLocaleString()}</td>
              <td>{prop.status}</td>
            </tr>
          ))}
        </tbody>
      </Table>

      <h4 className="mt-5">Maintenance Tickets Overview</h4>
      <Table striped bordered hover>
        <thead>
          <tr>
            <th>Property</th>
            <th>Tenant</th>
            <th>Issue</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {maintenance.length > 0 ? (
            maintenance.map((req) => (
              <tr key={req._id}>
                <td>{req.property?.title || 'N/A'}</td>
                <td>{req.tenant?.name || 'N/A'}</td>
                <td>{req.issueDescription}</td>
                <td>
                  <Badge bg={req.status === 'Open' ? 'warning' : req.status === 'In Progress' ? 'info' : 'success'}>
                    {req.status}
                  </Badge>
                </td>
                <td>
                  {req.status !== 'In Progress' && (
                    <button className="btn btn-sm btn-outline-primary me-2" onClick={() => handleStatusChange(req._id, 'In Progress')}>
                      Set In Progress
                    </button>
                  )}
                  {req.status !== 'Resolved' && (
                    <button className="btn btn-sm btn-outline-success" onClick={() => handleStatusChange(req._id, 'Resolved')}>
                      Resolve
                    </button>
                  )}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="5" className="text-center">No maintenance requests found.</td>
            </tr>
          )}
        </tbody>
      </Table>
    </Container>
  );
}