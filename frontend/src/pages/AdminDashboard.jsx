import { useState, useEffect } from 'react';
import { Container, Table, Alert, Button, Form, Row, Col } from 'react-bootstrap';
import { fetchProperties } from '../services/propertyService';
import { fetchContracts, createContract } from '../services/contractService';
import PropertyForm from '../components/PropertyForm';

export default function AdminDashboard() {
  const [properties, setProperties] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showPropertyForm, setShowPropertyForm] = useState(false);
  const [showContractForm, setShowContractForm] = useState(false);

  const [contractData, setContractData] = useState({
    property: '',
    tenant: '',
    startDate: '',
    endDate: '',
    rentAmount: ''
  });

  const loadData = async () => {
    try {
      const propData = await fetchProperties();
      const contractData = await fetchContracts();
      setProperties(propData);
      setContracts(contractData);
    } catch (err) {
      setError('Failed to fetch dashboard data.');
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleContractSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      await createContract({
        ...contractData,
        rentAmount: Number(contractData.rentAmount)
      });
      setSuccess('Lease contract created successfully!');
      setContractData({ property: '', tenant: '', startDate: '', endDate: '', rentAmount: '' });
      setShowContractForm(false);
      loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create contract');
    }
  };

  return (
    <Container className="mt-5 mb-5">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>Admin Dashboard</h2>
        <div>
          <Button variant="outline-primary" className="me-2" onClick={() => setShowContractForm(!showContractForm)}>
            {showContractForm ? 'Close Contract Form' : 'New Lease Contract'}
          </Button>
          <Button variant="primary" onClick={() => setShowPropertyForm(!showPropertyForm)}>
            {showPropertyForm ? 'Close Property Form' : 'Add New Property'}
          </Button>
        </div>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}
      {success && <Alert variant="success">{success}</Alert>}

      {showPropertyForm && <PropertyForm onPropertyCreated={loadData} />}

      {/* Contract Creation Form */}
      {showContractForm && (
        <Form onSubmit={handleContractSubmit} className="p-4 border rounded bg-light mb-4">
          <h4>Create Lease Contract</h4>
          <Row className="mb-3">
            <Col md={6}>
              <Form.Group>
                <Form.Label>Property ID</Form.Label>
                <Form.Control 
                  value={contractData.property} 
                  onChange={(e) => setContractData({ ...contractData, property: e.target.value })} 
                  placeholder="MongoDB Property ID" 
                  required 
                />
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group>
                <Form.Label>Tenant User ID</Form.Label>
                <Form.Control 
                  value={contractData.tenant} 
                  onChange={(e) => setContractData({ ...contractData, tenant: e.target.value })} 
                  placeholder="MongoDB Tenant ID" 
                  required 
                />
              </Form.Group>
            </Col>
          </Row>
          <Row className="mb-3">
            <Col md={4}>
              <Form.Group>
                <Form.Label>Start Date</Form.Label>
                <Form.Control type="date" value={contractData.startDate} onChange={(e) => setContractData({ ...contractData, startDate: e.target.value })} required />
              </Form.Group>
            </Col>
            <Col md={4}>
              <Form.Group>
                <Form.Label>End Date</Form.Label>
                <Form.Control type="date" value={contractData.endDate} onChange={(e) => setContractData({ ...contractData, endDate: e.target.value })} required />
              </Form.Group>
            </Col>
            <Col md={4}>
              <Form.Group>
                <Form.Label>Rent Amount (₱)</Form.Label>
                <Form.Control type="number" value={contractData.rentAmount} onChange={(e) => setContractData({ ...contractData, rentAmount: e.target.value })} required />
              </Form.Group>
            </Col>
          </Row>
          <Button variant="success" type="submit">Save Contract</Button>
        </Form>
      )}

      <h4 className="mt-4">Active Properties</h4>
      <Table striped bordered hover>
        <thead>
          <tr>
            <th>Title</th>
            <th>Type</th>
            <th>Price</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {properties.map((prop) => (
            <tr key={prop._id}>
              <td>{prop.title}</td>
              <td>{prop.propertyType}</td>
              <td>₱{prop.price?.toLocaleString()}</td>
              <td>{prop.status}</td>
            </tr>
          ))}
        </tbody>
      </Table>

      <h4 className="mt-5">Lease Contracts</h4>
      <Table striped bordered hover>
        <thead>
          <tr>
            <th>Property</th>
            <th>Tenant</th>
            <th>Rent</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {contracts.length > 0 ? (
            contracts.map((con) => (
              <tr key={con._id}>
                <td>{con.property?.title || con.property}</td>
                <td>{con.tenant?.name || con.tenant}</td>
                <td>₱{con.rentAmount?.toLocaleString()}</td>
                <td>{con.status}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="4" className="text-center">No contracts found.</td>
            </tr>
          )}
        </tbody>
      </Table>
    </Container>
  );
}``