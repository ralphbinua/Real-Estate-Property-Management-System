import { useState, useEffect } from 'react';
import { Form, Button, Row, Col, Alert } from 'react-bootstrap';
import { createProperty } from '../services/propertyService';
import { fetchUsers } from '../services/userService';

export default function PropertyForm({ onPropertyCreated }) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    address: '',
    price: '',
    propertyType: 'Apartment',
    status: 'Available',
    owner: '',
    manager: '',
    assignedAgents: [],
  });

  const [owners, setOwners] = useState([]);
  const [managers, setManagers] = useState([]);
  const [agents, setAgents] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const users = await fetchUsers();
        // Filter users to show only those with the role 'Owner'
        setOwners(users.filter(u => u.isActive && u.role?.toLowerCase() === 'owner'));
        setManagers(users.filter(u => u.isActive && u.role?.toLowerCase() === 'property manager'));
        setAgents(users.filter(u => u.isActive && u.role?.toLowerCase() === 'agent'));
      } catch (err) {
        setError('Failed to load owners/managers list.');
      }
    };
    loadUsers();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Build clean payload
    const payload = {
      title: formData.title,
      description: formData.description,
      address: formData.address,
      price: Number(formData.price),
      propertyType: formData.propertyType,
      status: formData.status,
      assignedAgents: formData.assignedAgents,
    };

    // Only append non-empty ObjectId strings
    if (formData.owner && formData.owner.trim() !== '') {
      payload.owner = formData.owner;
    }
    if (formData.manager && formData.manager.trim() !== '') {
      payload.manager = formData.manager;
    }

    try {
      await createProperty(payload);
      setLoading(false);
      if (onPropertyCreated) onPropertyCreated();
    } catch (err) {
      setLoading(false);
      setError(err.response?.data?.message || 'Failed to save property.');
    }
  };

  return (
    <Form onSubmit={handleSubmit}>
      {error && <Alert variant="danger">{error}</Alert>}

      <Row className="mb-3">
        <Col md={6}>
          <Form.Group>
            <Form.Label className="fw-bold text-secondary">Title</Form.Label>
            <Form.Control 
              placeholder="e.g. Modern Sunset Condo"
              value={formData.title} 
              onChange={(e) => setFormData({ ...formData, title: e.target.value })} 
              required 
            />
          </Form.Group>
        </Col>
        <Col md={6}>
          <Form.Group>
            <Form.Label className="fw-bold text-secondary">Property Type</Form.Label>
            <Form.Select 
              value={formData.propertyType} 
              onChange={(e) => setFormData({ ...formData, propertyType: e.target.value })}
            >
              <option value="Apartment">Apartment</option>
              <option value="Condo">Condo</option>
              <option value="House">House</option>
            </Form.Select>
          </Form.Group>
        </Col>
      </Row>

      <Form.Group className="mb-3">
        <Form.Label className="fw-bold text-secondary">Description</Form.Label>
        <Form.Control 
          as="textarea" 
          rows={3} 
          placeholder="Brief description of the unit..."
          value={formData.description} 
          onChange={(e) => setFormData({ ...formData, description: e.target.value })} 
        />
      </Form.Group>

      <Row className="mb-3">
        <Col md={6}>
          <Form.Group>
            <Form.Label className="fw-bold text-secondary">Address</Form.Label>
            <Form.Control 
              placeholder="Full property address"
              value={formData.address} 
              onChange={(e) => setFormData({ ...formData, address: e.target.value })} 
              required 
            />
          </Form.Group>
        </Col>
        <Col md={6}>
          <Form.Group>
            <Form.Label className="fw-bold text-secondary">Price (₱)</Form.Label>
            <Form.Control 
              type="number" 
              placeholder="Monthly rent price"
              value={formData.price} 
              onChange={(e) => setFormData({ ...formData, price: e.target.value })} 
              required 
            />
          </Form.Group>
        </Col>
      </Row>

      <Row className="mb-3">
        <Col md={4}>
          <Form.Group>
            <Form.Label className="fw-bold text-secondary">Status</Form.Label>
            <Form.Select 
              value={formData.status} 
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
            >
              <option value="Available">Available</option>
              <option value="Occupied">Occupied</option>
              <option value="Under Maintenance">Under Maintenance</option>
            </Form.Select>
          </Form.Group>
        </Col>
        <Col md={4}>
          <Form.Group>
            <Form.Label className="fw-bold text-secondary">Assign Property Owner</Form.Label>
            <Form.Select 
              value={formData.owner} 
              onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
            >
              <option value="">Optional Owner</option>
              {owners.map((o) => (
                <option key={o._id} value={o._id}>
                  {o.name} ({o.email})
                </option>
              ))}
            </Form.Select>
          </Form.Group>
        </Col>
        <Col md={4}>
          <Form.Group>
            <Form.Label className="fw-bold text-secondary">Assign Property Manager</Form.Label>
            <Form.Select 
              value={formData.manager} 
              onChange={(e) => setFormData({ ...formData, manager: e.target.value })}
            >
              <option value="">Optional Manager</option>
              {managers.map((m) => (
                <option key={m._id} value={m._id}>
                  {m.name} ({m.email})
                </option>
              ))}
            </Form.Select>
          </Form.Group>
        </Col>
        <Col md={12} className="mt-3">
          <Form.Group>
            <Form.Label className="fw-bold text-secondary">Assign Agents</Form.Label>
            <Form.Select
              multiple
              value={formData.assignedAgents.map(String)}
              onChange={(e) => setFormData({
                ...formData,
                assignedAgents: Array.from(e.target.selectedOptions, (option) => Number(option.value)),
              })}
            >
              {agents.map((agent) => (
                <option key={agent._id} value={agent._id}>
                  {agent.name} ({agent.email})
                </option>
              ))}
            </Form.Select>
            <Form.Text className="text-muted">Hold Ctrl (Windows) or Command (Mac) to select multiple agents.</Form.Text>
          </Form.Group>
        </Col>
      </Row>

      <Button variant="primary" type="submit" className="w-100 fw-bold py-2 mt-2" disabled={loading}>
        {loading ? 'Saving Property...' : 'Submit Property'}
      </Button>
    </Form>
  );
}
