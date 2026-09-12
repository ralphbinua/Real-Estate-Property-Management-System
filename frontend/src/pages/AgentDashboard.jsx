import { useState, useEffect, useMemo } from 'react';
import { Container, Row, Col, Card, Form, Spinner } from 'react-bootstrap';
import { fetchProperties } from '../services/propertyService';
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filter State
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const loadAgentData = async () => {
    setLoading(true);
    try {
      const data = await fetchProperties();
      setProperties(Array.isArray(data) ? data : []);
      setError('');
    } catch (err) {
      setError('Failed to fetch property listings.');
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

  const totalListings = properties.length;
  const availableCount = properties.filter((p) => p.status?.toLowerCase() === 'available').length;

  return (
    <div className="pm-agent">
      <Container>
        {/* Header */}
        <div className="pm-header">
          <div>
            <h1 className="pm-title">Agent Property Directory</h1>
            <p className="pm-subtitle">
              Browse real-time listings, pricing, and availability for clients
            </p>
          </div>
        </div>

        {error && (
          <div className="pm-alert pm-alert-error" role="alert">
            <span>{error}</span>
            <button className="pm-alert-close" onClick={() => setError('')} aria-label="Dismiss">×</button>
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
                <span className="pm-metric-value">{totalListings}</span>
              </div>
              <div className="pm-metric">
                <span className="pm-metric-label">Available for lease</span>
                <span className="pm-metric-value">{availableCount}</span>
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

            {/* Property Cards Grid */}
            <Row>
              {filteredProperties.length > 0 ? (
                filteredProperties.map((prop) => (
                  <Col md={4} key={prop._id} className="mb-4">
                    <Card className="pm-card h-100">
                      <Card.Body className="d-flex flex-column p-4">
                        <div className="d-flex justify-content-between align-items-center mb-2">
                          <span className="pm-card-type">{prop.propertyType}</span>
                          <StatusPill status={prop.status} />
                        </div>
                        <h5 className="pm-card-title">{prop.title}</h5>
                        <p className="pm-card-address">📍 {prop.address}</p>
                        <div className="pm-card-footer">
                          <span className="text-muted small">Monthly rate</span>
                          <span className="pm-card-price">₱{prop.price?.toLocaleString()}</span>
                        </div>
                      </Card.Body>
                    </Card>
                  </Col>
                ))
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
      </Container>
    </div>
  );
}