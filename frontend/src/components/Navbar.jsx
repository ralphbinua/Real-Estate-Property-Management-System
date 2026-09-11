import { Navbar, Nav, Container, Button, Badge } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function NavigationBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (!user) return null; // Hide navbar on login page when unauthenticated

  const role = user.role?.toLowerCase();

  return (
    <Navbar bg="dark" variant="dark" expand="lg" className="shadow-sm px-3 sticky-top">
      <Container fluid>
        <Navbar.Brand as={Link} to="/" className="fw-bold text-white">
          🏢 PropManage
        </Navbar.Brand>
        <Navbar.Toggle aria-controls="navbar-nav" />
        <Navbar.Collapse id="navbar-nav">
          <Nav className="me-auto">
            {role === 'admin' && (
              <Nav.Link as={Link} to="/admin" className="text-light fw-medium">
                Admin Dashboard
              </Nav.Link>
            )}
            {(role === 'property manager' || role === 'admin') && (
              <Nav.Link as={Link} to="/manager" className="text-light fw-medium">
                Manager Portal
              </Nav.Link>
            )}
            {(role === 'agent' || role === 'admin') && (
              <Nav.Link as={Link} to="/agent" className="text-light fw-medium">
                Agent Listings
              </Nav.Link>
            )}
            {role === 'tenant' && (
              <Nav.Link as={Link} to="/tenant" className="text-light fw-medium">
                Tenant Portal
              </Nav.Link>
            )}
            {role === 'owner' && (
              <Nav.Link as={Link} to="/owner" className="text-light fw-medium">
                Owner Portfolio
              </Nav.Link>
            )}
          </Nav>
          <Nav className="align-items-center">
            <span className="text-light me-3 fw-medium">
              {user.name} <Badge bg="secondary" className="ms-1">{user.role}</Badge>
            </span>
            <Button variant="outline-danger" size="sm" className="fw-bold" onClick={handleLogout}>
              Logout
            </Button>
          </Nav>
        </Navbar.Collapse>
      </Container>
    </Navbar>
  );
}