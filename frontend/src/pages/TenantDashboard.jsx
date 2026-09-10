import { useState, useEffect } from 'react';
import { Container, Table, Alert, Button, Form, Modal } from 'react-bootstrap';
import { fetchMaintenanceRequests, createMaintenanceRequest } from '../services/maintenanceService';

export default function TenantDashboard() {
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showModal, setShowModal] = useState(false);
  
  const [formData, setFormData] = useState({
    property: '',
    issueDescription: '',
  });

  const loadRequests = async () => {
    try {
      const data = await fetchMaintenanceRequests();
      setRequests(data);
    } catch (err) {
      setError('Failed to fetch maintenance requests.');
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      await createMaintenanceRequest(formData);
      setSuccess('Maintenance request submitted successfully!');
      setFormData({ property: '', issueDescription: '' });
      setShowModal(false);
      loadRequests();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit request');
    }
  };

  return (
    <Container className="mt-5 mb-5">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>Tenant Dashboard - Maintenance Tickets</h2>
        <Button variant="primary" onClick={() => setShowModal(true)}>
          Report New Issue
        </Button>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}
      {success && <Alert variant="success">{success}</Alert>}

      <Table striped bordered hover className="mt-4">
        <thead>
          <tr>
            <th>Property ID</th>
            <th>Issue Description</th>
            <th>Status</th>
            <th>Date Submitted</th>
          </tr>
        </thead>
        <tbody>
          {requests.length > 0 ? (
            requests.map((req) => (
              <tr key={req._id}>
                <td>{req.property?.title || req.property}</td>
                <td>{req.issueDescription}</td>
                <td>
                  <span className={`badge bg-${req.status === 'Open' ? 'warning' : req.status === 'In Progress' ? 'info' : 'success'}`}>
                    {req.status}
                  </span>
                </td>
                <td>{new Date(req.createdAt).toLocaleDateString()}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="4" className="text-center">No maintenance requests found.</td>
            </tr>
          )}
        </tbody>
      </Table>

      {/* Modal for Submitting Request */}
      <Modal show={showModal} onHide={() => setShowModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Report Maintenance Issue</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleSubmit}>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>Property ID</Form.Label>
              <Form.Control 
                placeholder="Paste your rented Property ID"
                value={formData.property}
                onChange={(e) => setFormData({ ...formData, property: e.target.value })}
                required 
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Issue Description</Form.Label>
              <Form.Control 
                as="textarea" 
                rows={3}
                placeholder="Describe the problem..."
                value={formData.issueDescription}
                onChange={(e) => setFormData({ ...formData, issueDescription: e.target.value })}
                required 
              />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button variant="primary" type="submit">Submit Ticket</Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </Container>
  );
}