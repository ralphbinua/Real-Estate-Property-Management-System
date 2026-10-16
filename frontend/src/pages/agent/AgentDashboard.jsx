import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Container, Row, Col, Card, Form, Spinner, Button, Badge, Modal } from 'react-bootstrap';
import Table from '../../components/ui/ResponsiveTable.jsx';
import { fetchProperties } from '../../services/properties/propertyService';
import { createInquiry, createProspectActivity, fetchInquiriesPage, fetchProspectActivities, updateInquiry } from '../../services/properties/inquiryService';
import { createApplication, fetchApplicationsPage } from '../../services/properties/applicationService';
import CollectionPagination from '../../components/ui/CollectionPagination';
import useNotificationDeepLink from '../../hooks/useNotificationDeepLink';
import DashboardHeader from '../../components/navigation/DashboardHeader';
import MobileFilterBar from '../../components/navigation/MobileFilterBar';
import useMobileFilterSheet from '../../hooks/useMobileFilterSheet';
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
  const [inquiryPageInfo, setInquiryPageInfo] = useState({ count: 0, page: 1, pageCount: 1 });
  const [applicationPageInfo, setApplicationPageInfo] = useState({ count: 0, page: 1, pageCount: 1 });
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
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [selectedProspect, setSelectedProspect] = useState(null);
  const [prospectActivities, setProspectActivities] = useState([]);
  const [activityForm, setActivityForm] = useState({ activity_type: 'Call', summary: '', nextFollowUpAt: '', followUpChanged: false });
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [savingActivity, setSavingActivity] = useState(false);
  const [activityError, setActivityError] = useState('');

  // Filter State
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [followUpFilter, setFollowUpFilter] = useState('');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useMobileFilterSheet('agent', 'listings');
  const loadedAgentSections = useRef(new Set());

  const loadAgentData = useCallback(async (section = activeSection, force = true, page = 1, filters = {}) => {
    const sectionKey = ['overview', 'listings'].includes(section) ? 'properties' : section;
    const fetcher = {
      properties: () => fetchProperties(),
      inquiries: (page) => fetchInquiriesPage({ page, ...filters }),
      applications: (page) => fetchApplicationsPage({ page }),
    }[sectionKey];
    if (!fetcher || (!force && loadedAgentSections.current.has(sectionKey))) return;
    try {
      const data = await fetcher(page);
      const rows = Array.isArray(data) ? data : data?.results || [];
      if (sectionKey === 'properties') setProperties(rows);
      if (sectionKey === 'inquiries') {
        setInquiries(rows);
        const count = Number.isFinite(Number(data?.count)) ? Math.max(0, Number(data.count)) : rows.length;
        setInquiryPageInfo({ count, page, pageCount: Math.max(1, Math.ceil(count / 50)) });
      }
      if (sectionKey === 'applications') {
        setApplications(rows);
        setApplicationPageInfo({ count: data.count, page, pageCount: Math.max(1, Math.ceil(data.count / 50)) });
      }
      loadedAgentSections.current.add(sectionKey);
      setError('');
    } catch {
      setError(`Could not load ${sectionKey}. Try opening the section again.`);
    } finally {
      if (sectionKey === 'properties') setLoading(false);
    }
  }, [activeSection]);

  const inquiryFilters = followUpFilter ? { follow_up: followUpFilter } : {};

  const handleFollowUpFilter = (nextFilter) => {
    setFollowUpFilter(nextFilter);
    void loadAgentData('inquiries', true, 1, nextFilter ? { follow_up: nextFilter } : {});
  };

  const openProspectActivity = async (inquiry) => {
    setSelectedProspect(inquiry);
    setProspectActivities([]);
    setActivityError('');
    setActivityForm({
      activity_type: 'Call',
      summary: '',
      nextFollowUpAt: toLocalDateTimeInput(inquiry.next_follow_up_at),
      followUpChanged: false,
    });
    setShowActivityModal(true);
    setLoadingActivities(true);
    try {
      const rows = await fetchProspectActivities(inquiry.id);
      setProspectActivities(Array.isArray(rows) ? rows : []);
    } catch (requestError) {
      setActivityError(requestError.response?.data?.detail || 'Could not load this prospect’s activity history.');
    } finally {
      setLoadingActivities(false);
    }
  };

  const handleActivitySubmit = async (event) => {
    event.preventDefault();
    if (!selectedProspect) return;
    setSavingActivity(true);
    setActivityError('');
    try {
      const payload = {
        activity_type: activityForm.activity_type,
        summary: activityForm.summary.trim(),
        ...(activityForm.followUpChanged
          ? { next_follow_up_at: activityForm.nextFollowUpAt ? new Date(activityForm.nextFollowUpAt).toISOString() : null }
          : {}),
      };
      const savedActivity = await createProspectActivity(selectedProspect.id, payload);
      setProspectActivities((current) => [savedActivity, ...current]);
      if (savedActivity.follow_up_changed) {
        const updatedProspect = { ...selectedProspect, next_follow_up_at: savedActivity.next_follow_up_at };
        setSelectedProspect(updatedProspect);
        setInquiries((current) => current.map((item) => item.id === updatedProspect.id ? updatedProspect : item));
        setActivityForm((current) => ({ ...current, summary: '', nextFollowUpAt: toLocalDateTimeInput(savedActivity.next_follow_up_at), followUpChanged: false }));
      } else {
        setActivityForm((current) => ({ ...current, summary: '' }));
      }
      await loadAgentData('inquiries', true, inquiryPageInfo.page, inquiryFilters);
    } catch (requestError) {
      const data = requestError.response?.data;
      const fieldError = data && typeof data === 'object'
        ? Object.values(data).flat().find((message) => typeof message === 'string')
        : '';
      setActivityError(fieldError || data?.detail || 'Could not save this activity. Please try again.');
    } finally {
      setSavingActivity(false);
    }
  };

  useEffect(() => {
    const handleWorkspaceNavigation = (event) => setActiveSection(event.detail);
    window.addEventListener('workspace:navigate', handleWorkspaceNavigation);
    return () => window.removeEventListener('workspace:navigate', handleWorkspaceNavigation);
  }, []);
  useNotificationDeepLink('agent');

  useEffect(() => {
    void Promise.resolve().then(() => loadAgentData(activeSection, false));
  }, [activeSection, loadAgentData]);

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
      loadedAgentSections.current.add('inquiries');
      setSuccess(viewingData.inquiryId ? 'Viewing updated successfully.' : 'Viewing scheduled successfully.');
      setShowViewingModal(false);
      setFollowUpFilter('');
      await loadAgentData('inquiries', true, viewingData.inquiryId ? inquiryPageInfo.page : 1);
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
      await Promise.all([
        loadAgentData('inquiries', true, inquiryPageInfo.page, inquiryFilters),
        loadAgentData('applications', true, 1),
      ]);
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
        <DashboardHeader role="agent" section={activeSection} overviewTitle="Agent Property Directory" overviewDescription="Browse assigned listings, inspect unit pricing, and schedule viewings." />

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
            <MobileFilterBar section="listings" open={mobileFiltersOpen} onClose={() => setMobileFiltersOpen(false)} resultCount={filteredProperties.length} resultLabel="listings">
              <Form.Control
                className="pm-input pm-search"
                aria-label="Search listings by title or location"
                placeholder="Search by title or location…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Form.Select
                className="pm-input pm-select"
                aria-label="Filter by property type"
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
                aria-label="Filter by property status"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="">All statuses</option>
                {PROPERTY_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </Form.Select>
            </MobileFilterBar>

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
                <div className="pm-prospects-count" aria-live="polite">
                  <span>{inquiryPageInfo.count} {inquiryPageInfo.count === 1 ? 'prospect' : 'prospects'}</span>
                  <span className="pm-prospects-range">
                    {inquiryPageInfo.count === 0
                      ? 'No results'
                      : `Showing ${(inquiryPageInfo.page - 1) * 50 + 1}–${Math.min(inquiryPageInfo.page * 50, inquiryPageInfo.count)} of ${inquiryPageInfo.count}`}
                  </span>
                </div>
              </div>
              <div className="pm-follow-up-filters" role="group" aria-label="Filter prospects by follow-up">
                <span className="pm-follow-up-filter-label">Follow-up queue</span>
                {[
                  ['', 'All prospects'],
                  ['due', 'Due / overdue'],
                  ['upcoming', 'Upcoming'],
                  ['unscheduled', 'No follow-up'],
                ].map(([value, label]) => (
                  <Button
                    key={value || 'all'}
                    size="sm"
                    variant={followUpFilter === value ? 'primary' : 'outline-secondary'}
                    aria-pressed={followUpFilter === value}
                    onClick={() => handleFollowUpFilter(value)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              <Table responsive className="pm-table mb-0">
                <thead><tr><th>Prospect</th><th>Property / unit</th><th>Viewing appointment</th><th>Next follow-up</th><th>Notes</th><th>Status</th><th>Application</th><th>Actions</th></tr></thead>
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
                      <td className="pm-follow-up-cell">
                        {inquiry.next_follow_up_at ? (
                          <>
                            <span className="pm-prospect-name">{formatViewingDate(inquiry.next_follow_up_at)}</span>
                            <span className={`pm-follow-up-state ${new Date(inquiry.next_follow_up_at) <= new Date() ? 'is-due' : ''}`}>
                              {new Date(inquiry.next_follow_up_at) <= new Date() ? 'Due / overdue' : 'Scheduled'}
                            </span>
                          </>
                        ) : <span className="pm-prospect-email">Not scheduled</span>}
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
                        <div className="pm-prospect-actions">
                          <Button size="sm" variant="outline-secondary" className="pm-prospect-action" onClick={() => openProspectActivity(inquiry)}>
                            Activity
                          </Button>
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
                        </div>
                      </td>
                    </tr>
                  ))}
                  {inquiries.length === 0 && <tr><td colSpan="8" className="pm-empty-row"><strong>{followUpFilter ? 'No prospects in this follow-up view' : 'No prospects yet'}</strong><span>{followUpFilter ? 'Choose another follow-up filter or schedule a follow-up from a prospect activity.' : 'New inquiries and scheduled appointments will appear here.'}</span></td></tr>}
                </tbody>
              </Table>
              <CollectionPagination count={inquiryPageInfo.count} page={inquiryPageInfo.page} pageCount={inquiryPageInfo.pageCount} onPageChange={(page) => loadAgentData('inquiries', true, page, inquiryFilters)} />
            </div>

            <div className="pm-panel mt-2" data-workspace-section="applications">
              <div className="pm-panel-header">Rental applications ({applicationPageInfo.count})</div>
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
              <CollectionPagination count={applicationPageInfo.count} page={applicationPageInfo.page} pageCount={applicationPageInfo.pageCount} onPageChange={(page) => loadAgentData('applications', true, page)} />
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

        <Modal show={showActivityModal} onHide={() => !savingActivity && setShowActivityModal(false)} centered dialogClassName="pm-modal pm-prospect-activity-modal">
          <Modal.Header closeButton>
            <div>
              <Modal.Title>Prospect activity</Modal.Title>
              <p className="pm-viewing-subtitle mb-0">
                {selectedProspect?.prospect_name} · {properties.find((property) => Number(property._id) === Number(selectedProspect?.property))?.title || 'Selected property'}
              </p>
            </div>
          </Modal.Header>
          <Form onSubmit={handleActivitySubmit}>
            <Modal.Body>
              {activityError && <div className="pm-alert pm-alert-error pm-modal-error mb-3" role="alert">{activityError}</div>}
              <Form.Group className="mb-3" controlId="prospect-activity-type">
                <Form.Label className="pm-form-label">Activity type</Form.Label>
                <Form.Select className="pm-input" value={activityForm.activity_type} onChange={(event) => setActivityForm({ ...activityForm, activity_type: event.target.value })}>
                  {['Call', 'Email', 'Message', 'Viewing', 'Note', 'Follow-up'].map((type) => <option key={type} value={type}>{type}</option>)}
                </Form.Select>
              </Form.Group>
              <Form.Group className="mb-3" controlId="prospect-activity-summary">
                <Form.Label className="pm-form-label">What happened or what’s next?</Form.Label>
                <Form.Control className="pm-input" as="textarea" rows={2} maxLength={1000} required value={activityForm.summary} onChange={(event) => setActivityForm({ ...activityForm, summary: event.target.value })} placeholder="Add a brief note about this interaction or follow-up." />
              </Form.Group>
              <Form.Group className="mb-2" controlId="prospect-next-follow-up">
                <Form.Label className="pm-form-label">Next follow-up <span className="pm-optional-marker">Optional</span></Form.Label>
                <Form.Control
                  className="pm-input"
                  type="datetime-local"
                  value={activityForm.nextFollowUpAt}
                  onChange={(event) => setActivityForm({ ...activityForm, nextFollowUpAt: event.target.value, followUpChanged: true })}
                />
                <Form.Text className="text-muted">Leave unchanged to keep the current reminder. Choose a future time to schedule or reschedule it.</Form.Text>
              </Form.Group>
              {selectedProspect?.next_follow_up_at && !activityForm.followUpChanged && (
                <Button type="button" size="sm" variant="link" className="px-0 mb-3" onClick={() => setActivityForm({ ...activityForm, nextFollowUpAt: '', followUpChanged: true })}>
                  Clear scheduled follow-up
                </Button>
              )}

              <div className="pm-activity-history-heading">Activity history</div>
              {loadingActivities ? (
                <div className="text-center text-muted py-3"><Spinner animation="border" size="sm" className="me-2" />Loading history…</div>
              ) : prospectActivities.length === 0 ? (
                <p className="small text-muted mb-0 py-2">No activity has been logged for this prospect.</p>
              ) : (
                <ol className="pm-activity-history">
                  {prospectActivities.map((activity) => (
                    <li key={activity.id}>
                      <div className="pm-activity-history-meta">
                        <strong>{activity.activity_type}</strong>
                        <span>{formatViewingDate(activity.created_at)}</span>
                      </div>
                      <p>{activity.summary}</p>
                      <small>By {activity.actor_name}</small>
                      {activity.follow_up_changed && (
                        <small className="pm-activity-follow-up-event">
                          {activity.next_follow_up_at ? `Follow-up scheduled for ${formatViewingDate(activity.next_follow_up_at)}` : 'Scheduled follow-up cleared'}
                        </small>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button type="button" variant="outline-secondary" onClick={() => setShowActivityModal(false)} disabled={savingActivity}>Close</Button>
              <Button type="submit" variant="primary" disabled={savingActivity || loadingActivities}>{savingActivity ? 'Saving…' : 'Save activity'}</Button>
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
