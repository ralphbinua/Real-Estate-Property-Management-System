import { useState, useEffect, useMemo } from 'react';
import { Container, Table, Alert, Button, Form, Row, Col, Modal, Card, Spinner } from 'react-bootstrap';
import { fetchProperties, updateProperty, deleteProperty } from '../services/propertyService';
import { fetchContracts, createContract } from '../services/contractService';
import { fetchUsers } from '../services/userService';
import PropertyForm from '../components/PropertyForm';
import UserManagement from '../components/UserManagement';
import AdminMaintenanceManager from '../components/AdminMaintenanceManager';
import MetricCard from '../components/MetricCard';
import PropertyFilter from '../components/PropertyFilter';
import { renderStatusBadge } from '../utils/badgeUtils';

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
      setProperties(propData);
      setContracts(contractsData);
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

  // Handle Property Deletion
  const handleDeleteProperty = async (id) => {
  // Contracts may come back with `property` as a raw ID or a populated object
  const linkedContracts = contracts.filter((c) => {
    const propId = c.property?._id || c.property;
    return propId === id;
  });

  if (linkedContracts.length > 0) {
    setError(
      `Cannot delete this property: ${linkedContracts.length} lease contract(s) are still linked to it. Cancel or reassign those leases first.`
    );
    return;
  }

  if (window.confirm('Are you sure you want to delete this property?')) {
    try {
      await deleteProperty(id);
      setSuccess('Property deleted successfully!');
      loadData();
    } catch (err) {
      setError('Failed to delete property.');
    }
  }
};

  // Open Edit Modal with Pre-filled Data
  const handleEditClick = (prop) => {
    setEditingProperty({ ...prop });
    setShowEditModal(true);
  };

  // Submit Updated Property Details
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    try {
      await updateProperty(editingProperty._id, editingProperty);
      setSuccess('Property updated successfully!');
      setShowEditModal(false);
      loadData();
    } catch (err) {
      setError('Failed to update property details.');
    }
  };

  // Auto-fill Rent Amount when a property is selected in the lease modal
  const handlePropertySelect = (propertyId) => {
    const selectedProp = properties.find((p) => p._id === propertyId);
    setContractData({
      ...contractData,
      property: propertyId,
      rentAmount: selectedProp ? selectedProp.price : ''
    });
  };

  // Handle Contract Submission (with date & availability validation)
  const handleContractSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Validate Dates
    if (new Date(contractData.endDate) <= new Date(contractData.startDate)) {
      setError('End Date must be strictly after Start Date.');
      return;
    }

    // Validate Property Availability
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

  // Dynamic Filtering Logic
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

  // Metric Calculations
  const metrics = useMemo(() => {
    const activeContractsList = contracts.filter((c) => c.status?.toLowerCase() === 'active');
    return {
      totalProperties: properties.length,
      occupiedCount: properties.filter((p) =>
        ['occupied', 'rented'].includes(p.status?.toLowerCase())
      ).length,
      activeContracts: activeContractsList.length,
      // Only active leases count toward current monthly revenue
      totalRevenue: activeContractsList.reduce((acc, curr) => acc + (curr.rentAmount || 0), 0),
    };
  }, [properties, contracts]);

  // Properties that don't already have an active/rented lease
  const availableProperties = useMemo(
    () => properties.filter((p) => p.status?.toLowerCase() !== 'rented'),
    [properties]
  );

  return (
    <div className="bg-light min-vh-100 py-4">
      <Container>
        {/* Header Block */}
        <div className="d-flex justify-content-between align-items-center mb-4 bg-white p-4 rounded border shadow-sm">
          <div>
            <h2 className="fw-bold text-dark mb-1">Admin Portal</h2>
            <p className="text-secondary mb-0">System performance overview, user accounts, and full CRUD property controls</p>
          </div>
          <div>
            <Button
              variant={showUserManagement ? 'secondary' : 'outline-dark'}
              className="me-2 fw-medium"
              onClick={() => setShowUserManagement(!showUserManagement)}
            >
              {showUserManagement ? 'Hide Users' : 'Manage Users'}
            </Button>
            <Button variant="outline-primary" className="me-2 fw-medium" onClick={() => setShowContractModal(true)}>
              + New Lease
            </Button>
            <Button variant="primary" className="fw-bold" onClick={() => setShowPropertyModal(true)}>
              + Add Property
            </Button>
          </div>
        </div>

        {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}
        {success && <Alert variant="success" dismissible onClose={() => setSuccess('')}>{success}</Alert>}

        {loading ? (
          <div className="text-center text-muted py-5 bg-white rounded border shadow-sm mb-4">
            <Spinner animation="border" size="sm" className="me-2" />
            Loading dashboard data…
          </div>
        ) : (
          <>
            {/* Light Metric Summary Cards */}
            <Row className="mb-2">
              <Col md={3}>
                <MetricCard title="Total Properties" value={metrics.totalProperties} variant="primary" icon="🏢" />
              </Col>
              <Col md={3}>
                <MetricCard title="Occupied Units" value={metrics.occupiedCount} variant="success" icon="🔑" />
              </Col>
              <Col md={3}>
                <MetricCard title="Active Contracts" value={metrics.activeContracts} variant="info" icon="📄" />
              </Col>
              <Col md={3}>
                <MetricCard title="Monthly Revenue" value={`₱${metrics.totalRevenue.toLocaleString()}`} variant="warning" icon="💰" />
              </Col>
            </Row>

            {/* Admin User Management Accordion Panel */}
            {showUserManagement && (
              <div className="bg-white p-4 rounded border shadow-sm mb-4">
                <UserManagement />
              </div>
            )}

            {/* Search & Category Filter Toolbar */}
            <PropertyFilter
              search={search}
              setSearch={setSearch}
              filterType={filterType}
              setFilterType={setFilterType}
              filterStatus={filterStatus}
              setFilterStatus={setFilterStatus}
            />

            {/* Property Directory Card */}
            <Card className="shadow-sm mb-4 border-0">
              <Card.Header className="bg-white fw-bold py-3 text-dark border-bottom">
                Property Directory ({filteredProperties.length})
              </Card.Header>
              <Table hover responsive className="mb-0 align-middle bg-white">
                <thead className="table-light">
                  <tr>
                    <th>Title</th>
                    <th>Address</th>
                    <th>Type</th>
                    <th>Rent Rate</th>
                    <th>Status</th>
                    <th className="text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProperties.length > 0 ? (
                    filteredProperties.map((prop) => (
                      <tr key={prop._id}>
                        <td className="fw-bold text-dark">{prop.title}</td>
                        <td className="text-secondary">{prop.address}</td>
                        <td>{prop.propertyType}</td>
                        <td>₱{prop.price?.toLocaleString()}</td>
                        <td>{renderStatusBadge(prop.status)}</td>
                        <td className="text-center">
                          <Button
                            variant="outline-primary"
                            size="sm"
                            className="me-2"
                            onClick={() => handleEditClick(prop)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="outline-danger"
                            size="sm"
                            onClick={() => handleDeleteProperty(prop._id)}
                          >
                            Delete
                          </Button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="6" className="text-center text-muted py-4">No matching properties found.</td>
                    </tr>
                  )}
                </tbody>
              </Table>
            </Card>

            {/* Active Contracts Table */}
            <Card className="shadow-sm mb-4 border-0">
              <Card.Header className="bg-white fw-bold py-3 text-dark border-bottom">
                Active Lease Contracts
              </Card.Header>
              <Table hover responsive className="mb-0 align-middle bg-white">
                <thead className="table-light">
                  <tr>
                    <th>Property</th>
                    <th>Tenant</th>
                    <th>Monthly Rent</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {contracts.length > 0 ? (
                    contracts.map((con) => (
                      <tr key={con._id}>
                        <td className="fw-bold text-dark">{con.property?.title || con.property}</td>
                        <td>{con.tenant?.name || con.tenant}</td>
                        <td>₱{con.rentAmount?.toLocaleString()}</td>
                        <td>{renderStatusBadge(con.status)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="4" className="text-center text-muted py-4">No lease contracts recorded.</td>
                    </tr>
                  )}
                </tbody>
              </Table>
            </Card>

            {/* System Maintenance Request Manager */}
            <AdminMaintenanceManager />
          </>
        )}

        {/* Modal: Add Property */}
        <Modal show={showPropertyModal} onHide={() => setShowPropertyModal(false)} size="lg" centered>
          <Modal.Header closeButton className="bg-white border-bottom">
            <Modal.Title className="fw-bold text-dark">Add New Property</Modal.Title>
          </Modal.Header>
          <Modal.Body className="bg-white p-4">
            <PropertyForm onPropertyCreated={() => { loadData(); setShowPropertyModal(false); }} />
          </Modal.Body>
        </Modal>

        {/* Modal: Edit Property */}
        {editingProperty && (
          <Modal show={showEditModal} onHide={() => setShowEditModal(false)} centered>
            <Modal.Header closeButton className="bg-white border-bottom">
              <Modal.Title className="fw-bold text-dark">Edit Property Details</Modal.Title>
            </Modal.Header>
            <Form onSubmit={handleEditSubmit}>
              <Modal.Body className="bg-white p-4">
                <Form.Group className="mb-3">
                  <Form.Label className="fw-bold text-secondary">Title</Form.Label>
                  <Form.Control
                    value={editingProperty.title}
                    onChange={(e) => setEditingProperty({ ...editingProperty, title: e.target.value })}
                    required
                  />
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label className="fw-bold text-secondary">Address</Form.Label>
                  <Form.Control
                    value={editingProperty.address}
                    onChange={(e) => setEditingProperty({ ...editingProperty, address: e.target.value })}
                    required
                  />
                </Form.Group>
                <Row className="mb-3">
                  <Col md={6}>
                    <Form.Label className="fw-bold text-secondary">Property Type</Form.Label>
                    <Form.Select
                      value={editingProperty.propertyType}
                      onChange={(e) => setEditingProperty({ ...editingProperty, propertyType: e.target.value })}
                    >
                      <option value="Condo">Condo</option>
                      <option value="House">House</option>
                      <option value="Apartment">Apartment</option>
                    </Form.Select>
                  </Col>
                  <Col md={6}>
                    <Form.Label className="fw-bold text-secondary">Status</Form.Label>
                    <Form.Select
                      value={editingProperty.status}
                      onChange={(e) => setEditingProperty({ ...editingProperty, status: e.target.value })}
                    >
                      <option value="Available">Available</option>
                      <option value="Occupied">Occupied</option>
                      <option value="Pending">Pending</option>
                    </Form.Select>
                  </Col>
                </Row>
                <Form.Group className="mb-3">
                  <Form.Label className="fw-bold text-secondary">Monthly Rate (₱)</Form.Label>
                  <Form.Control
                    type="number"
                    value={editingProperty.price}
                    onChange={(e) => setEditingProperty({ ...editingProperty, price: Number(e.target.value) })}
                    required
                  />
                </Form.Group>
              </Modal.Body>
              <Modal.Footer className="bg-white border-top">
                <Button variant="secondary" onClick={() => setShowEditModal(false)}>Cancel</Button>
                <Button variant="primary" type="submit" className="fw-bold">Save Changes</Button>
              </Modal.Footer>
            </Form>
          </Modal>
        )}

        {/* Modal: New Lease Contract */}
        <Modal show={showContractModal} onHide={() => setShowContractModal(false)} centered>
          <Modal.Header closeButton className="bg-white border-bottom">
            <Modal.Title className="fw-bold text-dark">Create Lease Contract</Modal.Title>
          </Modal.Header>
          <Modal.Body className="bg-white p-4">
            <Form onSubmit={handleContractSubmit}>
              <Form.Group className="mb-3">
                <Form.Label className="fw-bold text-secondary">Select Property</Form.Label>
                <Form.Select
                  value={contractData.property}
                  onChange={(e) => handlePropertySelect(e.target.value)}
                  required
                >
                  <option value="">-- Choose Property --</option>
                  {availableProperties.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.title} (₱{p.price?.toLocaleString()}/mo)
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label className="fw-bold text-secondary">Select Tenant Account</Form.Label>
                <Form.Select
                  value={contractData.tenant}
                  onChange={(e) => setContractData({ ...contractData, tenant: e.target.value })}
                  required
                >
                  <option value="">-- Choose Tenant --</option>
                  {userList.map((u) => (
                    <option key={u._id} value={u._id}>
                      {u.name} ({u.email})
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>
              <Row className="mb-3">
                <Col md={6}>
                  <Form.Label className="fw-bold text-secondary">Start Date</Form.Label>
                  <Form.Control
                    type="date"
                    value={contractData.startDate}
                    onChange={(e) => setContractData({ ...contractData, startDate: e.target.value })}
                    required
                  />
                </Col>
                <Col md={6}>
                  <Form.Label className="fw-bold text-secondary">End Date</Form.Label>
                  <Form.Control
                    type="date"
                    value={contractData.endDate}
                    onChange={(e) => setContractData({ ...contractData, endDate: e.target.value })}
                    required
                  />
                </Col>
              </Row>
              <Form.Group className="mb-4">
                <Form.Label className="fw-bold text-secondary">Rent Amount (₱)</Form.Label>
                <Form.Control
                  type="number"
                  value={contractData.rentAmount}
                  onChange={(e) => setContractData({ ...contractData, rentAmount: e.target.value })}
                  required
                />
              </Form.Group>
              <Button variant="primary" type="submit" className="w-100 py-2 fw-bold">
                Save Lease Contract
              </Button>
            </Form>
          </Modal.Body>
        </Modal>
      </Container>
    </div>
  );
}