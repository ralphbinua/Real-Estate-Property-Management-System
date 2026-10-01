import { useState, useEffect, useMemo } from 'react';
import { Container, Row, Col, Card, Form, Spinner, Button, Badge, Modal, Table } from 'react-bootstrap';
import { fetchProperties } from '../services/propertyService';
import { createInquiry, fetchInquiries, updateInquiry } from '../services/inquiryService';
import { createApplication, fetchApplications } from '../services/applicationService';
import './AgentDashboard.css';

const PROPERTY_TYPES = ['Condo', 'House', 'Apartment', 'Commercial'];
const PROPERTY_STATUSES = ['Available', 'Occupied', 'Pending', 'Under Maintenance'];

const toLocalDateTimeInput = (dateValue) => {
  if (!dateValue) return '';
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '';
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};

const getLocalDateTimeNow = () => toLocalDateTimeInput(new Date());
const getInquiryStatus = (inquiry) => inquiry.status === 'New' && inquiry.viewing_at
  ? 'Viewing Scheduled'
  : inquiry.status;
const formatViewingDate = (value) => value
  ? new Intl.DateTimeFormat(undefined, {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
    }).format(new Date(value))
  : null;

const PILL_CLASS = {
  available: 'pm-pill-available',
  rented: 'pm-pill-occupied',
  occupied: 'pm-pill-occupied',
  'under maintenance': 'pm-pill-maintenance',
  pending: 'pm-pill-occupied',
  submitted: 'pm-pill-pending',
  'under review': 'pm-pill-active',
  approved: 'pm-pill-available',
  rejected: 'pm-pill-terminated',
  converted: 'pm-pill-occupied',
};

function StatusPill({ status }) {
  if (!status) return null;
  const cls = PILL_CLASS[status.toLowerCase()] || 'pm-pill-default';
  return (
    <span className={`pm-pill ${cls}`}>
      <span className="pm-pill-dot" />
      {status}
    </span>
  );
}

