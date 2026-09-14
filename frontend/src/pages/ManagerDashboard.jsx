import { useState, useEffect, useMemo } from 'react';
import { Container, Table, Form, Spinner, Button, Row, Col, Badge } from 'react-bootstrap';
import { fetchProperties } from '../services/propertyService';
import AdminMaintenanceManager from '../components/AdminMaintenanceManager';
import ManagerInvoiceTracker from '../components/ManagerInvoiceTracker';
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
  const [showInvoices, setShowInvoices] = useState(true);
  
  // Selected property for viewing units
  const [selectedPropertyId, setSelectedPropertyId] = useState(null);

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

  // Aggregated Room-Level Metrics
  const metrics = useMemo(() => {
    let totalAssigned = properties.length;
    let availableCount = 0;
    let occupiedCount = 0;

    properties.forEach((p) => {
      if (Array.isArray(p.units) && p.units.length > 0) {
        availableCount += p.units.filter((u) => u.status === 'Available').length;
        occupiedCount += p.units.filter((u) => u.status === 'Occupied').length;
      } else {
        if (p.status?.toLowerCase() === 'available') availableCount += 1;
        if (['occupied', 'rented'].includes(p.status?.toLowerCase())) occupiedCount += 1;
      }
    });

    return { totalAssigned, availableCount, occupiedCount };
  }, [properties]);

  const selectedPropertyObj = useMemo(
    () => properties.find((p) => p._id === selectedPropertyId),
    [properties, selectedPropertyId]
  );

  return (
    <div className="pm-manager">
      <Container>
        {/* Header */}
        <div className="pm-header">
          <div>
            <h1 className="pm-title">Property Manager Dashboard</h1>
            <p className="pm-subtitle">
              Oversee property operations, maintenance requests, and monthly billing ledgers
            </p>
          </div>
          <div className="d-flex gap-2">
            <Button
              variant="light"
              className="pm-btn-ghost"
              onClick={() => setShowInvoices(!showInvoices)}
            >
              {showInvoices ? 'Hide financial ledger' : 'View financial ledger'}
            </Button>
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
                <span className="pm-metric-value">{metrics.totalAssigned}</span>
              </div>
              <div className="pm-metric">
                <span className="pm-metric-label">Available units</span>
                <span className="pm-metric-value">{metrics.availableCount}</span>
              </div>
              <div className="pm-metric">
                <span className="pm-metric-label">Occupied units</span>
                <span className="pm-metric-value">{metrics.occupiedCount}</span>
              </div>
            </div>

            {/* Invoicing Ledger Panel */}
            {showInvoices && (
              <div className="pm-panel mb-4">
                <div className="pm-panel-header">Financial Ledger & Rent Collection</div>
                <div style={{ padding: '22px' }}>
                  <ManagerInvoiceTracker />
                </div>
              </div>
            )}

            {/* Maintenance Queue Panel */}
            {showMaintenanceQueue && (
              <div className="pm-panel mb-4">
                <div className="pm-panel-header">Maintenance & repair requests</div>
                <div style={{ padding: '22px' }}>
                  <AdminMaintenanceManager />
                </div>
              </div>
            )}

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

            {/* Property Directory */}
            <div className="pm-panel mb-4">
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
                    <th>Occupancy</th>
                    <th className="text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProperties.length > 0 ? (
                    filteredProperties.map((prop) => {
                      const totalUnits = prop.totalUnits || prop.units?.length || 1;
                      const occupiedCount = prop.occupiedUnits || (prop.units ? prop.units.filter((u) => u.status === 'Occupied').length : 0);
                      const rateDisplay = prop.monthlyRate !== undefined ? prop.monthlyRate : prop.price || 0;

                      return (
                        <tr key={prop._id}>
                          <td className="pm-cell-title">{prop.title}</td>
                          <td className="pm-cell-muted">{prop.address}</td>
                          <td>{prop.propertyType}</td>
                          <td className="pm-cell-strong">
                            ₱{rateDisplay.toLocaleString()}{prop.units?.length > 0 ? '/mo up' : ''}
                          </td>
                          <td>
                            <StatusPill status={occupiedCount > 0 ? `${occupiedCount}/${totalUnits} Occupied` : prop.status || 'Available'} />
                          </td>
                          <td className="text-center">
                            {prop.units && prop.units.length > 0 ? (
                              <Button
                                variant="light"
                                size="sm"
                                className="pm-btn-edit-outline"
                                onClick={() =>
                                  setSelectedPropertyId(selectedPropertyId === prop._id ? null : prop._id)
                                }
                              >
                                {selectedPropertyId === prop._id ? 'Hide Units' : `View Units (${prop.units.length})`}
                              </Button>
                            ) : (
                              <span className="text-muted small">No sub-units</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan="6" className="pm-empty-row">No matching properties found.</td>
                    </tr>
                  )}
                </tbody>
              </Table>
            </div>

            {/* Interactive 20-Unit Matrix Drawer */}
            {selectedPropertyObj && selectedPropertyObj.units && (
              <div className="pm-panel mb-4" style={{ backgroundColor: '#fcfcfd' }}>
                <div className="pm-panel-header d-flex justify-content-between align-items-center">
                  <span>Unit breakdown — {selectedPropertyObj.title} ({selectedPropertyObj.units.length} Rooms)</span>
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

                      return (
                        <Col key={unit._id || unit.unitNumber} xs={6} sm={4} md={3} lg={2.4}>
                          <div
                            className="p-3 rounded border text-center h-100"
                            style={{
                              backgroundColor: isOccupied ? '#f0fdf4' : isMaintenance ? '#fffbeb' : '#ffffff',
                              borderColor: isOccupied ? '#bbf7d0' : isMaintenance ? '#fde68a' : '#e5e7eb',
                            }}
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
                          </div>
                        </Col>
                      );
                    })}
                  </Row>
                </div>
              </div>
            )}
          </>
        )}
      </Container>
    </div>
  );
}