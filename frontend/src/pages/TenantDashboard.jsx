import { useState, useEffect, useRef } from 'react';
import { Container, Form, Spinner, Button, Modal } from 'react-bootstrap';
import Table from '../components/ResponsiveTable.jsx';
import { useAuth } from '../context/useAuth';
import useNotificationDeepLink from '../hooks/useNotificationDeepLink';
import { fetchMaintenanceRequests, createMaintenanceRequest } from '../services/maintenanceService';
import { fetchProperties } from '../services/propertyService';
import { fetchContracts } from '../services/contractService';
import { fetchMyProfile, updateMyProfile } from '../services/profileService';
import { fetchSystemSettings } from '../services/systemSettingsService';
import TenantInvoiceViewer from '../components/TenantInvoiceViewer';
import DashboardHeader from '../components/DashboardHeader';
import './TenantDashboard.css';

const TICKET_PILL_CLASS = {
  open: 'pm-pill-pending',
  'in progress': 'pm-pill-occupied',
  resolved: 'pm-pill-available',
  closed: 'pm-pill-default',
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
  const [activeSection, setActiveSection] = useState('overview');
  const { user, updateUser } = useAuth();
  const [requests, setRequests] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [availableProperties, setAvailableProperties] = useState([]);
  const tenantPropertiesLoaded = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileData, setProfileData] = useState({ first_name: '', last_name: '', email: '' });
  const [supportEmail, setSupportEmail] = useState('');

  useEffect(() => {
    const handleWorkspaceNavigation = (event) => setActiveSection(event.detail);
    window.addEventListener('workspace:navigate', handleWorkspaceNavigation);
    return () => window.removeEventListener('workspace:navigate', handleWorkspaceNavigation);
  }, []);
  useNotificationDeepLink('tenant');

  const [formData, setFormData] = useState({
    property: '',
    unit: '',
    issueDescription: '',
  });

  const loadData = async () => {
    const [requestsResult, contractsResult] = await Promise.allSettled([
      fetchMaintenanceRequests(),
      fetchContracts(),
    ]);
    const failures = [];
    if (requestsResult.status === 'fulfilled') {
      const data = requestsResult.value;
      setRequests(Array.isArray(data) ? data : data?.results || []);
    } else failures.push('maintenance requests');
    if (contractsResult.status === 'fulfilled') {
      const data = contractsResult.value;
      setContracts(Array.isArray(data) ? data : data?.results || []);
    } else failures.push('lease records');
    setError(failures.length ? `Could not load ${failures.join(' and ')}.` : '');
    setLoading(false);
  };

  const openMaintenanceForm = async () => {
    setError('');
    if (!tenantPropertiesLoaded.current) {
      try {
        const data = await fetchProperties();
        const properties = Array.isArray(data) ? data : data?.results || [];
        setAvailableProperties(properties);
        tenantPropertiesLoaded.current = true;
        if (properties.length === 1) {
          setFormData((current) => ({ ...current, property: properties[0]._id || properties[0].id }));
        }
      } catch {
        setError('Could not load your property choices. Please try again.');
        return;
      }
    }
    setShowModal(true);
  };

  useEffect(() => {
    void Promise.resolve().then(loadData);
  }, []);

  useEffect(() => {
    fetchMyProfile().then((profile) => setProfileData({
      first_name: profile.first_name || '',
      last_name: profile.last_name || '',
      email: profile.email || '',
    })).catch(() => {});
  }, [user]);

  useEffect(() => {
    fetchSystemSettings().then((settings) => setSupportEmail(settings.support_email || '')).catch(() => {});
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      await createMaintenanceRequest({
        property: Number(formData.property),
        unit: formData.unit ? Number(formData.unit) : null,
        issueDescription: formData.issueDescription,
      });
      setSuccess('Maintenance issue reported successfully!');
      setFormData({
        property: availableProperties.length === 1 ? availableProperties[0]._id : '',
        unit: '',
        issueDescription: '',
      });
      setShowModal(false);
      loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit request.');
    }
  };

  const handleProfileSave = async (e) => {
    e.preventDefault();
    try {
      const profile = await updateMyProfile(profileData);
      updateUser({
        _id: profile._id,
        name: profile.name,
        first_name: profile.first_name,
        last_name: profile.last_name,
        email: profile.email,
      });
      setShowProfileModal(false);
      setSuccess('Your profile was updated.');
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update your profile.');
    }
  };

  // Metrics
  const totalTickets = requests.length;
  const openTickets = requests.filter((r) => r.status?.toLowerCase() === 'open').length;
  const inProgressTickets = requests.filter((r) => r.status?.toLowerCase() === 'in progress').length;
  const resolvedTickets = requests.filter((r) => r.status?.toLowerCase() === 'resolved').length;

  return (
    <div className="pm-tenant" data-active-section={activeSection}>
      <Container>
        <DashboardHeader
          role="tenant"
          section={activeSection}
          overviewTitle={`Welcome back, ${user?.name || 'Tenant'}`}
          overviewDescription={<>Track your repair requests and rent records.{supportEmail && <> Support: <a href={`mailto:${supportEmail}`}>{supportEmail}</a></>}</>}
        >
          {activeSection === 'overview' && <Button variant="outline-secondary" onClick={() => setShowProfileModal(true)}>Edit profile</Button>}
          {(activeSection === 'overview' || activeSection === 'maintenance') && <Button variant="light" className="pm-btn-primary" onClick={() => { void openMaintenanceForm(); }}>Report new issue</Button>}
        </DashboardHeader>

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
            <div className="pm-metrics" data-workspace-section="overview">
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

            {/* 2. INVOICING & BILLING PANEL ADDED HERE */}
            <div className="pm-panel mb-4" id="payments" data-workspace-section="payments">
              <div className="pm-panel-header">My rent billing statements</div>
              {activeSection === 'payments' && <div style={{ padding: '22px' }}>
                <TenantInvoiceViewer tenantId={user?._id} />
              </div>}
            </div>

            <div className="pm-panel mb-4" id="lease" data-workspace-section="lease">
              <div className="pm-panel-header">My property and lease</div>
              <Table responsive className="pm-table mb-0">
                <thead><tr><th>Property / unit</th><th>Rent</th><th>Lease period</th><th>Status</th><th>Expires</th></tr></thead>
                <tbody>
                  {contracts.map((contract) => (
                    <tr key={contract._id}>
                      <td>{contract.propertyDetails?.title || 'Property'}{contract.unitDetails?.unitNumber ? ` — ${contract.unitDetails.unitNumber}` : ''}</td>
                      <td>₱{Number(contract.rentAmount || 0).toLocaleString()}</td>
                      <td>{contract.startDate} – {contract.endDate}</td>
                      <td><TicketStatusPill status={contract.status} /></td>
                      <td>{contract.endDate}</td>
                    </tr>
                  ))}
                  {contracts.length === 0 && <tr><td colSpan="5" className="pm-empty-row">No lease contract is linked to your account yet.</td></tr>}
                </tbody>
              </Table>
            </div>

            {/* Maintenance Log Table */}
            <div className="pm-panel" id="maintenance" data-workspace-section="maintenance">
              <div className="pm-panel-header">
                My maintenance & repair log ({requests.length})
              </div>
              <Table responsive className="pm-table mb-0">
                <thead>
                  <tr>
                    <th>Property</th>
                    <th>Issue details</th>
                    <th>Status</th>
                    <th className="text-end">Date submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.length > 0 ? (
                    requests.map((req) => (
                      <tr key={req._id}>
                        <td className="pm-cell-title">
                          {req.propertyDetails?.title || req.property?.title || req.property || '—'}
                        </td>
                        <td className="pm-cell-muted">{req.issueDescription}</td>
                        <td>
                          <TicketStatusPill status={req.status} />
                        </td>
                        <td className="text-end pm-cell-muted">
                          {req.created_at ? new Date(req.created_at).toLocaleDateString() : '—'}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="4" className="pm-empty-row">
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
                  onChange={(e) => setFormData({ ...formData, property: e.target.value, unit: '' })}
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

              {(availableProperties.find((property) => String(property._id) === String(formData.property))?.units || []).filter((unit) => Number(unit.tenantId) === Number(user?._id)).length > 0 && (
                <Form.Group className="mb-3">
                  <Form.Label className="pm-form-label">Your unit</Form.Label>
                  <Form.Select className="pm-input" value={formData.unit} onChange={(e) => setFormData({ ...formData, unit: e.target.value })}>
                    <option value="">Select unit</option>
                    {(availableProperties.find((property) => String(property._id) === String(formData.property))?.units || []).filter((unit) => Number(unit.tenantId) === Number(user?._id)).map((unit) => (
                      <option key={unit._id} value={unit._id}>{unit.unitNumber}</option>
                    ))}
                  </Form.Select>
                </Form.Group>
              )}

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
        <Modal show={showProfileModal} onHide={() => setShowProfileModal(false)} centered>
          <Modal.Header closeButton><Modal.Title>Edit personal information</Modal.Title></Modal.Header>
          <Form onSubmit={handleProfileSave}>
            <Modal.Body>
              <Form.Group className="mb-3"><Form.Label>First name</Form.Label><Form.Control value={profileData.first_name} onChange={(e) => setProfileData({ ...profileData, first_name: e.target.value })} required /></Form.Group>
              <Form.Group className="mb-3"><Form.Label>Last name</Form.Label><Form.Control value={profileData.last_name} onChange={(e) => setProfileData({ ...profileData, last_name: e.target.value })} /></Form.Group>
              <Form.Group><Form.Label>Email</Form.Label><Form.Control type="email" value={profileData.email} onChange={(e) => setProfileData({ ...profileData, email: e.target.value })} required /></Form.Group>
            </Modal.Body>
            <Modal.Footer><Button variant="secondary" onClick={() => setShowProfileModal(false)}>Cancel</Button><Button type="submit">Save profile</Button></Modal.Footer>
          </Form>
        </Modal>
      </Container>
    </div>
  );
}
