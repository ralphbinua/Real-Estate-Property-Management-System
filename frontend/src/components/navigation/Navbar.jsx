import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button, Container, Navbar } from 'react-bootstrap';
import { useAuth } from '../../context/useAuth';
import { fetchSystemSettings } from '../../services/users/systemSettingsService';
import NotificationCenter from '../notifications/NotificationCenter';
import WorkspaceSidebar from './WorkspaceSidebar';
import MobileWorkspaceTabs from './MobileWorkspaceTabs';
import { MOBILE_PRIMARY_SECTIONS, MOBILE_SEARCH_SECTIONS, ROLE_WORKSPACES } from '../../config/workspaceNavigation';

function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'U';
}

export default function AppNavbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const [systemName, setSystemName] = useState('PropManage');
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 991.98px)').matches);
  const [expandedRoute, setExpandedRoute] = useState(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const expanded = expandedRoute === location.key;
  const setExpanded = (next) => setExpandedRoute(next ? location.key : null);
  const role = ROLE_WORKSPACES[user?.role] || ROLE_WORKSPACES.Tenant;
  const routeKey = location.pathname.slice(1);
  const workspaceRole = MOBILE_PRIMARY_SECTIONS[routeKey] && (role.key === routeKey || role.key === 'admin') ? routeKey : null;
  const searchSection = MOBILE_SEARCH_SECTIONS[workspaceRole];

  useEffect(() => {
    const query = window.matchMedia('(max-width: 991.98px)');
    const sync = () => setMobile(query.matches);
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    const loadSettings = () => fetchSystemSettings()
      .then((settings) => setSystemName(settings.system_name || 'PropManage'))
      .catch(() => {});
    loadSettings();
    window.addEventListener('system-settings-updated', loadSettings);
    return () => window.removeEventListener('system-settings-updated', loadSettings);
  }, [user]);

  useEffect(() => {
    if (!expanded) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setExpandedRoute(null);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [expanded]);

  const handleLogout = async () => {
    setExpanded(false);
    setAccountOpen(false);
    if (await logout()) navigate('/login');
  };

  return (
    <Navbar expand="lg" expanded={expanded} onToggle={setExpanded} className={`app-navbar sticky-top${expanded ? ' is-menu-open' : ''}`}>
      <Container fluid={Boolean(user)} className={user ? 'app-navbar-container' : undefined}>
        <Navbar.Brand as={Link} to={user ? role.path : '/login'} className="app-brand">
          <span className="app-brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M4 20V8.5L12 4l8 4.5V20M2.5 20h19M8 10h2v2H8zm6 0h2v2h-2zm-6 4h2v2H8zm6 0h2v2h-2zM11 20v-3h2v3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span>{systemName}</span>
        </Navbar.Brand>

        {user && mobile && <div className="app-mobile-top-actions">
          {searchSection && <button type="button" className="app-mobile-search-toggle" aria-label={`Search and filter ${searchSection === 'listings' ? 'listings' : 'properties'}`} onClick={() => {
            setAccountOpen(false);
            setExpanded(false);
            navigate(`/${workspaceRole}?section=${searchSection}`);
            window.dispatchEvent(new CustomEvent('workspace:navigate', { detail: searchSection }));
            window.dispatchEvent(new CustomEvent('workspace:open-filters', { detail: workspaceRole }));
          }}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.3" stroke="currentColor" strokeWidth="1.8" /><path d="m16 16 5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </button>}
          <NotificationCenter />
          <button type="button" className="app-mobile-account-toggle" aria-label="Account" aria-expanded={accountOpen} onClick={() => setAccountOpen((current) => !current)}>
            <span className="app-avatar" aria-hidden="true">{initials(user.name || user.email)}</span>
          </button>
        </div>}
        {user && !mobile && <Navbar.Toggle aria-controls="app-primary-navigation" aria-expanded={expanded} aria-label="Toggle navigation" />}
        {user && (
          <Navbar.Collapse id="app-primary-navigation">
            <div className="app-mobile-workspace-nav">
              <WorkspaceSidebar mobileMenu onNavigate={() => setExpanded(false)} />
            </div>
            <div className="app-account">
              <div className="app-mobile-account-heading">ACCOUNT</div>
              {!mobile && <NotificationCenter />}
              <span className="app-role-pill">{role.label}</span>
              <Link to="/profile" className="app-profile-link" aria-label="Your profile" onClick={() => setExpanded(false)}>
                <span className="app-avatar" aria-hidden="true">{initials(user.name || user.email)}</span>
                <span className="app-profile-copy">
                  <span className="app-account-name">{user.name || user.email}</span>
                  <span className="app-mobile-profile-role">{role.label}</span>
                </span>
              </Link>
              <Button variant="outline-secondary" size="sm" className="app-logout" onClick={handleLogout}>Sign out</Button>
            </div>
          </Navbar.Collapse>
        )}
      </Container>
      {user && expanded && <div className="app-menu-scrim" aria-hidden="true" onClick={() => setExpanded(false)} />}
      {user && mobile && accountOpen && <div className="app-account-sheet-scrim" onClick={() => setAccountOpen(false)}>
        <section className="app-account-sheet" role="dialog" aria-label="Account" onClick={(event) => event.stopPropagation()}>
          <div className="app-account-sheet-handle" aria-hidden="true" />
          <div className="app-account-sheet-person"><span className="app-avatar" aria-hidden="true">{initials(user.name || user.email)}</span><div><strong>{user.name || user.email}</strong><small>{role.label}</small></div></div>
          <Link to="/profile" onClick={() => setAccountOpen(false)}>Profile</Link>
          <button type="button" onClick={handleLogout}>Sign out</button>
        </section>
      </div>}
      {user && workspaceRole && <MobileWorkspaceTabs role={workspaceRole} onMore={() => { setAccountOpen(false); setExpanded(!expanded); }} moreOpen={expanded} />}
    </Navbar>
  );
}
