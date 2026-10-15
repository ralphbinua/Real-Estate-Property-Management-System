import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { WORKSPACE_NAVIGATION, ROLE_WORKSPACES, isWorkspaceSection } from '../config/workspaceNavigation';

const sectionIcons = {
  overview: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  properties: <><path d="M3 21V8l9-5 9 5v13M2 21h20M8 10h3v3H8zm6 0h3v3h-3zM10 21v-5h4v5" /></>,
  listings: <><path d="M4 21V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16M3 21h18M8 8h8M8 12h8M9 21v-5h6v5" /></>,
  portfolio: <><path d="M3 20h18M5 20V9l7-5 7 5v11M9 12h6M9 16h6" /></>,
  contracts: <><path d="M6 3h9l4 4v14H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm9 0v5h4M8 12h8M8 16h8" /></>,
  lease: <><path d="M6 3h9l4 4v14H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm9 0v5h4M8 12h8M8 16h8" /></>,
  users: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 6a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 5" /></>,
  inquiries: <><path d="M4 5h16v12H9l-5 4V5zM8 9h8M8 13h5" /></>,
  applications: <><path d="M6 3h9l4 4v14H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm9 0v5h4M8 13h8M8 17h5" /></>,
  approvals: <><path d="M6 3h9l4 4v14H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm9 0v5h4M8 15l2.5 2.5L16 12" /></>,
  pricing: <><path d="M3 7h12l6 5-6 5H3V7zM7 12h.01M13 9v6" /></>,
  billing: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h4" /></>,
  payments: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h4" /></>,
  maintenance: <><path d="m4 20 8-8M14 4a5 5 0 0 0 6 6l-7 7-6-6 7-7zM3 21l-1-1 3-3 2 2-3 3z" /></>,
  reports: <><path d="M4 20h16M6 16v-5M12 16V5M18 16V9" /></>,
  history: <><path d="M3 12a9 9 0 1 0 2-5M3 4v4h4M12 7v5l3 2" /></>,
  activity: <><path d="M3 12h4l3-6 4 12 3-6h4" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2m10 10 2 2M19 5l-2 2M7 17l-2 2" /></>,
};

function SectionIcon({ section }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{sectionIcons[section] || sectionIcons.overview}</svg>;
}

export default function WorkspaceSidebar({ mobileMenu = false, onNavigate }) {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const roleKey = location.pathname === '/manager' && user?.role === 'Admin'
    ? 'manager'
    : location.pathname === '/agent' && user?.role === 'Admin'
      ? 'agent'
      : location.pathname === '/owner' && user?.role === 'Admin'
        ? 'owner'
        : ROLE_WORKSPACES[user?.role]?.key || 'tenant';
  const navigationKey = `${location.pathname}:${location.search}:${roleKey}`;
  const requestedSection = new URLSearchParams(location.search).get('section');
  const routeSection = location.pathname === '/notifications' ? ''
    : isWorkspaceSection(roleKey, requestedSection) ? requestedSection : 'overview';
  const [selection, setSelection] = useState(null);
  const [expandedNavigation, setExpandedNavigation] = useState(null);
  const active = selection?.key === navigationKey ? selection.section : routeSection;
  const mobileOpen = expandedNavigation === navigationKey;
  const activeLabel = WORKSPACE_NAVIGATION[roleKey].find(([section]) => section === active)?.[1] || 'Choose a section';

  useEffect(() => {
    const syncActiveSection = (event) => {
      setSelection({ key: navigationKey, section: event.detail });
      setExpandedNavigation(null);
    };
    window.addEventListener('workspace:navigate', syncActiveSection);
    return () => window.removeEventListener('workspace:navigate', syncActiveSection);
  }, [navigationKey]);

  const navigateToSection = (event, section) => {
    event.preventDefault();
    setSelection({ key: navigationKey, section });
    setExpandedNavigation(null);
    if (location.pathname === `/${roleKey}`) {
      window.dispatchEvent(new CustomEvent('workspace:navigate', { detail: section }));
    } else {
      navigate(`/${roleKey}?section=${encodeURIComponent(section)}`);
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    onNavigate?.();
  };

  return (
    <aside className={`workspace-sidebar${mobileMenu ? ' workspace-sidebar-menu' : ''}${mobileOpen ? ' is-mobile-open' : ''}`} aria-label="Workspace navigation">
      <div className="workspace-sidebar-heading">WORKSPACE</div>
      {!mobileMenu && <button
        type="button"
        className="workspace-mobile-toggle"
        aria-controls="workspace-section-navigation"
        aria-expanded={mobileOpen}
        onClick={() => setExpandedNavigation((current) => current === navigationKey ? null : navigationKey)}
      >
        <span>Workspace</span>
        <strong>{activeLabel}</strong>
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5 7 5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>}
      <nav className="workspace-side-nav" id={mobileMenu ? 'workspace-section-navigation-menu' : 'workspace-section-navigation'}>
        {WORKSPACE_NAVIGATION[roleKey].map(([section, label]) => (
          <a
            key={section}
            href={`/${roleKey}?section=${encodeURIComponent(section)}`}
            className={`workspace-side-link${active === section ? ' is-active' : ''}`}
            aria-current={active === section ? 'page' : undefined}
            onClick={(event) => navigateToSection(event, section)}
          >
            <span className="workspace-side-icon" aria-hidden="true"><SectionIcon section={section} /></span>
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
