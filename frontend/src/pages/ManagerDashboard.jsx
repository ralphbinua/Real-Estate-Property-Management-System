import { useState, useEffect, useMemo } from 'react';
import { Container, Table, Form, Spinner, Button, Row, Col, Badge, Modal } from 'react-bootstrap';
import { fetchProperties, createProperty } from '../services/propertyService';
import { fetchContracts, createContract, terminateContract } from '../services/contractService';
import { fetchUsers } from '../services/userService';
import { fetchInvoices } from '../services/invoiceService';
import AdminMaintenanceManager from '../components/AdminMaintenanceManager';
import ManagerInvoiceTracker from '../components/ManagerInvoiceTracker';
import ManagerReports from '../components/ManagerReports';
import './ManagerDashboard.css';

const PROPERTY_TYPES = ['Condo', 'House', 'Apartment', 'Commercial'];
const PROPERTY_STATUSES = ['Available', 'Occupied', 'Pending', 'Under Maintenance'];

const PILL_CLASS = {
  available: 'pm-pill-available',
  rented: 'pm-pill-occupied',
  occupied: 'pm-pill-occupied',
  'under maintenance': 'pm-pill-maintenance',
  pending: 'pm-pill-occupied',
  active: 'pm-pill-active',
  terminated: 'pm-pill-terminated',
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
  const [contracts, setContracts] = useState([]);
  const [userList, setUserList] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Panel Toggles
  const [showMaintenanceQueue, setShowMaintenanceQueue] = useState(false);
  const [showInvoices, setShowInvoices] = useState(true);
  const [showReports, setShowReports] = useState(false);
  
  // Selected property for viewing units
  const [selectedPropertyId, setSelectedPropertyId] = useState(null);

  // New Lease Contract Modal State
  const [showContractModal, setShowContractModal] = useState(false);
  const [contractData, setContractData] = useState({
    property: '',
    unitId: '',
    unitNumber: '',
    tenant: '',
    startDate: '',
    endDate: '',
    rentAmount: ''
  });

  // New Property Modal State
  const [showPropertyModal, setShowPropertyModal] = useState(false);
  const [propertyFormData, setPropertyFormData] = useState({
    title: '',
    address: '',
    propertyType: 'Apartment',
    price: '',
    unitCount: 10,
    defaultUnitRate: 8500,
  });

  // Filter State
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const loadManagerData = async () => {
    setLoading(true);
    try {
      const [propData, contractList, usersData, invoiceData] = await Promise.all([
        fetchProperties(),
        fetchContracts(),
        fetchUsers(),
        fetchInvoices(),
      ]);
      setProperties(Array.isArray(propData) ? propData : []);
      setContracts(Array.isArray(contractList) ? contractList : []);
      setUserList(usersData.filter((u) => u.role?.toLowerCase() === 'tenant'));
      setInvoices(Array.isArray(invoiceData) ? invoiceData : []);
      setError('');
    } catch (err) {
      setError('Failed to fetch manager dashboard records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadManagerData();
  }, []);

  const handlePropertySelect = (propertyId) => {
    const selectedProp = properties.find((p) => p._id === propertyId);
    if (!selectedProp) return;

    if (!selectedProp.units || selectedProp.units.length === 0) {
      setContractData({
        ...contractData,
        property: propertyId,
        unitId: '',
        unitNumber: 'Main Unit',
        rentAmount: selectedProp.price || selectedProp.monthlyRate || ''
      });
    } else {
      setContractData({
        ...contractData,
        property: propertyId,
        unitId: '',
        unitNumber: '',
        rentAmount: ''
      });
    }
  };

  const handleUnitSelect = (unitId) => {
    const selectedProp = properties.find((p) => p._id === contractData.property);
    if (!selectedProp || !selectedProp.units) return;

    const selectedUnit = selectedProp.units.find((u) => u._id === unitId);
    if (selectedUnit) {
      setContractData({
        ...contractData,
        unitId: selectedUnit._id,
        unitNumber: selectedUnit.unitNumber,
        rentAmount: selectedUnit.monthlyRate
      });
    }
  };

  const handleOpenLeaseForUnit = (propertyId, unit) => {
    setContractData({
      property: propertyId,
      unitId: unit._id,
      unitNumber: unit.unitNumber,
      tenant: '',
      startDate: '',
      endDate: '',
      rentAmount: unit.monthlyRate
    });
    setShowContractModal(true);
  };

  const handleContractSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (new Date(contractData.endDate) <= new Date(contractData.startDate)) {
      setError('End Date must be strictly after Start Date.');
      return;
    }

    const payload = {
      ...contractData,
      unitId: contractData.unitId || null,
      unitNumber: contractData.unitNumber || 'Main Unit',
      rentAmount: Number(contractData.rentAmount),
    };

    try {
      await createContract(payload);
      setSuccess('Lease contract created successfully!');
      setContractData({ property: '', unitId: '', unitNumber: '', tenant: '', startDate: '', endDate: '', rentAmount: '' });
      setShowContractModal(false);
      loadManagerData();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create lease contract.');
    }
  };

  const handlePropertySubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      let units = [];
      if (['Apartment', 'Condo'].includes(propertyFormData.propertyType)) {
        for (let i = 1; i <= Number(propertyFormData.unitCount); i++) {
          units.push({
            unitNumber: `Room ${100 + i}`,
            monthlyRate: Number(propertyFormData.defaultUnitRate),
            status: 'Available',
          });
        }
      }

      const payload = {
        title: propertyFormData.title,
        address: propertyFormData.address,
        propertyType: propertyFormData.propertyType,
        price: Number(propertyFormData.price || propertyFormData.defaultUnitRate),
        units,
      };

      await createProperty(payload);
      setSuccess('New property listing created successfully!');
      setPropertyFormData({ title: '', address: '', propertyType: 'Apartment', price: '', unitCount: 10, defaultUnitRate: 8500 });
      setShowPropertyModal(false);
      loadManagerData();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add property listing.');
    }
  };

  const handleTerminateContract = async (id) => {
    if (window.confirm('Are you sure you want to end this lease? The unit will return to Available status.')) {
      setError('');
      setSuccess('');
      try {
        await terminateContract(id);
        setSuccess('Lease contract terminated successfully.');
        loadManagerData();
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to end lease contract.');
      }
    }
  };

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
              className="pm-btn-primary"
              onClick={() => setShowPropertyModal(true)}
            >
              Add property
            </Button>
            <Button
              variant="light"
              className="pm-btn-ghost"
              onClick={() => setShowContractModal(true)}
            >
              New lease
            </Button>
            <Button
              variant="light"
              className="pm-btn-ghost"
              onClick={() => setShowReports(!showReports)}
            >
              {showReports ? 'Hide reports' : 'View performance reports'}
            </Button>
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
        {success && (
          <div className="pm-alert pm-alert-success" role="alert">
            <span>{success}</span>
            <button className="pm-alert-close" onClick={() => setSuccess('')} aria-label="Dismiss">×</button>
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

            {/* Performance Analytics & Revenue Reports Panel */}
            {showReports && (
              <div className="pm-panel mb-4">
                <div className="pm-panel-header">Performance & Revenue Analytics</div>
                <div style={{ padding: '22px' }}>
                  <ManagerReports properties={properties} invoices={invoices} />
                </div>
              </div>
            )}

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

            {/* Interactive Room Matrix Drawer */}
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
                            onClick={() => isAvailable && handleOpenLeaseForUnit(selectedPropertyObj._id, unit)}
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
                                Click to create lease
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

            {/* Active Lease Contracts */}
            <div className="pm-panel mb-4">
              <div className="pm-panel-header">Active lease contracts ({contracts.length})</div>
              <Table responsive className="pm-table mb-0">
                <thead>
                  <tr>
                    <th>Property / Unit</th>
                    <th>Tenant</th>
                    <th>Rent amount</th>
                    <th>Status</th>
                    <th className="text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {contracts.length > 0 ? (
                    contracts.map((con) => (
                      <tr key={con._id}>
                        <td className="pm-cell-title">
                          {con.property?.title || con.property}
                          {con.unitNumber && con.unitNumber !== 'Main Unit' ? ` (${con.unitNumber})` : ''}
                        </td>
                        <td>{con.tenant?.name || con.tenant}</td>
                        <td className="pm-cell-strong">₱{con.rentAmount?.toLocaleString()}</td>
                        <td><StatusPill status={con.status} /></td>
                        <td className="text-center">
                          {con.status === 'Active' && (
                            <Button
                              variant="light"
                              size="sm"
                              className="pm-btn-end-lease"
                              onClick={() => handleTerminateContract(con._id)}
                            >
                              End lease
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="5" className="pm-empty-row">No lease contracts recorded.</td>
                    </tr>
                  )}
                </tbody>
              </Table>
            </div>
          </>
        )}

        {/* Modal: New Property Listing */}
        <Modal show={showPropertyModal} onHide={() => setShowPropertyModal(false)} centered dialogClassName="pm-modal">
          <Modal.Header closeButton>
            <Modal.Title>Add property listing</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form onSubmit={handlePropertySubmit}>
              <Form.Group className="mb-3">
                <Form.Label className="pm-form-label">Property Title</Form.Label>
                <Form.Control
                  className="pm-input"
                  placeholder="e.g., Horizon Residences"
                  value={propertyFormData.title}
                  onChange={(e) => setPropertyFormData({ ...propertyFormData, title: e.target.value })}
                  required
                />
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label className="pm-form-label">Address</Form.Label>
                <Form.Control
                  className="pm-input"
                  placeholder="e.g., 123 Ayala Ave, Makati City"
                  value={propertyFormData.address}
                  onChange={(e) => setPropertyFormData({ ...propertyFormData, address: e.target.value })}
                  required
                />
              </Form.Group>

              <Row className="mb-3">
                <Col md={6}>
                  <Form.Label className="pm-form-label">Property Type</Form.Label>
                  <Form.Select
                    className="pm-input"
                    value={propertyFormData.propertyType}
                    onChange={(e) => setPropertyFormData({ ...propertyFormData, propertyType: e.target.value })}
                  >
                    <option value="Apartment">Apartment</option>
                    <option value="Condo">Condo</option>
                    <option value="House">House</option>
                    <option value="Commercial">Commercial</option>
                  </Form.Select>
                </Col>

                {['Apartment', 'Condo'].includes(propertyFormData.propertyType) ? (
                  <Col md={6}>
                    <Form.Label className="pm-form-label">Number of Units</Form.Label>
                    <Form.Control
                      className="pm-input"
                      type="number"
                      value={propertyFormData.unitCount}
                      onChange={(e) => setPropertyFormData({ ...propertyFormData, unitCount: e.target.value })}
                      required
                    />
                  </Col>
                ) : (
                  <Col md={6}>
                    <Form.Label className="pm-form-label">Monthly Rate (₱)</Form.Label>
                    <Form.Control
                      className="pm-input"
                      type="number"
                      value={propertyFormData.price}
                      onChange={(e) => setPropertyFormData({ ...propertyFormData, price: e.target.value })}
                      required
                    />
                  </Col>
                )}
              </Row>

              {['Apartment', 'Condo'].includes(propertyFormData.propertyType) && (
                <Form.Group className="mb-4">
                  <Form.Label className="pm-form-label">Default Rent per Unit (₱)</Form.Label>
                  <Form.Control
                    className="pm-input"
                    type="number"
                    value={propertyFormData.defaultUnitRate}
                    onChange={(e) => setPropertyFormData({ ...propertyFormData, defaultUnitRate: e.target.value })}
                    required
                  />
                </Form.Group>
              )}

              <Button variant="light" className="pm-btn-primary w-100 py-2" type="submit">
                Save Property Listing
              </Button>
            </Form>
          </Modal.Body>
        </Modal>

        {/* Modal: Unit-Aware New Lease Contract */}
        <Modal show={showContractModal} onHide={() => setShowContractModal(false)} centered dialogClassName="pm-modal">
          <Modal.Header closeButton>
            <Modal.Title>Create lease contract</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form onSubmit={handleContractSubmit}>
              <Form.Group className="mb-3">
                <Form.Label className="pm-form-label">Select property</Form.Label>
                <Form.Select
                  className="pm-input"
                  value={contractData.property}
                  onChange={(e) => handlePropertySelect(e.target.value)}
                  required
                >
                  <option value="">-- Choose property --</option>
                  {properties.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.title} ({p.units?.length > 0 ? `${p.units.length} Units` : 'Standalone House'})
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>

              {(() => {
                const selectedProp = properties.find((p) => p._id === contractData.property);
                const availableUnits = selectedProp?.units?.filter((u) => u.status === 'Available') || [];

                if (selectedProp && selectedProp.units?.length > 0) {
                  return (
                    <Form.Group className="mb-3">
                      <Form.Label className="pm-form-label">Select room / unit</Form.Label>
                      <Form.Select
                        className="pm-input"
                        value={contractData.unitId}
                        onChange={(e) => handleUnitSelect(e.target.value)}
                        required
                      >
                        <option value="">-- Choose available unit --</option>
                        {availableUnits.map((u) => (
                          <option key={u._id} value={u._id}>
                            {u.unitNumber} — ₱{u.monthlyRate?.toLocaleString()}/mo
                          </option>
                        ))}
                      </Form.Select>
                    </Form.Group>
                  );
                }
                return null;
              })()}

              <Form.Group className="mb-3">
                <Form.Label className="pm-form-label">Select tenant account</Form.Label>
                <Form.Select
                  className="pm-input"
                  value={contractData.tenant}
                  onChange={(e) => setContractData({ ...contractData, tenant: e.target.value })}
                  required
                >
                  <option value="">-- Choose tenant --</option>
                  {userList.map((u) => (
                    <option key={u._id} value={u._id}>
                      {u.name} ({u.email})
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>

              <Row className="mb-3">
                <Col md={6}>
                  <Form.Label className="pm-form-label">Start date</Form.Label>
                  <Form.Control
                    className="pm-input"
                    type="date"
                    value={contractData.startDate}
                    onChange={(e) => setContractData({ ...contractData, startDate: e.target.value })}
                    required
                  />
                </Col>
                <Col md={6}>
                  <Form.Label className="pm-form-label">End date</Form.Label>
                  <Form.Control
                    className="pm-input"
                    type="date"
                    value={contractData.endDate}
                    onChange={(e) => setContractData({ ...contractData, endDate: e.target.value })}
                    required
                  />
                </Col>
              </Row>

              <Form.Group className="mb-4">
                <Form.Label className="pm-form-label">Rent amount (₱)</Form.Label>
                <Form.Control
                  className="pm-input"
                  type="number"
                  value={contractData.rentAmount}
                  onChange={(e) => setContractData({ ...contractData, rentAmount: e.target.value })}
                  required
                />
              </Form.Group>

              <Button variant="light" className="pm-btn-primary w-100 py-2" type="submit">
                Save lease contract
              </Button>
            </Form>
          </Modal.Body>
        </Modal>
      </Container>
    </div>
  );
}