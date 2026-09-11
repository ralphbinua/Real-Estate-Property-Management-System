import { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Table, Alert } from 'react-bootstrap';
import { useAuth } from '../context/AuthContext';
import { fetchProperties } from '../services/propertyService';
import { fetchContracts } from '../services/contractService';
import MetricCard from '../components/MetricCard';
import { renderStatusBadge } from '../utils/badgeUtils';

export default function OwnerDashboard() {
  const { user } = useAuth();
  const [properties, setProperties] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadOwnerData = async () => {
      try {
        const propData = await fetchProperties();
        const contractData = await fetchContracts();
        setProperties(propData);
        setContracts(contractData);
      } catch (err) {
        setError('Failed to fetch portfolio data.');
      }
    };
    loadOwnerData();
  }, []);

  // Portfolio Calculations
  const totalOwned = properties.length;
  const occupiedUnits = properties.filter(
    (p) => p.status?.toLowerCase() === 'occupied' || p.status?.toLowerCase() === 'rented'
  ).length;
  const totalMonthlyIncome = contracts.reduce((acc, curr) => acc + (curr.rentAmount || 0), 0);

  return (
    <div className="bg-light min-vh-100 py-4">
      <Container>
        {/* Header */}
        <div className="bg-white p-4 rounded border shadow-sm mb-4">
          <h2 className="fw-bold text-dark mb-1">Owner Portfolio Overview</h2>
          <p className="text-secondary mb-0">
            Track asset performance, occupancy rates, and active rental income logs
          </p>
        </div>

        {error && <Alert variant="danger">{error}</Alert>}

        {/* Metric Summary Cards */}
        <Row className="mb-2">
          <Col md={4}>
            <MetricCard title="Owned Properties" value={totalOwned} variant="primary" icon="🏢" />
          </Col>
          <Col md={4}>
            <MetricCard title="Occupied Units" value={occupiedUnits} variant="success" icon="🔑" />
          </Col>
          <Col md={4}>
            <MetricCard
              title="Est. Monthly Revenue"
              value={`₱${totalMonthlyIncome.toLocaleString()}`}
              variant="warning"
              icon="💰"
            />
          </Col>
        </Row>

        {/* Owned Property Table */}
        <Card className="shadow-sm border-0 mb-4">
          <Card.Header className="bg-white fw-bold py-3 text-dark border-bottom">
            Property Assets Directory ({properties.length})
          </Card.Header>
          <Table hover responsive className="mb-0 align-middle bg-white">
            <thead className="table-light">
              <tr>
                <th>Property Title</th>
                <th>Address</th>
                <th>Type</th>
                <th>Rental Value</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {properties.length > 0 ? (
                properties.map((prop) => (
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
                  <td colSpan="5" className="text-center text-muted py-4">
                    No property assets linked to your account.
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
        </Card>

        {/* Active Tenant Leases */}
        <Card className="shadow-sm border-0">
          <Card.Header className="bg-white fw-bold py-3 text-dark border-bottom">
            Active Tenant Leases & Monthly Income
          </Card.Header>
          <Table hover responsive className="mb-0 align-middle bg-white">
            <thead className="table-light">
              <tr>
                <th>Property</th>
                <th>Tenant Name</th>
                <th>Monthly Rental</th>
                <th>Lease Status</th>
              </tr>
            </thead>
            <tbody>
              {contracts.length > 0 ? (
                contracts.map((con) => (
                  <tr key={con._id}>
                    <td className="fw-bold text-dark">{con.property?.title || con.property}</td>
                    <td>{con.tenant?.name || con.tenant}</td>
                    <td className="text-success fw-bold">₱{con.rentAmount?.toLocaleString()}</td>
                    <td>{renderStatusBadge(con.status)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="4" className="text-center text-muted py-4">
                    No active lease contracts found.
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
        </Card>
      </Container>
    </div>
  );
}