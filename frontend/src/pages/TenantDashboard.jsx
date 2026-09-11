import { useState, useEffect } from 'react';
import { Container, Table, Alert, Button, Form, Modal, Card, Row, Col } from 'react-bootstrap';
import { fetchMaintenanceRequests, createMaintenanceRequest } from '../services/maintenanceService';
import { fetchProperties } from '../services/propertyService';
import { useAuth } from '../context/AuthContext';
import MetricCard from '../components/MetricCard';
import { renderStatusBadge } from '../utils/badgeUtils';

export default function TenantDashboard() {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [availableProperties, setAvailableProperties] = useState([]);
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
    const loadData = async () => {
      try {
        const requestsData = await fetchMaintenanceRequests();
        const propertiesData = await fetchProperties();
        setRequests(requestsData);
        setAvailableProperties(propertiesData);
      } catch (err) {
        setError('Failed to fetch dashboard records.');
      }
    };
    loadData();
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

  // Metrics Calculations
  const totalTickets = requests.length;
  const openTickets = requests.filter(r => r.status?.toLowerCase() === 'open').length;
  const inProgressTickets = requests.filter(r => r.status?.toLowerCase() === 'in progress').length;
  const resolvedTickets = requests.filter(r => r.status?.toLowerCase() === 'resolved').length;

  return (
    <div className="bg-light min-vh-100 py-4">
      <Container>
        {/* Header Block */}
        <div className="bg-white p-4 rounded border shadow-sm mb-4 d-flex justify-content-between align-items-center">
          <div>
            <h2 className="fw-bold text-dark mb-1">Welcome back, {user?.name || 'Tenant'}!</h2>
            <p className="text-secondary mb-0">Tenant Portal: Track your active maintenance requests and report issues</p>
          </div>
          <Button variant="primary" className="fw-bold" onClick={() => setShowModal(true)}>
            + Report New Issue
          </Button>
        </div>

        {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}
        {success && <Alert variant="success" dismissible onClose={() => setSuccess('')}>{success}</Alert>}

        {/* Light Metric Cards Row */}
        <Row className="mb-2">
          <Col md={3}>
            <MetricCard title="Total Tickets" value={totalTickets} variant="primary" icon="📋" />
          </Col>
          <Col md={3}>
            <MetricCard title="Open Requests" value={openTickets} variant="warning" icon="⏳" />
          </Col>
          <Col md={3}>
            <MetricCard title="In Progress" value={inProgressTickets} variant="info" icon="🛠️" />
          </Col>
          <Col md={3}>
            <MetricCard title="Resolved" value={resolvedTickets} variant="success" icon="✅" />
          </Col>
        </Row>

        {/* Maintenance Log Card */}
        <Card className="shadow-sm border-0">
          <Card.Header className="bg-white fw-bold py-3 text-dark border-bottom">
            My Maintenance & Repair Log ({requests.length})
          </Card.Header>
          <Table hover responsive className="mb-0 align-middle bg-white">
            <thead className="table-light">
              <tr>
                <th>Property</th>
                <th>Issue Description</th>
                <th>Status</th>
                <th>Date Submitted</th>
              </tr>
            </thead>
            <tbody>
              {requests.length > 0 ? (
                requests.map((req) => (
                  <tr key={req._id}>
                    <td className="fw-bold text-dark">{req.property?.title || req.property}</td>
                    <td className="text-secondary">{req.issueDescription}</td>
                    <td>{renderStatusBadge(req.status)}</td>
                    <td className="text-muted">{new Date(req.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="4" className="text-center text-muted py-4">
                    No maintenance requests found. Click "+ Report New Issue" to create one.
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
        </Card>

        {/* Light Modal for Submitting Maintenance Request */}
        <Modal show={showModal} onHide={() => setShowModal(false)} centered>
          <Modal.Header closeButton className="bg-white border-bottom">
            <Modal.Title className="fw-bold text-dark">Report Maintenance Issue</Modal.Title>
          </Modal.Header>
          <Form onSubmit={handleSubmit}>
            <Modal.Body className="bg-white p-4">
              <Form.Group className="mb-3">
                <Form.Label className="fw-bold text-secondary">Select Property</Form.Label>
                <Form.Select
                  value={formData.property}
                  onChange={(e) => setFormData({ ...formData, property: e.target.value })}
                  required
                >
                  <option value="">-- Select Your Rented Property --</option>
                  {availableProperties.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.title} - {p.address}
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label className="fw-bold text-secondary">Issue Description</Form.Label>
                <Form.Control 
                  as="textarea" 
                  rows={4}
                  placeholder="Describe the issue in detail..."
                  value={formData.issueDescription}
                  onChange={(e) => setFormData({ ...formData, issueDescription: e.target.value })}
                  required 
                />
              </Form.Group>
            </Modal.Body>
            <Modal.Footer className="bg-white border-top">
              <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button variant="primary" type="submit" className="fw-bold">Submit Ticket</Button>
            </Modal.Footer>
          </Form>
        </Modal>
      </Container>
    </div>
  );
}