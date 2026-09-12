import { useState, useEffect } from 'react';
import { Container, Table, Form, Modal, Spinner, Button, Row, Col } from 'react-bootstrap';
import { fetchMaintenanceRequests, createMaintenanceRequest } from '../services/maintenanceService';
import { fetchProperties } from '../services/propertyService';
import { useAuth } from '../context/AuthContext';
import './TenantDashboard.css';

const TICKET_PILL_CLASS = {
  open: 'pm-pill-open',
  'in progress': 'pm-pill-progress',
  resolved: 'pm-pill-resolved',
};

function TicketStatusPill({ status }) {
  if (!status) return null;
  const cls = TICKET_PILL_CLASS[status.toLowerCase()] || 'pm-pill-default';
  return (
    <span className={`pm-pill ${cls}`}>
      <span className="pm-pill-dot" />
      {status}
    </span>
  );
}

export default function TenantDashboard() {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [availableProperties, setAvailableProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showModal, setShowModal] = useState(false);

  const [formData, setFormData] = useState({
    property: '',
    issueDescription: '',
    priority: 'Medium',
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [requestsData, propertiesData] = await Promise.all([
        fetchMaintenanceRequests(),
        fetchProperties(),
      ]);
      setRequests(Array.isArray(requestsData) ? requestsData : []);
      const props = Array.isArray(propertiesData) ? propertiesData : [];
      setAvailableProperties(props);

      if (props.length === 1) {
        setFormData((prev) => ({ ...prev, property: props[0]._id }));
      }
      setError('');
    } catch (err) {
      setError('Failed to load dashboard records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      await createMaintenanceRequest(formData);
      setSuccess('Maintenance issue reported successfully!');
      setFormData({
        property: availableProperties.length === 1 ? availableProperties[0]._id : '',
        issueDescription: '',
        priority: 'Medium',
      });
      setShowModal(false);
      loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit request.');
    }
  };

  // Metrics
  const totalTickets = requests.length;
  const openTickets = requests.filter((r) => r.status?.toLowerCase() === 'open').length;
  const inProgressTickets = requests.filter((r) => r.status?.toLowerCase() === 'in progress').length;
  const resolvedTickets = requests.filter((r) => r.status?.toLowerCase() === 'resolved').length;

  return (
    <div className="pm-tenant">
      <Container>
        {/* Header */}
        <div className="pm-header">
          <div>
            <h1 className="pm-title">Welcome back, {user?.name || 'Tenant'}</h1>
            <p className="pm-subtitle">
              Tenant Portal: Track your repair requests and report maintenance issues
            </p>
          </div>
          <div>
            <Button
              variant="light"
              className="pm-btn-primary"
              onClick={() => setShowModal(true)}
            >
              Report new issue
            </Button>
          </div>
        </div>

        {error && (
          <div className="pm-alert pm-alert-error" role="alert">
            <span>{error}</span>
            <button className="pm-alert-close" onClick={() => setError('')} aria-label="Dismiss">×</button>
          </div>
        )}
        {success && (
          <div className="pm-alert pm-alert-success" role="alert">
            <span>{success}</span>
            <button className="pm-alert-close" onClick={() => setSuccess('')} aria-label="Dismiss">×</button>
          </div>
        )}

        {loading ? (
          <div className="pm-loading">
            <Spinner animation="border" size="sm" className="me-2" />
            Loading tenant records…
          </div>
        ) : (
          <>
            {/* Metrics Strip */}
            <div className="pm-metrics">
              <div className="pm-metric">
                <span className="pm-metric-label">Total tickets</span>
                <span className="pm-metric-value">{totalTickets}</span>
              </div>
              <div className="pm-metric">
                <span className="pm-metric-label">Open requests</span>
                <span className="pm-metric-value">{openTickets}</span>
              </div>
              <div className="pm-metric">
                <span className="pm-metric-label">In progress</span>
                <span className="pm-metric-value">{inProgressTickets}</span>
              </div>
              <div className="pm-metric">
                <span className="pm-metric-label">Resolved</span>
                <span className="pm-metric-value">{resolvedTickets}</span>
              </div>
            </div>

            {/* Maintenance Log Table */}
            <div className="pm-panel">
              <div className="pm-panel-header">
                My maintenance & repair log ({requests.length})
              </div>
              <Table responsive className="pm-table mb-0">
                <thead>
                  <tr>
                    <th>Property</th>
                    <th>Issue details</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th className="text-end">Date submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.length > 0 ? (
                    requests.map((req) => (
                      <tr key={req._id}>
                        <td className="pm-cell-title">
                          {req.property?.title || req.property || '—'}
                        </td>
                        <td className="pm-cell-muted">{req.issueDescription}</td>
                        <td>
                          <span className="pm-cell-muted">{req.priority || 'Medium'}</span>
                        </td>
                        <td>
                          <TicketStatusPill status={req.status} />
                        </td>
                        <td className="text-end pm-cell-muted">
                          {new Date(req.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="5" className="pm-empty-row">
                        No maintenance requests recorded. Click "Report new issue" to submit one.
                      </td>
                    </tr>
                  )}
                </tbody>
              </Table>
            </div>
          </>
        )}

        {/* Modal: Report Issue */}
        <Modal show={showModal} onHide={() => setShowModal(false)} centered dialogClassName="pm-modal">
          <Modal.Header closeButton>
            <Modal.Title>Report maintenance issue</Modal.Title>
          </Modal.Header>
          <Form onSubmit={handleSubmit}>
            <Modal.Body>
              <Form.Group className="mb-3">
                <Form.Label className="pm-form-label">Select unit</Form.Label>
                <Form.Select
                  className="pm-input"
                  value={formData.property}
                  onChange={(e) => setFormData({ ...formData, property: e.target.value })}
                  required
                >
                  <option value="">-- Select property --</option>
                  {availableProperties.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.title} - {p.address}
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label className="pm-form-label">Urgency priority</Form.Label>
                <Form.Select
                  className="pm-input"
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                >
                  <option value="Low">Low - Minor inconvenience</option>
                  <option value="Medium">Medium - Standard repair needed</option>
                  <option value="High">High - Emergency issue</option>
                </Form.Select>
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label className="pm-form-label">Issue description</Form.Label>
                <Form.Control
                  className="pm-input"
                  as="textarea"
                  rows={4}
                  placeholder="Provide details about the issue..."
                  value={formData.issueDescription}
                  onChange={(e) => setFormData({ ...formData, issueDescription: e.target.value })}
                  required
                />
              </Form.Group>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="light" className="pm-btn-ghost" onClick={() => setShowModal(false)}>
                Cancel
              </Button>
              <Button variant="light" className="pm-btn-primary" type="submit">
                Submit ticket
              </Button>
            </Modal.Footer>
          </Form>
        </Modal>
      </Container>
    </div>
  );
}