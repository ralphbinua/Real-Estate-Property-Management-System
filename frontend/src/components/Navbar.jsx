import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Navbar, Nav, Container, Button } from 'react-bootstrap';
import { useAuth } from '../context/AuthContext';
import { fetchSystemSettings } from '../services/systemSettingsService';

export default function AppNavbar() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [systemName, setSystemName] = useState('PropManage');

  useEffect(() => {
    if (!user) return;
    const loadSettings = () => fetchSystemSettings().then((settings) => setSystemName(settings.system_name || 'PropManage')).catch(() => {});
    loadSettings();
    window.addEventListener('system-settings-updated', loadSettings);
    return () => window.removeEventListener('system-settings-updated', loadSettings);
  }, [user]);

  // Get home route dynamically based on active session role
  const getHomeRoute = () => {
    if (!user) return '/login';
    switch (user.role?.toLowerCase()) {
      case 'admin':
        return '/admin';
      case 'property manager':
        return '/manager';
      case 'agent':
        return '/agent';
      case 'owner':
        return '/owner';
      default:
        return '/tenant';
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <Navbar bg="dark" variant="dark" expand="lg">
      <Container>
        {/* Brand logo routes to current role dashboard */}
        <Navbar.Brand as={Link} to={getHomeRoute()} className="fw-bold fs-4">
          🏢 {systemName}
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
