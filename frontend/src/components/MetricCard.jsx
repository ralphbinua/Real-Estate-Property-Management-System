import { Card, Row, Col } from 'react-bootstrap';

export default function MetricCard({ title, value, variant = 'primary', icon }) {
  return (
    <Card className={`border-start border-4 border-${variant} shadow-sm mb-4`}>
      <Card.Body>
        <Row className="align-items-center">
          <Col>
            <div className="text-uppercase text-muted fw-bold fs-7 mb-1">{title}</div>
            <div className="h3 mb-0 fw-bold">{value}</div>
          </Col>
          {icon && (
            <Col xs="auto">
              <span className={`fs-1 text-${variant}`}>{icon}</span>
            </Col>
          )}
        </Row>
      </Card.Body>
    </Card>
  );
}