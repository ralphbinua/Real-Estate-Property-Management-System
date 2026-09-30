import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Container, Navbar, Nav } from 'react-bootstrap';
import { useAuth } from '../context/AuthContext';
import { fetchSystemSettings } from '../services/systemSettingsService';

const ROLE_ROUTES = {
  Admin: { path: '/admin', label: 'Administrator' },
  'Property Manager': { path: '/manager', label: 'Property manager' },
  Agent: { path: '/agent', label: 'Agent' },
  Owner: { path: '/owner', label: 'Property owner' },
  Tenant: { path: '/tenant', label: 'Tenant' },
};

function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'U';
}

export default function AppNavbar() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [systemName, setSystemName] = useState('PropManage');
  const role = ROLE_ROUTES[user?.role] || ROLE_ROUTES.Tenant;

  useEffect(() => {
    if (!user) return undefined;
    const loadSettings = () => fetchSystemSettings()
      .then((settings) => setSystemName(settings.system_name || 'PropManage'))
      .catch(() => {});
    loadSettings();
    window.addEventListener('system-settings-updated', loadSettings);
    return () => window.removeEventListener('system-settings-updated', loadSettings);
  }, [user]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <Navbar expand="lg" className="app-navbar sticky-top">
      <Container>
        <Navbar.Brand as={Link} to={user ? role.path : '/login'} className="app-brand">
          <span className="app-brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M4 20V8.5L12 4l8 4.5V20M2.5 20h19M8 10h2v2H8zm6 0h2v2h-2zm-6 4h2v2H8zm6 0h2v2h-2zM11 20v-3h2v3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span>{systemName}</span>
        </Navbar.Brand>

        {user && <Navbar.Toggle aria-controls="app-primary-navigation" aria-label="Toggle navigation" />}
        {user && (
          <Navbar.Collapse id="app-primary-navigation">
            <Nav className="me-auto ms-lg-5">
              <Nav.Link as={Link} to={role.path} className="app-nav-link active">Dashboard</Nav.Link>
            </Nav>
            <div className="app-account">
              <span className="app-role-pill">{role.label}</span>
              <span className="app-avatar" aria-hidden="true">{initials(user.name || user.email)}</span>
              <span className="app-account-name">{user.name || user.email}</span>
              <Button variant="outline-secondary" size="sm" className="app-logout" onClick={handleLogout}>Sign out</Button>
            </div>
          </Navbar.Collapse>
        )}
      </Container>
    </Navbar>
  );
}
