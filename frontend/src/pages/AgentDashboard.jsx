import { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Alert, Badge } from 'react-bootstrap';
import { fetchProperties } from '../services/propertyService';
import PropertyFilter from '../components/PropertyFilter';
import MetricCard from '../components/MetricCard';
import { renderStatusBadge } from '../utils/badgeUtils';

export default function AgentDashboard() {
  const [properties, setProperties] = useState([]);
  const [error, setError] = useState('');

  // Search & Filter State
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  useEffect(() => {
    const loadAgentData = async () => {
      try {
        const data = await fetchProperties();
        setProperties(data);
      } catch (err) {
        setError('Failed to fetch property listings.');
      }
    };
    loadAgentData();
  }, []);

  const filteredProperties = properties.filter((prop) => {
    const matchesSearch = prop.title?.toLowerCase().includes(search.toLowerCase()) || 
                          prop.address?.toLowerCase().includes(search.toLowerCase());
    const matchesType = filterType ? prop.propertyType === filterType : true;
    const matchesStatus = filterStatus ? prop.status?.toLowerCase() === filterStatus.toLowerCase() : true;
    return matchesSearch && matchesType && matchesStatus;
  });

  const totalListings = properties.length;
  const availableCount = properties.filter(p => p.status?.toLowerCase() === 'available').length;

  return (
    <div className="bg-light min-vh-100 py-4">
      <Container>
        {/* Header */}
        <div className="bg-white p-4 rounded border shadow-sm mb-4">
          <h2 className="fw-bold text-dark mb-1">Agent Property Directory</h2>
          <p className="text-secondary mb-0">Browse real-time listings, pricing, and availability for clients</p>
        </div>

        {error && <Alert variant="danger">{error}</Alert>}

        {/* Metrics */}
        <Row className="mb-2">
          <Col md={6}>
            <MetricCard title="Total System Listings" value={totalListings} variant="primary" icon="🏘️" />
          </Col>
          <Col md={6}>
            <MetricCard title="Available for Lease" value={availableCount} variant="success" icon="✅" />
          </Col>
        </Row>

        {/* Search & Filter */}
        <PropertyFilter 
          search={search} 
          setSearch={setSearch} 
          filterType={filterType} 
          setFilterType={setFilterType} 
          filterStatus={filterStatus} 
          setFilterStatus={setFilterStatus} 
        />

        {/* Property Grid View */}
        <Row>
          {filteredProperties.length > 0 ? (
            filteredProperties.map((prop) => (
              <Col md={4} key={prop._id} className="mb-4">
                <Card className="shadow-sm border-0 h-100">
                  <Card.Body className="d-flex flex-column">
                    <div className="d-flex justify-content-between align-items-start mb-2">
                      <Badge bg="secondary" className="fw-normal">{prop.propertyType}</Badge>
                      {renderStatusBadge(prop.status)}
                    </div>
                    <Card.Title className="fw-bold text-dark">{prop.title}</Card.Title>
                    <Card.Text className="text-secondary small mb-3">📍 {prop.address}</Card.Text>
                    <div className="mt-auto pt-3 border-top d-flex justify-content-between align-items-center">
                      <span className="text-muted small">Monthly Rent</span>
                      <span className="fw-bold fs-5 text-primary">₱{prop.price?.toLocaleString()}</span>
                    </div>
                  </Card.Body>
                </Card>
              </Col>
            ))
          ) : (
            <Col md={12}>
              <div className="bg-white text-center p-5 rounded border text-muted">
                No properties match your current search criteria.
              </div>
            </Col>
          )}
        </Row>
      </Container>
    </div>
  );
}