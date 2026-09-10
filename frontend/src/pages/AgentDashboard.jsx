import { useState, useEffect } from 'react';
import { Container, Table, Alert } from 'react-bootstrap';
import { fetchProperties } from '../services/propertyService';

export default function AgentDashboard() {
  const [properties, setProperties] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadProperties = async () => {
      try {
        const data = await fetchProperties();
        // Filter or display available properties for leasing agents
        setProperties(data);
      } catch (err) {
        setError('Failed to fetch listings.');
      }
    };
    loadProperties();
  }, []);

  return (
    <Container className="mt-5 mb-5">
      <h2>Agent Dashboard - Property Listings</h2>
      {error && <Alert variant="danger">{error}</Alert>}

      <Table striped bordered hover className="mt-4">
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
          {properties.map((prop) => (
            <tr key={prop._id}>
              <td>{prop.title}</td>
              <td>{prop.propertyType}</td>
              <td>{prop.address}</td>
              <td>₱{prop.price?.toLocaleString()}</td>
              <td>
                <span className={`badge bg-${prop.status === 'Available' ? 'success' : 'secondary'}`}>
                  {prop.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Container>
  );
}