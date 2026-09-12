import { Link, useNavigate } from 'react-router-dom';
import { Navbar, Nav, Container, Button } from 'react-bootstrap';

export default function AppNavbar() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user'));

  // Get home route dynamically based on active session role
  const getHomeRoute = () => {
    if (!user) return '/login';
    switch (user.role) {
      case 'Admin':
        return '/admin';
      case 'Property Manager':
        return '/manager';
      default:
        return '/tenant';
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('user');
    navigate('/login');
  };

  return (
    <Navbar bg="dark" variant="dark" expand="lg">
      <Container>
        {/* Brand logo routes to current role dashboard */}
        <Navbar.Brand as={Link} to={getHomeRoute()} className="fw-bold fs-4">
          🏢 PropManage
        </Navbar.Brand>

        <Navbar.Toggle aria-controls="basic-navbar-nav" />
        <Navbar.Collapse id="basic-navbar-nav">
          <Nav className="me-auto">
            {user?.role === 'Admin' && (
              <Nav.Link as={Link} to="/admin">
                Admin Dashboard
              </Nav.Link>
            )}
            {user?.role === 'Property Manager' && (
              <Nav.Link as={Link} to="/manager">
                Manager Portal
              </Nav.Link>
            )}
          </Nav>

          {user && (
            <div className="d-flex align-items-center gap-2">
              <span className="text-light me-2">{user.name}</span>
              <Button variant="outline-danger" size="sm" onClick={handleLogout}>
                Logout
              </Button>
            </div>
          )}
        </Navbar.Collapse>
      </Container>
    </Navbar>
  );
}