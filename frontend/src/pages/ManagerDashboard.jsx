import { useState, useEffect, useMemo } from 'react';
import { Container, Table, Form, Spinner, Button } from 'react-bootstrap';
import { fetchProperties } from '../services/propertyService';
import AdminMaintenanceManager from '../components/AdminMaintenanceManager';
import './ManagerDashboard.css';

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

export default function ManagerDashboard() {
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showMaintenanceQueue, setShowMaintenanceQueue] = useState(false);

  // Filter State
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const loadManagerData = async () => {
    setLoading(true);
    try {
      const data = await fetchProperties();
      setProperties(Array.isArray(data) ? data : []);
      setError('');
    } catch (err) {
      setError('Failed to fetch property records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadManagerData();
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

  const totalAssigned = properties.length;
  const availableCount = properties.filter((p) => p.status?.toLowerCase() === 'available').length;
  const occupiedCount = properties.filter((p) =>
    ['occupied', 'rented'].includes(p.status?.toLowerCase())
  ).length;

  return (
    <div className="pm-manager">
      <Container>
        {/* Header */}
        <div className="pm-header">
          <div>
            <h1 className="pm-title">Property Manager Dashboard</h1>
            <p className="pm-subtitle">
              Oversee property operations, maintenance requests, and unit statuses
            </p>
          </div>
          <div>
            <Button
              variant="light"
              className="pm-btn-ghost"
              onClick={() => setShowMaintenanceQueue(!showMaintenanceQueue)}
            >
              {showMaintenanceQueue ? 'Hide maintenance queue' : 'View maintenance queue'}
            </Button>
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
            Loading assigned property records…
          </div>
        ) : (
          <>
            {/* Metrics Strip */}
            <div className="pm-metrics">
              <div className="pm-metric">
                <span className="pm-metric-label">Assigned properties</span>
                <span className="pm-metric-value">{totalAssigned}</span>
              </div>
              <div className="pm-metric">
                <span className="pm-metric-label">Available units</span>
                <span className="pm-metric-value">{availableCount}</span>
              </div>
              <div className="pm-metric">
                <span className="pm-metric-label">Occupied units</span>
                <span className="pm-metric-value">{occupiedCount}</span>
              </div>
            </div>

            {/* Maintenance Queue Panel (Toggleable) */}
            {showMaintenanceQueue && (
              <div className="pm-panel">
                <div className="pm-panel-header">Maintenance & repair requests</div>
                <div style={{ padding: '22px' }}>
                  <AdminMaintenanceManager />
                </div>
              </div>
            )}

            {/* Search & Filter Bar */}
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

            {/* Property Overview Table Panel */}
            <div className="pm-panel">
              <div className="pm-panel-header">
                Managed properties overview ({filteredProperties.length})
              </div>
              <Table responsive className="pm-table mb-0">
                <thead>
                  <tr>
                    <th>Property title</th>
                    <th>Address</th>
                    <th>Type</th>
                    <th>Monthly rate</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProperties.length > 0 ? (
                    filteredProperties.map((prop) => (
                      <tr key={prop._id}>
                        <td className="pm-cell-title">{prop.title}</td>
                        <td className="pm-cell-muted">{prop.address}</td>
                        <td>{prop.propertyType}</td>
                        <td className="pm-cell-strong">₱{prop.price?.toLocaleString()}</td>
                        <td>
                          <StatusPill status={prop.status} />
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="5" className="pm-empty-row">No matching properties found.</td>
                    </tr>
                  )}
                </tbody>
              </Table>
            </div>
          </>
        )}
      </Container>
    </div>
  );
}