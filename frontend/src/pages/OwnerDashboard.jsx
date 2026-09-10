import { useState, useEffect } from 'react';
import { Container, Table, Alert, Row, Col, Card } from 'react-bootstrap';
import { fetchOwnerPortfolio } from '../services/ownerService';

export default function OwnerDashboard() {
  const [portfolio, setPortfolio] = useState({ properties: [], contracts: [] });
  const [error, setError] = useState('');

  useEffect(() => {
    const loadPortfolio = async () => {
      try {
        const data = await fetchOwnerPortfolio();
        setPortfolio(data);
      } catch (err) {
        setError('Failed to fetch owner portfolio data.');
      }
    };
    loadPortfolio();
  }, []);

  // Calculate total portfolio asset value / monthly rental income
  const totalMonthlyIncome = portfolio.contracts.reduce((acc, curr) => acc + (curr.rentAmount || 0), 0);

  return (
    <Container className="mt-5 mb-5">
      <h2>Owner Dashboard - Asset Portfolio</h2>
      {error && <Alert variant="danger">{error}</Alert>}

      <Row className="mt-4 mb-4">
        <Col md={6}>
          <Card className="bg-light p-3">
            <Card.Body>
              <Card.Title>Total Owned Properties</Card.Title>
              <h3>{portfolio.properties.length}</h3>
            </Card.Body>
          </Card>
        </Col>
        <Col md={6}>
          <Card className="bg-light p-3">
            <Card.Body>
              <Card.Title>Active Monthly Rental Income</Card.Title>
              <h3>₱{totalMonthlyIncome.toLocaleString()}</h3>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <h4 className="mt-4">My Properties</h4>
      <Table striped bordered hover>
        <thead>
          <tr>
            <th>Title</th>
            <th>Type</th>
            <th>Address</th>
            <th>Price</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {portfolio.properties.length > 0 ? (
            portfolio.properties.map((prop) => (
              <tr key={prop._id}>
                <td>{prop.title}</td>
                <td>{prop.propertyType}</td>
                <td>{prop.address}</td>
                <td>₱{prop.price?.toLocaleString()}</td>
                <td>{prop.status}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="5" className="text-center">No properties assigned to your owner ID.</td>
            </tr>
          )}
        </tbody>
      </Table>

      <h4 className="mt-5">Active Lease Contracts</h4>
      <Table striped bordered hover>
        <thead>
          <tr>
            <th>Property</th>
            <th>Tenant</th>
            <th>Rent Amount</th>
            <th>Lease Period</th>
          </tr>
        </thead>
        <tbody>
          {portfolio.contracts.length > 0 ? (
            portfolio.contracts.map((con) => (
              <tr key={con._id}>
                <td>{con.property?.title}</td>
                <td>{con.tenant?.name}</td>
                <td>₱{con.rentAmount?.toLocaleString()}</td>
                <td>
                  {new Date(con.startDate).toLocaleDateString()} - {new Date(con.endDate).toLocaleDateString()}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="4" className="text-center">No active contracts found for your portfolio.</td>
            </tr>
          )}
        </tbody>
      </Table>
    </Container>
  );
}