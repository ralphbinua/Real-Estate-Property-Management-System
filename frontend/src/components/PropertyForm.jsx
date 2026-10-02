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
    applicationApprovalMode: 'Owner',
    instructionNote: '',
    instructionReference: '',
    owner: '',
    manager: '',
    assignedAgents: [],
    units: [{ unitNumber: '101', monthlyRate: '' }],
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
      price: Number(formData.price || (['Apartment', 'Condo'].includes(formData.propertyType) ? formData.units[0]?.monthlyRate : 0) || 0),
      propertyType: formData.propertyType,
      status: formData.status,
      applicationApprovalMode: formData.applicationApprovalMode,
      assignedAgents: formData.assignedAgents,
    };
    if (formData.applicationApprovalMode === 'Manager') {
      payload.instructionNote = formData.instructionNote.trim();
      payload.instructionReference = formData.instructionReference.trim();
      if (!payload.instructionNote || !payload.instructionReference) {
        setError('Add the Owner’s written instruction and a reference before selecting Manager approval.');
        setLoading(false);
        return;
      }
    }
    if (['Apartment', 'Condo'].includes(formData.propertyType)) {
      payload.units = formData.units.map((unit) => ({ ...unit, monthlyRate: Number(unit.monthlyRate), status: 'Available' }));
    }

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
      const details = err.response?.data || {};
      setError(details.detail || details.owner?.[0] || details.manager?.[0] || details.instructionNote?.[0] || details.instructionReference?.[0] || details.message || 'Failed to save property.');
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

      {['Apartment', 'Condo'].includes(formData.propertyType) && (
        <Form.Group className="mb-3">
          <div className="d-flex justify-content-between align-items-center mb-2">
            <Form.Label className="fw-bold text-secondary mb-0">Units and monthly rent</Form.Label>
            <Button type="button" size="sm" variant="outline-primary" onClick={() => setFormData((current) => ({ ...current, units: [...current.units, { unitNumber: '', monthlyRate: '' }] }))}>Add unit</Button>
          </div>
          {formData.units.map((unit, index) => (
            <Row className="g-2 mb-2" key={`unit-${index}`}>
              <Col><Form.Control placeholder="Unit number (e.g. 101)" value={unit.unitNumber} onChange={(e) => setFormData((current) => ({ ...current, units: current.units.map((item, i) => i === index ? { ...item, unitNumber: e.target.value } : item) }))} required /></Col>
              <Col><Form.Control type="number" min="0" step="0.01" placeholder="Monthly rent (₱)" value={unit.monthlyRate} onChange={(e) => setFormData((current) => ({ ...current, units: current.units.map((item, i) => i === index ? { ...item, monthlyRate: e.target.value } : item) }))} required /></Col>
              <Col xs="auto"><Button type="button" variant="outline-danger" disabled={formData.units.length === 1} aria-label={`Remove unit ${index + 1}`} onClick={() => setFormData((current) => ({ ...current, units: current.units.filter((_, i) => i !== index) }))}>Remove</Button></Col>
            </Row>
          ))}
          <Form.Text className="text-muted">Each unit can have a different rent. Add all unit numbers before saving.</Form.Text>
        </Form.Group>
      )}

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
        {!['Apartment', 'Condo'].includes(formData.propertyType) && <Col md={6}>
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
        </Col>}
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
              required
            >
              <option value="">Choose an owner</option>
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
              required={formData.applicationApprovalMode === 'Manager'}
            >
              <option value="">{formData.applicationApprovalMode === 'Manager' ? 'Choose a manager' : 'Optional Manager'}</option>
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

      <Form.Group className="mb-3">
        <Form.Label className="fw-bold text-secondary">Rental application approval</Form.Label>
        <Form.Select
          value={formData.applicationApprovalMode}
          onChange={(e) => setFormData({ ...formData, applicationApprovalMode: e.target.value })}
        >
          <option value="Manager">Property Manager reviews and decides</option>
          <option value="Owner">Property Manager reviews; Owner makes final decision</option>
        </Form.Select>
        <Form.Text className="text-muted">New properties start with Owner approval. Select Manager approval only when the Owner has delegated that decision.</Form.Text>
      </Form.Group>

      {formData.applicationApprovalMode === 'Manager' && (
        <Row className="mb-3">
          <Col md={7}>
            <Form.Group>
              <Form.Label className="fw-bold text-secondary">Owner’s written instruction</Form.Label>
              <Form.Control as="textarea" rows={2} value={formData.instructionNote} onChange={(e) => setFormData({ ...formData, instructionNote: e.target.value })} required />
            </Form.Group>
          </Col>
          <Col md={5}>
            <Form.Group>
              <Form.Label className="fw-bold text-secondary">Instruction reference</Form.Label>
              <Form.Control value={formData.instructionReference} onChange={(e) => setFormData({ ...formData, instructionReference: e.target.value })} placeholder="Email, letter, or agreement record" required />
            </Form.Group>
          </Col>
        </Row>
      )}

      <Button variant="primary" type="submit" className="w-100 fw-bold py-2 mt-2" disabled={loading}>
        {loading ? 'Saving Property...' : 'Submit Property'}
      </Button>
    </Form>
  );
}
