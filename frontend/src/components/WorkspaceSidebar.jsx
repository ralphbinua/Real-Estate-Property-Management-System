import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NAVIGATION = {
  admin: [
    ['overview', 'Overview', 'OV'], ['properties', 'Properties', 'PR'], ['contracts', 'Lease contracts', 'LE'],
    ['users', 'User accounts', 'US'], ['maintenance', 'Maintenance', 'MA'], ['reports', 'Reports', 'RE'],
    ['billing', 'Payments', 'PA'], ['activity', 'Activity log', 'AC'], ['settings', 'System settings', 'SE'],
  ],
  manager: [
    ['overview', 'Overview', 'OV'], ['properties', 'Properties', 'PR'], ['contracts', 'Leases', 'LE'],
    ['inquiries', 'Inquiries', 'IN'], ['applications', 'Applications', 'AP'], ['reports', 'Performance', 'RE'], ['billing', 'Rent ledger', 'PA'], ['maintenance', 'Maintenance', 'MA'],
  ],
  agent: [['overview', 'Overview', 'OV'], ['listings', 'Assigned listings', 'PR'], ['inquiries', 'Prospects', 'IN'], ['applications', 'Applications', 'AP']],
  owner: [['overview', 'Overview', 'OV'], ['portfolio', 'Portfolio', 'PO'], ['approvals', 'Application approvals', 'AP'], ['contracts', 'Lease contracts', 'LE'], ['maintenance', 'Maintenance', 'MA'], ['billing', 'Payments', 'PA']],
  tenant: [['overview', 'Overview', 'OV'], ['payments', 'Rent & payments', 'PA'], ['lease', 'My lease', 'LE'], ['maintenance', 'Maintenance', 'MA']],
};

const ROLE_KEY = {
  Admin: 'admin',
  'Property Manager': 'manager',
  Agent: 'agent',
  Owner: 'owner',
  Tenant: 'tenant',
};

export default function WorkspaceSidebar() {
  const { user } = useAuth();
  const location = useLocation();
  const roleKey = location.pathname === '/manager' && user?.role === 'Admin'
    ? 'manager'
    : location.pathname === '/agent' && user?.role === 'Admin'
      ? 'agent'
      : location.pathname === '/owner' && user?.role === 'Admin'
        ? 'owner'
        : ROLE_KEY[user?.role] || 'tenant';
  const [active, setActive] = useState('overview');

  useEffect(() => {
    const syncActiveSection = (event) => setActive(event.detail);
    window.addEventListener('workspace:navigate', syncActiveSection);
    return () => window.removeEventListener('workspace:navigate', syncActiveSection);
  }, []);

  const navigateToSection = (event, section) => {
    event.preventDefault();
    setActive(section);
    window.dispatchEvent(new CustomEvent('workspace:navigate', { detail: section }));
  };

  return (
    <aside className="workspace-sidebar" aria-label="Workspace navigation">
      <div className="workspace-sidebar-heading">WORKSPACE</div>
      <nav className="workspace-side-nav">
        {NAVIGATION[roleKey].map(([section, label, code]) => (
          <a
            key={section}
            href={`/${roleKey}`}
            className={`workspace-side-link${active === section ? ' is-active' : ''}`}
            onClick={(event) => navigateToSection(event, section)}
          >
            <span className="workspace-side-icon" aria-hidden="true">{code}</span>
            <span>{label}</span>
          </a>
        ))}
      </nav>
      <div className="workspace-sidebar-bottom">
        <div className="workspace-side-note-label">SIGNED IN AS</div>
        <div className="workspace-side-note-name">{user?.name || user?.email}</div>
        <div className="workspace-side-note-role">{user?.role}</div>
      </div>
    </aside>
  );
}