export default function AgentDashboard() {
  const [activeSection, setActiveSection] = useState('overview');
  const [properties, setProperties] = useState([]);
  const [inquiries, setInquiries] = useState([]);
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Selected property for sub-unit matrix drawer
  const [selectedPropertyId, setSelectedPropertyId] = useState(null);

  // Viewing Scheduler Modal State
  const [showViewingModal, setShowViewingModal] = useState(false);
  const [viewingData, setViewingData] = useState({
    inquiryId: '',
    propertyId: '',
    unitId: '',
    prospectName: '',
    prospectEmail: '',
    viewingAt: '',
    notes: '',
  });
  const [savingInquiry, setSavingInquiry] = useState(false);
  const [showApplicationModal, setShowApplicationModal] = useState(false);
  const [selectedInquiry, setSelectedInquiry] = useState(null);
  const [applicationForm, setApplicationForm] = useState({ applicantEmail: '', employment: '', monthlyIncome: '', moveInDate: '', notes: '' });
  const [savingApplication, setSavingApplication] = useState(false);

  // Filter State
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  useEffect(() => {
    const handleWorkspaceNavigation = (event) => setActiveSection(event.detail);
    window.addEventListener('workspace:navigate', handleWorkspaceNavigation);
    return () => window.removeEventListener('workspace:navigate', handleWorkspaceNavigation);
  }, []);

  const loadAgentData = async () => {
    setLoading(true);
    try {
      const [propData, inquiryData] = await Promise.all([
        fetchProperties(),
        fetchInquiries(),
      ]);
      setProperties(Array.isArray(propData) ? propData : []);
      setInquiries(Array.isArray(inquiryData) ? inquiryData : []);
      setApplications(await fetchApplications());
      setError('');
    } catch (err) {
      setError('Failed to fetch assigned property listings and inquiries.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAgentData();
  }, []);

  const filteredProperties = useMemo(() => {
    const q = search.toLowerCase();
    return properties.filter((prop) => {
      const matchesSearch =
        prop.title?.toLowerCase().includes(q) || prop.address?.toLowerCase().includes(q);
      const matchesType = filterType ? prop.propertyType === filterType : true;
      const matchesStatus = filterStatus ? prop.status?.toLowerCase() === filterStatus.toLowerCase() : true;
      return matchesSearch && matchesType && matchesStatus;
    });
  }, [properties, search, filterType, filterStatus]);

  // Aggregated Unit Metrics
  const metrics = useMemo(() => {
    let totalListings = properties.length;
    let availableUnitsCount = 0;

    properties.forEach((p) => {
      if (Array.isArray(p.units) && p.units.length > 0) {
        availableUnitsCount += p.units.filter((u) => u.status === 'Available').length;
      } else if (p.status?.toLowerCase() === 'available') {
        availableUnitsCount += 1;
      }
    });

    return { totalListings, availableUnitsCount };
  }, [properties]);

  const selectedPropertyObj = useMemo(
    () => properties.find((p) => p._id === selectedPropertyId),
    [properties, selectedPropertyId]
  );

  const handleOpenViewingModal = (propertyId, unitId = '', inquiry = null) => {
    setViewingData({
      inquiryId: inquiry?.id || '',
      propertyId: inquiry?.property || propertyId,
      unitId: inquiry?.unit || unitId,
      prospectName: inquiry?.prospect_name || '',
      prospectEmail: inquiry?.prospect_email || '',
      viewingAt: toLocalDateTimeInput(inquiry?.viewing_at),
      notes: inquiry?.notes || '',
    });
    setError('');
    setSuccess('');
    setShowViewingModal(true);
  };

  const handleScheduleSubmit = async (e) => {
    e.preventDefault();
    if (!viewingData.viewingAt || new Date(viewingData.viewingAt).getTime() <= Date.now()) {
      setError('Choose a future date and time for the viewing.');
      return;
    }
    setSavingInquiry(true);
    setError('');
    try {
      const payload = {
        property: Number(viewingData.propertyId),
        unit: viewingData.unitId ? Number(viewingData.unitId) : null,
        prospect_name: viewingData.prospectName,
        prospect_email: viewingData.prospectEmail,
        viewing_at: viewingData.viewingAt ? new Date(viewingData.viewingAt).toISOString() : null,
        notes: viewingData.notes,
        status: 'Viewing Scheduled',
      };
      const savedInquiry = viewingData.inquiryId
        ? await updateInquiry(viewingData.inquiryId, payload)
        : await createInquiry(payload);
      setInquiries((items) => viewingData.inquiryId
        ? items.map((item) => item.id === savedInquiry.id ? savedInquiry : item)
        : [savedInquiry, ...items.filter((item) => item.id !== savedInquiry.id)]);
      setSuccess(viewingData.inquiryId ? 'Viewing updated successfully.' : 'Viewing scheduled successfully.');
      setShowViewingModal(false);
      setActiveSection('inquiries');
      window.dispatchEvent(new CustomEvent('workspace:navigate', { detail: 'inquiries' }));
    } catch (err) {
      const apiError = err.response?.data;
      setError(apiError?.viewing_at?.[0] || apiError?.unit?.[0] || apiError?.property?.[0] || apiError?.detail || 'Failed to schedule the viewing.');
    } finally {
      setSavingInquiry(false);
    }
  };

  const openApplicationForm = (inquiry) => {
    setSelectedInquiry(inquiry);
    setApplicationForm({ applicantEmail: inquiry.prospect_email || '', employment: '', monthlyIncome: '', moveInDate: '', notes: '' });
    setError('');
    setSuccess('');
    setShowApplicationModal(true);
  };

  const handleApplicationSubmit = async (e) => {
    e.preventDefault();
    if (!selectedInquiry) return;
    if (!applicationForm.employment.trim() || applicationForm.monthlyIncome === '' || !applicationForm.moveInDate) {
      setError('Complete employment, monthly income, and requested move-in date before submitting.');
      return;
    }
    setSavingApplication(true);
    setError('');
    setSuccess('');
    try {
      await createApplication({
        inquiry: selectedInquiry.id,
        applicantEmail: applicationForm.applicantEmail,
        employment: applicationForm.employment.trim(),
        monthlyIncome: applicationForm.monthlyIncome,
        moveInDate: applicationForm.moveInDate,
        notes: applicationForm.notes,
      });
      setSuccess(`Rental application submitted for ${selectedInquiry.prospect_name}.`);
      setShowApplicationModal(false);
      const [updatedInquiries, updatedApplications] = await Promise.all([fetchInquiries(), fetchApplications()]);
      setInquiries(updatedInquiries);
      setApplications(updatedApplications);
    } catch (err) {
      const apiError = err.response?.data;
      const fieldError = apiError && typeof apiError === 'object'
        ? Object.values(apiError).flat().find((message) => typeof message === 'string')
        : '';
      setError(typeof apiError === 'string' ? apiError : apiError?.detail || fieldError || 'Failed to submit rental application.');
    } finally {
      setSavingApplication(false);
    }
  };

  const handleInquiryStatusChange = async (inquiry, status) => {
    const cancelsViewing = ['New', 'Closed'].includes(status) && Boolean(inquiry.viewing_at);
    try {
      const updated = await updateInquiry(inquiry.id, {
        status,
        ...(cancelsViewing ? { viewing_at: null } : {}),
      });
      setInquiries((items) => items.map((item) => item.id === updated.id ? updated : item));
      setSuccess(cancelsViewing
        ? (status === 'Closed' ? 'Viewing cancelled and inquiry closed.' : 'Viewing cancelled. Inquiry returned to New.')
        : 'Inquiry status updated.');
    } catch (err) {
      const apiError = err.response?.data;
      const fieldError = apiError && typeof apiError === 'object'
        ? Object.values(apiError).flat().find((message) => typeof message === 'string')
        : '';
      setError(fieldError || apiError?.detail || 'Failed to update inquiry status.');
    }
  };

  return (
    <div className="pm-agent" data-active-section={activeSection}>
      <Container>
        {/* Header */}
        <div className="pm-header" id="overview">
          <div>
            <h1 className="pm-title">Agent Property Directory</h1>
            <p className="pm-subtitle">
              Browse real-time listings, inspect unit pricing, and schedule viewings for clients
            </p>
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
            Synchronizing property listings…
          </div>
        ) : (
          <>
            {/* Metrics Strip */}
            <div className="pm-metrics" data-workspace-section="overview">
              <div className="pm-metric">
                <span className="pm-metric-label">Assigned listings</span>
                <span className="pm-metric-value">{metrics.totalListings}</span>
              </div>
              <div className="pm-metric">
                <span className="pm-metric-label">Available units for lease</span>
                <span className="pm-metric-value">{metrics.availableUnitsCount}</span>
              </div>
            </div>

            {/* Filter Toolbar */}
            <div className="pm-filterbar" data-workspace-section="listings">
              <Form.Control
                className="pm-input pm-search"
                placeholder="Search by title or location…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Form.Select
                className="pm-input pm-select"
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
              >
                <option value="">All property types</option>
                {PROPERTY_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </Form.Select>
              <Form.Select
                className="pm-input pm-select"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="">All statuses</option>
                {PROPERTY_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </Form.Select>
            </div>

            {/* Sub-Unit Matrix Drawer */}
            {selectedPropertyObj && selectedPropertyObj.units && (
              <div className="pm-panel mb-4" style={{ backgroundColor: '#fcfcfd' }}>
                <div className="pm-panel-header d-flex justify-content-between align-items-center">
                  <span>Unit matrix — {selectedPropertyObj.title} ({selectedPropertyObj.units.length} Rooms)</span>
                  <Button
                    variant="link"
                    size="sm"
                    className="text-decoration-none text-muted"
                    onClick={() => setSelectedPropertyId(null)}
                  >
                    Close matrix ✕
                  </Button>
                </div>
                <div style={{ padding: '22px' }}>
                  <Row className="g-3">
                    {selectedPropertyObj.units.map((unit) => {
                      const isOccupied = unit.status === 'Occupied';
                      const isMaintenance = unit.status === 'Maintenance';
                      const isAvailable = unit.status === 'Available';

                      return (
                        <Col key={unit._id || unit.unitNumber} xs={6} sm={4} md={3} lg={2.4}>
                          <div
                            className="p-3 rounded border text-center h-100 position-relative"
                            style={{
                              backgroundColor: isOccupied ? '#f0fdf4' : isMaintenance ? '#fffbeb' : '#ffffff',
                              borderColor: isOccupied ? '#bbf7d0' : isMaintenance ? '#fde68a' : '#e5e7eb',
                              cursor: isAvailable ? 'pointer' : 'default',
                            }}
                            onClick={() => isAvailable && handleOpenViewingModal(selectedPropertyObj._id, unit._id)}
                          >
                            <div className="fw-bold fs-6 text-dark">{unit.unitNumber}</div>
                            <div className="fw-bold text-success my-1">
                              ₱{(unit.monthlyRate || 0).toLocaleString()}
                            </div>
                            <Badge
                              bg={isOccupied ? 'success' : isMaintenance ? 'warning' : 'secondary'}
                              className="text-capitalize"
                            >
                              {unit.status}
                            </Badge>
                            {isAvailable && (
                              <div className="text-muted text-xs mt-2" style={{ fontSize: '11px' }}>
                                Click to schedule viewing
                              </div>
                            )}
                          </div>
                        </Col>
                      );
                    })}
                  </Row>
                </div>
              </div>
            )}

            {/* Property Cards Grid */}
            <Row id="listings" data-workspace-section="listings">
              {filteredProperties.length > 0 ? (
                filteredProperties.map((prop) => {
                  const hasSubUnits = prop.units && prop.units.length > 0;
                  const availableUnits = hasSubUnits ? prop.units.filter((u) => u.status === 'Available') : [];
                  const minPrice = hasSubUnits
                    ? Math.min(...prop.units.map((u) => u.monthlyRate || 0))
                    : prop.price || 0;

                  return (
                    <Col md={4} key={prop._id} className="mb-4">
                      <Card className="pm-card h-100">
                        <Card.Body className="d-flex flex-column p-4">
                          <div className="d-flex justify-content-between align-items-center mb-2">
                            <span className="pm-card-type">{prop.propertyType}</span>
                            <StatusPill status={hasSubUnits ? `${availableUnits.length}/${prop.units.length} Vacant` : prop.status} />
                          </div>
                          <h5 className="pm-card-title">{prop.title}</h5>
                          <p className="pm-card-address">📍 {prop.address}</p>

                          <div className="pm-card-footer mt-auto pt-3">
                            <div className="d-flex justify-content-between align-items-center mb-3">
                              <span className="text-muted small">Monthly rate</span>
                              <span className="pm-card-price">
                                ₱{minPrice.toLocaleString()}{hasSubUnits ? '/mo up' : ''}
                              </span>
                            </div>

                            <div className="d-flex gap-2">
                              {hasSubUnits ? (
                                <Button
                                  variant="light"
                                  size="sm"
                                  className="pm-btn-ghost w-100"
                                  onClick={() => setSelectedPropertyId(selectedPropertyId === prop._id ? null : prop._id)}
                                >
                                  {selectedPropertyId === prop._id ? 'Hide Units' : `Inspect Units (${prop.units.length})`}
                                </Button>
                              ) : (
                                <Button
                                  variant="light"
                                  size="sm"
                                  className="pm-btn-primary w-100"
                                  disabled={prop.status?.toLowerCase() !== 'available'}
                                  onClick={() => handleOpenViewingModal(prop._id)}
                                >
                                  Book Viewing
                                </Button>
                              )}
                            </div>
                          </div>
                        </Card.Body>
                      </Card>
                    </Col>
                  );
                })
              ) : (
                <Col md={12}>
                  <div className="pm-empty-grid">
                    No properties match your current search criteria.
                  </div>
                </Col>
              )}
            </Row>
            <div className="pm-panel mt-2" id="inquiries" data-workspace-section="inquiries">
              <div className="pm-prospects-header">
                <div>
                  <h2>Prospect pipeline</h2>
                  <p>Manage inquiries, scheduled viewings, and rental applications.</p>
                </div>
                <Badge className="pm-prospects-count">{inquiries.length} {inquiries.length === 1 ? 'prospect' : 'prospects'}</Badge>
              </div>
              <Table responsive className="pm-table mb-0">
                <thead><tr><th>Prospect</th><th>Property / unit</th><th>Viewing appointment</th><th>Notes</th><th>Status</th><th>Application</th><th>Actions</th></tr></thead>
                <tbody>
                  {inquiries.map((inquiry) => (
                    <tr key={inquiry.id} className={`pm-prospect-row pm-prospect-${getInquiryStatus(inquiry).toLowerCase().replaceAll(' ', '-')}`}>
                      <td>
                        <span className="pm-prospect-name">{inquiry.prospect_name}</span>
                        <span className="pm-prospect-email">{inquiry.prospect_email || 'No email provided'}</span>
                      </td>
                      <td>
                        <span className="pm-prospect-name">{properties.find((property) => Number(property._id) === Number(inquiry.property))?.title || `Property ${inquiry.property}`}</span>
                        {inquiry.unit && <span className="pm-prospect-email">Unit {properties.flatMap((property) => property.units || []).find((unit) => Number(unit._id) === Number(inquiry.unit))?.unitNumber || inquiry.unit}</span>}
                      </td>
                      <td className="pm-viewing-cell">
                        {inquiry.viewing_at
                          ? <><span className="pm-prospect-name">{formatViewingDate(inquiry.viewing_at)}</span><span className="pm-prospect-email">{getInquiryStatus(inquiry) === 'Viewing Scheduled' ? 'Appointment scheduled' : 'Previous appointment'}</span></>
                          : <span className="pm-prospect-email">No appointment scheduled</span>}
                      </td>
                      <td className="pm-prospect-notes" title={inquiry.notes || ''}>{inquiry.notes || '—'}</td>
                      <td>
                        <Form.Select size="sm" className={`pm-prospect-status status-${getInquiryStatus(inquiry).toLowerCase().replaceAll(' ', '-')}`} value={getInquiryStatus(inquiry)} aria-label={`Status for ${inquiry.prospect_name}`} onChange={(e) => handleInquiryStatusChange(inquiry, e.target.value)}>
                          {['New', 'Viewing Scheduled', 'Application In Progress', 'Converted', 'Closed'].map((status) => {
                            const relatedApplication = applications.find((application) => Number(application.inquiry) === Number(inquiry.id));
                            const currentStatus = getInquiryStatus(inquiry);
                            const requiresViewing = status === 'Viewing Scheduled' && currentStatus !== 'Viewing Scheduled';
                            const requiresApplication = status === 'Application In Progress' && !relatedApplication;
                            const requiresConversion = status === 'Converted' && relatedApplication?.status !== 'Converted';
                            return <option key={status} disabled={requiresViewing || requiresApplication || requiresConversion}>{status}</option>;
                          })}
                        </Form.Select>
                      </td>
                      <td>
                        {(() => {
                          const currentStatus = getInquiryStatus(inquiry);
                          const relatedApplication = applications.find((application) => Number(application.inquiry) === Number(inquiry.id));
                          if (currentStatus === 'Closed') return <Badge bg="secondary">Closed</Badge>;
                          if (currentStatus === 'Converted') return <Badge className="pm-application-badge" bg="info">Converted</Badge>;
                          if (relatedApplication) return <Badge className="pm-application-badge" bg="info">Application {relatedApplication.status}</Badge>;
                          if (currentStatus === 'Application In Progress') return <Badge className="pm-application-badge" bg="warning" text="dark">In progress</Badge>;
                          return <Button size="sm" variant="outline-primary" className="pm-prospect-action" onClick={() => openApplicationForm(inquiry)}>Start application</Button>;
                        })()}
                      </td>
                      <td>
                        {['Closed', 'Converted'].includes(getInquiryStatus(inquiry))
                          ? <span className="pm-no-action">—</span>
                          : <Button
                              size="sm"
                              variant="outline-primary"
                              className="pm-prospect-action"
                              disabled={getInquiryStatus(inquiry) === 'Application In Progress'}
                              onClick={() => handleOpenViewingModal(inquiry.property, inquiry.unit || '', inquiry)}
                            >
                              {inquiry.viewing_at ? 'Reschedule' : 'Schedule'}
                            </Button>}
                      </td>
                    </tr>
                  ))}
                  {inquiries.length === 0 && <tr><td colSpan="7" className="pm-empty-row"><strong>No prospects yet</strong><span>New inquiries and scheduled appointments will appear here.</span></td></tr>}
                </tbody>
              </Table>
            </div>

            <div className="pm-panel mt-2" data-workspace-section="applications">
              <div className="pm-panel-header">Rental applications ({applications.length})</div>
              <Table responsive className="pm-table mb-0">
                <thead><tr><th>Applicant</th><th>Property / unit</th><th>Employment</th><th>Monthly income</th><th>Move-in date</th><th>Status</th></tr></thead>
                <tbody>
                  {applications.map((application) => (
                    <tr key={application.id}>
                      <td>{application.applicantName}<div className="small text-muted">{application.applicantEmail}</div></td>
                      <td>{application.propertyDetails?.title || 'Property'}{application.unitDetails?.unitNumber ? ` · ${application.unitDetails.unitNumber}` : ''}</td>
                      <td>{application.employment || '—'}</td>
                      <td>{application.monthlyIncome ? `₱${Number(application.monthlyIncome).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}</td>
                      <td>{application.moveInDate || '—'}</td>
                      <td><StatusPill status={application.status} /></td>
                    </tr>
                  ))}
                  {applications.length === 0 && <tr><td colSpan="6" className="pm-empty-row">No rental applications have been started.</td></tr>}
                </tbody>
              </Table>
            </div>
          </>
        )}

        <Modal show={showApplicationModal} onHide={() => !savingApplication && setShowApplicationModal(false)} centered dialogClassName="pm-modal pm-application-modal">
          <Modal.Header closeButton>
            <div>
              <Modal.Title>Rental application</Modal.Title>
              <p className="pm-application-subtitle mb-0">
                {selectedInquiry?.prospect_name} · {properties.find((property) => Number(property._id) === Number(selectedInquiry?.property))?.title || 'Selected property'}
                {selectedInquiry?.unit && ` · Unit ${properties.flatMap((property) => property.units || []).find((unit) => Number(unit._id) === Number(selectedInquiry.unit))?.unitNumber || selectedInquiry.unit}`}
              </p>
            </div>
          </Modal.Header>
          <Form onSubmit={handleApplicationSubmit}>
            <Modal.Body>
              {error && <div className="pm-alert pm-alert-error mb-3" role="alert">{error}</div>}
              <Form.Group className="mb-3" controlId="application-email">
                <Form.Label className="pm-form-label">Applicant email <span className="pm-required-marker" aria-hidden="true">*</span></Form.Label>
                <Form.Control className="pm-input" type="email" autoComplete="email" required value={applicationForm.applicantEmail} onChange={(e) => setApplicationForm({ ...applicationForm, applicantEmail: e.target.value })} />
              </Form.Group>
              <Form.Group className="mb-3" controlId="application-employment">
                <Form.Label className="pm-form-label">Employment / occupation <span className="pm-required-marker" aria-hidden="true">*</span></Form.Label>
                <Form.Control className="pm-input" required value={applicationForm.employment} onChange={(e) => setApplicationForm({ ...applicationForm, employment: e.target.value })} placeholder="Employer or occupation" />
              </Form.Group>
              <Form.Group className="mb-3" controlId="application-income">
                <Form.Label className="pm-form-label">Monthly income (₱) <span className="pm-required-marker" aria-hidden="true">*</span></Form.Label>
                <Form.Control className="pm-input" type="number" min="0" step="0.01" required value={applicationForm.monthlyIncome} onChange={(e) => setApplicationForm({ ...applicationForm, monthlyIncome: e.target.value })} />
              </Form.Group>
              <Form.Group className="mb-3" controlId="application-move-in-date">
                <Form.Label className="pm-form-label">Requested move-in date <span className="pm-required-marker" aria-hidden="true">*</span></Form.Label>
                <Form.Control className="pm-input" type="date" required value={applicationForm.moveInDate} onChange={(e) => setApplicationForm({ ...applicationForm, moveInDate: e.target.value })} />
              </Form.Group>
              <Form.Group controlId="application-notes">
                <Form.Label className="pm-form-label">Application notes <span className="pm-optional-marker">Optional</span></Form.Label>
                <Form.Control className="pm-input" as="textarea" rows={2} value={applicationForm.notes} onChange={(e) => setApplicationForm({ ...applicationForm, notes: e.target.value })} />
              </Form.Group>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="outline-secondary" onClick={() => setShowApplicationModal(false)} disabled={savingApplication}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={savingApplication}>{savingApplication ? 'Submitting…' : 'Submit application'}</Button>
            </Modal.Footer>
          </Form>
        </Modal>

        {/* Modal: Schedule Viewing / Match Tenant */}
        <Modal show={showViewingModal} onHide={() => !savingInquiry && setShowViewingModal(false)} centered dialogClassName="pm-modal pm-viewing-modal">
          <Modal.Header closeButton>
            <div>
              <Modal.Title>{viewingData.inquiryId ? 'Update viewing' : 'Schedule a viewing'}</Modal.Title>
              <p className="pm-viewing-subtitle mb-0">
                {properties.find((property) => Number(property._id) === Number(viewingData.propertyId))?.title || 'Selected property'}
                {viewingData.unitId && ` · Unit ${properties.flatMap((property) => property.units || []).find((unit) => Number(unit._id) === Number(viewingData.unitId))?.unitNumber || viewingData.unitId}`}
              </p>
            </div>
          </Modal.Header>
          <Modal.Body>
            {error && <div className="pm-alert pm-alert-error pm-modal-error mb-3" role="alert">{error}</div>}
            <Form onSubmit={handleScheduleSubmit}>
              <Form.Group className="mb-3" controlId="viewing-prospect-name">
                <Form.Label className="pm-form-label">Prospect name <span className="pm-required-marker" aria-hidden="true">*</span></Form.Label>
                <Form.Control
                  className="pm-input"
                  placeholder="Full name"
                  value={viewingData.prospectName}
                  onChange={(e) => setViewingData({ ...viewingData, prospectName: e.target.value })}
                  required
                />
              </Form.Group>
              <Form.Group className="mb-3" controlId="viewing-prospect-email">
                <Form.Label className="pm-form-label">Prospect email <span className="pm-optional-marker">Optional</span></Form.Label>
                <Form.Control className="pm-input" type="email" placeholder="name@example.com" value={viewingData.prospectEmail} onChange={(e) => setViewingData({ ...viewingData, prospectEmail: e.target.value })} />
              </Form.Group>

              <Form.Group className="mb-3" controlId="viewing-date">
                <Form.Label className="pm-form-label">Viewing date and time <span className="pm-required-marker" aria-hidden="true">*</span></Form.Label>
                <Form.Control
                  className="pm-input"
                  type="datetime-local"
                  min={getLocalDateTimeNow()}
                  value={viewingData.viewingAt}
                  onChange={(e) => setViewingData({ ...viewingData, viewingAt: e.target.value })}
                  required
                />
              </Form.Group>

              <Form.Group className="mb-4" controlId="viewing-notes">
                <Form.Label className="pm-form-label">Notes <span className="pm-optional-marker">Optional</span></Form.Label>
                <Form.Control
                  as="textarea"
                  rows={3}
                  className="pm-input"
                  placeholder="e.g., Prospect requested a weekend walkthrough and parking allotment inquiry..."
                  value={viewingData.notes}
                  onChange={(e) => setViewingData({ ...viewingData, notes: e.target.value })}
                />
              </Form.Group>

              <Button variant="primary" className="pm-btn-primary w-100 py-2" type="submit" disabled={savingInquiry}>
                {savingInquiry ? 'Saving…' : viewingData.inquiryId ? 'Update viewing' : 'Schedule viewing'}
              </Button>
            </Form>
          </Modal.Body>
        </Modal>
      </Container>
    </div>
  );
}
