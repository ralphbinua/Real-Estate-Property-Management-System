import { Form, Row, Col, InputGroup } from 'react-bootstrap';

export default function PropertyFilter({ search, setSearch, filterType, setFilterType, filterStatus, setFilterStatus }) {
  return (
    <div className="p-3 bg-light rounded border shadow-sm mb-4">
      <Row className="g-3">
        <Col md={6}>
          <InputGroup>
            <InputGroup.Text>🔍</InputGroup.Text>
            <Form.Control 
              placeholder="Search by title or location..." 
              value={search} 
              onChange={(e) => setSearch(e.target.value)} 
            />
          </InputGroup>
        </Col>
        <Col md={3}>
          <Form.Select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
            <option value="">All Property Types</option>
            <option value="Condo">Condo</option>
            <option value="House">House</option>
            <option value="Apartment">Apartment</option>
          </Form.Select>
        </Col>
        <Col md={3}>
          <Form.Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="Available">Available</option>
            <option value="Occupied">Occupied</option>
          </Form.Select>
        </Col>
      </Row>
    </div>
  );
}