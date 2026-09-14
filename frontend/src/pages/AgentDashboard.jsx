import { useState, useEffect, useMemo } from 'react';
import { Container, Row, Col, Card, Form, Spinner, Button, Badge, Modal } from 'react-bootstrap';
import { fetchProperties } from '../services/propertyService';
import { fetchUsers } from '../services/userService';
import './AgentDashboard.css';

const PROPERTY_TYPES = ['Condo', 'House', 'Apartment', 'Commercial'];
const PROPERTY_STATUSES = ['Available', 'Occupied', 'Pending', 'Under Maintenance'];

const PILL_CLASS = {
  available: 'pm-pill-available',
  rented: 'pm-pill-occupied',
  occupied: 'pm-pill-occupied',
  'under maintenance': 'pm-pill-maintenance',
  pending: 'pm-pill-occupied',
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
  const [properties, setProperties] = useState([]);
  const [tenantList, setTenantList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Selected property for sub-unit matrix drawer
  const [selectedPropertyId, setSelectedPropertyId] = useState(null);

  // Viewing Scheduler Modal State
  const [showViewingModal, setShowViewingModal] = useState(false);
  const [viewingData, setViewingData] = useState({
    propertyId: '',
    unitNumber: '',
    tenantId: '',
    viewingDate: '',
    notes: '',
  });

  // Filter State
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const loadAgentData = async () => {
    setLoading(true);
    try {
      const [propData, userData] = await Promise.all([
        fetchProperties(),
        fetchUsers(),
      ]);
      setProperties(Array.isArray(propData) ? propData : []);
      setTenantList(Array.isArray(userData) ? userData.filter((u) => u.role?.toLowerCase() === 'tenant') : []);
      setError('');
    } catch (err) {
      setError('Failed to fetch property listings and tenant directory.');
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

  const handleOpenViewingModal = (propertyId, unitNumber = 'Main Unit') => {
    setViewingData({
      propertyId,
      unitNumber,
      tenantId: '',
      viewingDate: '',
      notes: '',
    });
    setShowViewingModal(true);
  };

  const handleScheduleSubmit = (e) => {
    e.preventDefault();
    setSuccess('Viewing inquiry & tenant application schedule logged!');
    setShowViewingModal(false);
  };

  return (
    <div className="pm-agent">
      <Container>
        {/* Header */}
        <div className="pm-header">
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
            <div className="pm-metrics">
              <div className="pm-metric">
                <span className="pm-metric-label">Total system listings</span>
                <span className="pm-metric-value">{metrics.totalListings}</span>
              </div>
              <div className="pm-metric">
                <span className="pm-metric-label">Available units for lease</span>
                <span className="pm-metric-value">{metrics.availableUnitsCount}</span>
              </div>
            </div>

            {/* Filter Toolbar */}
            <div className="pm-filterbar">
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
                            onClick={() => isAvailable && handleOpenViewingModal(selectedPropertyObj._id, unit.unitNumber)}
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
            <Row>
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
          </>
        )}

        {/* Modal: Schedule Viewing / Match Tenant */}
        <Modal show={showViewingModal} onHide={() => setShowViewingModal(false)} centered dialogClassName="pm-modal">
          <Modal.Header closeButton>
            <Modal.Title>Schedule viewing / tenant inquiry</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form onSubmit={handleScheduleSubmit}>
              <Form.Group className="mb-3">
                <Form.Label className="pm-form-label">Select Prospective Tenant</Form.Label>
                <Form.Select
                  className="pm-input"
                  value={viewingData.tenantId}
                  onChange={(e) => setViewingData({ ...viewingData, tenantId: e.target.value })}
                  required
                >
                  <option value="">-- Select registered tenant --</option>
                  {tenantList.map((t) => (
                    <option key={t._id} value={t._id}>
                      {t.name} ({t.email})
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label className="pm-form-label">Proposed Viewing Date</Form.Label>
                <Form.Control
                  className="pm-input"
                  type="date"
                  value={viewingData.viewingDate}
                  onChange={(e) => setViewingData({ ...viewingData, viewingDate: e.target.value })}
                  required
                />
              </Form.Group>

              <Form.Group className="mb-4">
                <Form.Label className="pm-form-label">Client Application Notes</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={3}
                  className="pm-input"
                  placeholder="e.g., Prospect requested a weekend walkthrough and parking allotment inquiry..."
                  value={viewingData.notes}
                  onChange={(e) => setViewingData({ ...viewingData, notes: e.target.value })}
                />
              </Form.Group>

              <Button variant="light" className="pm-btn-primary w-100 py-2" type="submit">
                Log Schedule Inquiry
              </Button>
            </Form>
          </Modal.Body>
        </Modal>
      </Container>
    </div>
  );
}