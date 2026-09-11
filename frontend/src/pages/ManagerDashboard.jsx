import { useState, useEffect } from 'react';
import { Container, Table, Alert, Card, Row, Col, Button, Form } from 'react-bootstrap';
import { fetchProperties } from '../services/propertyService';
import MetricCard from '../components/MetricCard';
import PropertyFilter from '../components/PropertyFilter';
import { renderStatusBadge } from '../utils/badgeUtils';

export default function ManagerDashboard() {
  const [properties, setProperties] = useState([]);
  const [error, setError] = useState('');

  // Filter State
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  useEffect(() => {
    const loadManagerData = async () => {
      try {
        const data = await fetchProperties();
        setProperties(data);
      } catch (err) {
        setError('Failed to fetch property records.');
      }
    };
    loadManagerData();
  }, []);

  const filteredProperties = properties.filter((prop) => {
    const matchesSearch = prop.title?.toLowerCase().includes(search.toLowerCase()) || 
                          prop.address?.toLowerCase().includes(search.toLowerCase());
    const matchesType = filterType ? prop.propertyType === filterType : true;
    const matchesStatus = filterStatus ? prop.status?.toLowerCase() === filterStatus.toLowerCase() : true;
    return matchesSearch && matchesType && matchesStatus;
  });

  const totalAssigned = properties.length;
  const availableCount = properties.filter(p => p.status?.toLowerCase() === 'available').length;
  const occupiedCount = properties.filter(p => p.status?.toLowerCase() === 'occupied' || p.status?.toLowerCase() === 'rented').length;

  return (
    <div className="bg-light min-vh-100 py-4">
      <Container>
        <div className="bg-white p-4 rounded border shadow-sm mb-4">
          <h2 className="fw-bold text-dark mb-1">Property Manager Dashboard</h2>
          <p className="text-secondary mb-0">Oversee property operations, maintenance requests, and unit statuses</p>
        </div>

        {error && <Alert variant="danger">{error}</Alert>}

        {/* Metric Cards Row */}
        <Row className="mb-2">
          <Col md={4}>
            <MetricCard title="Assigned Properties" value={totalAssigned} variant="primary" icon="🏢" />
          </Col>
          <Col md={4}>
            <MetricCard title="Available Units" value={availableCount} variant="warning" icon="🔓" />
          </Col>
          <Col md={4}>
            <MetricCard title="Occupied Units" value={occupiedCount} variant="success" icon="🔑" />
          </Col>
        </Row>

        <PropertyFilter 
          search={search} 
          setSearch={setSearch} 
          filterType={filterType} 
          setFilterType={setFilterType} 
          filterStatus={filterStatus} 
          setFilterStatus={setFilterStatus} 
        />

        <Card className="shadow-sm border-0">
          <Card.Header className="bg-white fw-bold py-3 text-dark border-bottom">
            Managed Properties Overview ({filteredProperties.length})
          </Card.Header>
          <Table hover responsive className="mb-0 align-middle bg-white">
            <thead className="table-light">
              <tr>
                <th>Property Title</th>
                <th>Address</th>
                <th>Type</th>
                <th>Monthly Rate</th>
                <th>Status</th>
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
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="text-center text-muted py-4">No matching properties found.</td>
                </tr>
              )}
            </tbody>
          </Table>
        </Card>
      </Container>
    </div>
  );
}