import { useState } from 'react';
import { Form, Button, Alert, Row, Col } from 'react-bootstrap';
import { createProperty } from '../services/propertyService';

export default function PropertyForm({ onPropertyCreated }) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    address: '',
    propertyType: 'Apartment',
    price: '',
    owner: '', // Will need a valid User ObjectId from your DB for the owner
    bedrooms: 0,
    bathrooms: 0,
    squareMeters: 0,
  });
  
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      // Map flat state to match the nested backend schema structure
      const payload = {
        title: formData.title,
        description: formData.description,
        address: formData.address,
        propertyType: formData.propertyType,
        price: Number(formData.price),
        owner: formData.owner,
        features: {
          bedrooms: Number(formData.bedrooms),
          bathrooms: Number(formData.bathrooms),
          squareMeters: Number(formData.squareMeters),
        }
      };

      await createProperty(payload);
      setSuccess('Property created successfully!');
      setFormData({
        title: '', description: '', address: '', propertyType: 'Apartment',
        price: '', owner: '', bedrooms: 0, bathrooms: 0, squareMeters: 0
      });
      if (onPropertyCreated) onPropertyCreated();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create property');
    }
  };

  return (
    <Form onSubmit={handleSubmit} className="p-4 border rounded bg-light mb-4">
      <h4>Add New Property</h4>
      {error && <Alert variant="danger">{error}</Alert>}
      {success && <Alert variant="success">{success}</Alert>}

      <Row className="mb-3">
        <Col md={6}>
          <Form.Group>
            <Form.Label>Title</Form.Label>
            <Form.Control name="title" value={formData.title} onChange={handleChange} required />
          </Form.Group>
        </Col>
        <Col md={6}>
          <Form.Group>
            <Form.Label>Property Type</Form.Label>
            <Form.Select name="propertyType" value={formData.propertyType} onChange={handleChange}>
              <option value="Apartment">Apartment</option>
              <option value="House">House</option>
              <option value="Condo">Condo</option>
              <option value="Commercial">Commercial</option>
            </Form.Select>
          </Form.Group>
        </Col>
      </Row>

      <Form.Group className="mb-3">
        <Form.Label>Description</Form.Label>
        <Form.Control as="textarea" rows={2} name="description" value={formData.description} onChange={handleChange} required />
      </Form.Group>

      <Row className="mb-3">
        <Col md={8}>
          <Form.Group>
            <Form.Label>Address</Form.Label>
            <Form.Control name="address" value={formData.address} onChange={handleChange} required />
          </Form.Group>
        </Col>
        <Col md={4}>
          <Form.Group>
            <Form.Label>Price (₱)</Form.Label>
            <Form.Control type="number" name="price" value={formData.price} onChange={handleChange} required />
          </Form.Group>
        </Col>
      </Row>

      <Row className="mb-3">
        <Col md={4}>
          <Form.Group>
            <Form.Label>Bedrooms</Form.Label>
            <Form.Control type="number" name="bedrooms" value={formData.bedrooms} onChange={handleChange} />
          </Form.Group>
        </Col>
        <Col md={4}>
          <Form.Group>
            <Form.Label>Bathrooms</Form.Label>
            <Form.Control type="number" name="bathrooms" value={formData.bathrooms} onChange={handleChange} />
          </Form.Group>
        </Col>
        <Col md={4}>
          <Form.Group>
            <Form.Label>Owner User ID</Form.Label>
            <Form.Control name="owner" placeholder="MongoDB User ID" value={formData.owner} onChange={handleChange} required />
            <Form.Text className="text-muted">Paste a valid User ID from your DB with role 'Owner'</Form.Text>
          </Form.Group>
        </Col>
      </Row>

      <Button variant="success" type="submit">Submit Property</Button>
    </Form>
  );
}