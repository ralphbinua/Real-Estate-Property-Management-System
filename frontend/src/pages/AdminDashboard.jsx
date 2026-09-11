import { useState, useEffect, useMemo } from 'react';
import { Container, Table, Form, Row, Col, Modal, Spinner, Button } from 'react-bootstrap';
import { fetchProperties, updateProperty, deleteProperty } from '../services/propertyService';
import { fetchContracts, createContract, terminateContract } from '../services/contractService';
import { fetchUsers } from '../services/userService';
import PropertyForm from '../components/PropertyForm';
import UserManagement from '../components/UserManagement';
import AdminMaintenanceManager from '../components/AdminMaintenanceManager';
import './AdminDashboard.css';

const PROPERTY_TYPES = ['Condo', 'House', 'Apartment', 'Commercial'];
const PROPERTY_STATUSES = ['Available', 'Occupied', 'Pending', 'Under Maintenance'];

const PILL_CLASS = {
  available: 'pm-pill-available',
  rented: 'pm-pill-occupied',
  occupied: 'pm-pill-occupied',
  'under maintenance': 'pm-pill-maintenance',
  pending: 'pm-pill-pending',
  active: 'pm-pill-active',
  terminated: 'pm-pill-terminated',
  completed: 'pm-pill-terminated',
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

export default function AdminDashboard() {
  const [properties, setProperties] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [userList, setUserList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Search & Filter State
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Visibility & Modal Toggles
  const [showPropertyModal, setShowPropertyModal] = useState(false);
  const [showContractModal, setShowContractModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showUserManagement, setShowUserManagement] = useState(false);

  // Form States
  const [editingProperty, setEditingProperty] = useState(null);
  const [contractData, setContractData] = useState({
    property: '',
    tenant: '',
    startDate: '',
    endDate: '',
    rentAmount: ''
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [propData, contractsData, usersData] = await Promise.all([
        fetchProperties(),
        fetchContracts(),
        fetchUsers(),
      ]);
      setProperties(Array.isArray(propData) ? propData : []);
      setContracts(Array.isArray(contractsData) ? contractsData : []);
      setUserList(usersData.filter((u) => u.role?.toLowerCase() === 'tenant'));
      setError('');
    } catch (err) {
      setError('Failed to fetch dashboard data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Soft Delete Guard & Property Deletion
  const handleDeleteProperty = async (id) => {
    setError('');
    setSuccess('');

    const linkedContracts = contracts.filter((c) => {
      const propId = c.property?._id || c.property;
      const isActive = ['active', 'pending'].includes(c.status?.toLowerCase());
      return propId === id && isActive;
    });

    if (linkedContracts.length > 0) {
      setError(
        `Cannot delete this property: ${linkedContracts.length} active lease contract(s) are still linked to it. Cancel or reassign those leases first.`
      );
      return;
    }

    if (window.confirm('Are you sure you want to archive this property?')) {
      try {
        await deleteProperty(id);
        setSuccess('Property archived successfully!');
        loadData();
      } catch (err) {
        setError('Failed to delete property.');
      }
    }
  };

  // Open Edit Modal
  const handleEditClick = (prop) => {
    setEditingProperty({ ...prop });
    setShowEditModal(true);
  };

  // Submit Updated Details
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      await updateProperty(editingProperty._id, editingProperty);
      setSuccess('Property updated successfully!');
      setShowEditModal(false);
      loadData();
    } catch (err) {
      setError('Failed to update property details.');
    }
  };

  // Auto-fill Rent Amount on property select
  const handlePropertySelect = (propertyId) => {
    const selectedProp = properties.find((p) => p._id === propertyId);
    setContractData({
      ...contractData,
      property: propertyId,
      rentAmount: selectedProp ? selectedProp.price : ''
    });
  };

  // Create Contract
  const handleContractSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (new Date(contractData.endDate) <= new Date(contractData.startDate)) {
      setError('End Date must be strictly after Start Date.');
      return;
    }

    const selectedProp = properties.find((p) => p._id === contractData.property);
    if (selectedProp && selectedProp.status?.toLowerCase() === 'rented') {
      setError('This property already has an active lease.');
      return;
    }

    try {
      await createContract({
        ...contractData,
        rentAmount: Number(contractData.rentAmount)
      });
      setSuccess('Lease contract created successfully!');
      setContractData({ property: '', tenant: '', startDate: '', endDate: '', rentAmount: '' });
      setShowContractModal(false);
      loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create contract.');
    }
  };

  // Terminate Lease
  const handleTerminateContract = async (id) => {
    if (window.confirm('Are you sure you want to end this lease? The property will return to Available status.')) {
      setError('');
      setSuccess('');
      try {
        await terminateContract(id);
        setSuccess('Lease terminated successfully.');
        loadData();
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to terminate lease contract.');
      }
    }
  };

  // Filtering Logic
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

  // Metric Calculation
  const metrics = useMemo(() => {
    const activeContractsList = contracts.filter((c) => c.status?.toLowerCase() === 'active');
    return {
      totalProperties: properties.length,
      occupiedCount: properties.filter((p) =>
        ['occupied', 'rented'].includes(p.status?.toLowerCase())
      ).length,
      activeContracts: activeContractsList.length,
      totalRevenue: activeContractsList.reduce((acc, curr) => acc + (curr.rentAmount || 0), 0),
    };
  }, [properties, contracts]);

  const availableProperties = useMemo(
    () => properties.filter((p) => p.status?.toLowerCase() !== 'rented'),
    [properties]
  );

  return (
    <div className="pm-admin">
      <Container>
        {/* Header */}
        <div className="pm-header">
          <div>
            <h1 className="pm-title">Admin Portal</h1>
            <p className="pm-subtitle">
              System performance overview, user accounts, and full CRUD property controls
            </p>
          </div>
          <div className="pm-header-actions">
            <Button
              variant="light"
              className="pm-btn-ghost"
              onClick={() => setShowUserManagement(!showUserManagement)}
            >
              {showUserManagement ? 'Hide users' : 'Manage users'}
            </Button>
            <Button
              variant="light"
              className="pm-btn-outline"
              onClick={() => setShowContractModal(true)}
            >
              New lease
            </Button>
            <Button
              variant="light"
              className="pm-btn-primary"
              onClick={() => setShowPropertyModal(true)}
            >
              Add property
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
            Synchronizing dashboard records…
          </div>
        ) : (
          <>
            {/* Metrics strip */}
            <div className="pm-metrics">
              <div className="pm-metric">
                <span className="pm-metric-label">Total properties</span>
                <span className="pm-metric-value">{metrics.totalProperties}</span>
              </div>
              <div className="pm-metric">
                <span className="pm-metric-label">Occupied units</span>
                <span className="pm-metric-value">{metrics.occupiedCount}</span>
              </div>
              <div className="pm-metric">
                <span className="pm-metric-label">Active contracts</span>
                <span className="pm-metric-value">{metrics.activeContracts}</span>
              </div>
              <div className="pm-metric">
                <span className="pm-metric-label">Monthly revenue</span>
                <span className="pm-metric-value">₱{metrics.totalRevenue.toLocaleString()}</span>
              </div>
            </div>

            {/* User Management Panel */}
            {showUserManagement && (
              <div className="pm-panel">
                <div className="pm-panel-header">User accounts</div>
                <div style={{ padding: '22px' }}>
                  <UserManagement />
                </div>
              </div>
            )}

            {/* Search & Filter Toolbar */}
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
            <div className="pm-panel">
              <div className="pm-panel-header">
                Property directory ({filteredProperties.length})
              </div>
              <Table responsive className="pm-table mb-0">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Address</th>
                    <th>Type</th>
                    <th>Rent rate</th>
                    <th>Status</th>
                    <th className="text-center">Actions</th>
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
                        <td><StatusPill status={prop.status} /></td>
                        <td className="text-center">
                          <Button
                            variant="light"
                            size="sm"
                            className="pm-btn-edit-outline me-2"
                            onClick={() => handleEditClick(prop)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="light"
                            size="sm"
                            className="pm-btn-danger-outline"
                            onClick={() => handleDeleteProperty(prop._id)}
                          >
                            Archive
                          </Button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="6" className="pm-empty-row">No matching properties found.</td>
                    </tr>
                  )}
                </tbody>
              </Table>
            </div>

            {/* Active Contracts */}
            <div className="pm-panel">
              <div className="pm-panel-header">Active lease contracts</div>
              <Table responsive className="pm-table mb-0">
                <thead>
                  <tr>
                    <th>Property</th>
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
                        <td className="pm-cell-title">{con.property?.title || con.property}</td>
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

            {/* Maintenance Request Manager */}
            <div className="pm-panel">
              <div className="pm-panel-header">Maintenance queue</div>
              <div style={{ padding: '22px' }}>
                <AdminMaintenanceManager />
              </div>
            </div>
          </>
        )}

        {/* Modal: Add Property */}
        <Modal show={showPropertyModal} onHide={() => setShowPropertyModal(false)} size="lg" centered dialogClassName="pm-modal">
          <Modal.Header closeButton>
            <Modal.Title>Add new property</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <PropertyForm onPropertyCreated={() => { loadData(); setShowPropertyModal(false); }} />
          </Modal.Body>
        </Modal>

        {/* Modal: Edit Property */}
        {editingProperty && (
          <Modal show={showEditModal} onHide={() => setShowEditModal(false)} centered dialogClassName="pm-modal">
            <Modal.Header closeButton>
              <Modal.Title>Edit property details</Modal.Title>
            </Modal.Header>
            <Form onSubmit={handleEditSubmit}>
              <Modal.Body>
                <Form.Group className="mb-3">
                  <Form.Label className="pm-form-label">Title</Form.Label>
                  <Form.Control
                    className="pm-input"
                    value={editingProperty.title}
                    onChange={(e) => setEditingProperty({ ...editingProperty, title: e.target.value })}
                    required
                  />
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label className="pm-form-label">Address</Form.Label>
                  <Form.Control
                    className="pm-input"
                    value={editingProperty.address}
                    onChange={(e) => setEditingProperty({ ...editingProperty, address: e.target.value })}
                    required
                  />
                </Form.Group>
                <Row className="mb-3">
                  <Col md={6}>
                    <Form.Label className="pm-form-label">Property type</Form.Label>
                    <Form.Select
                      className="pm-input"
                      value={editingProperty.propertyType}
                      onChange={(e) => setEditingProperty({ ...editingProperty, propertyType: e.target.value })}
                    >
                      {PROPERTY_TYPES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </Form.Select>
                  </Col>
                  <Col md={6}>
                    <Form.Label className="pm-form-label">Status</Form.Label>
                    <Form.Select
                      className="pm-input"
                      value={editingProperty.status}
                      onChange={(e) => setEditingProperty({ ...editingProperty, status: e.target.value })}
                    >
                      {PROPERTY_STATUSES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </Form.Select>
                  </Col>
                </Row>
                <Form.Group className="mb-3">
                  <Form.Label className="pm-form-label">Monthly rate (₱)</Form.Label>
                  <Form.Control
                    className="pm-input"
                    type="number"
                    value={editingProperty.price}
                    onChange={(e) => setEditingProperty({ ...editingProperty, price: Number(e.target.value) })}
                    required
                  />
                </Form.Group>
              </Modal.Body>
              <Modal.Footer>
                <Button variant="light" className="pm-btn-ghost" onClick={() => setShowEditModal(false)}>Cancel</Button>
                <Button variant="light" className="pm-btn-primary" type="submit">Save changes</Button>
              </Modal.Footer>
            </Form>
          </Modal>
        )}

        {/* Modal: New Lease Contract */}
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
                  {availableProperties.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.title} (₱{p.price?.toLocaleString()}/mo)
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>
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