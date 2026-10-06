import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { WORKSPACE_NAVIGATION, ROLE_WORKSPACES, isWorkspaceSection } from '../config/workspaceNavigation';

export default function WorkspaceSidebar() {
  const { user } = useAuth();
  const location = useLocation();
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
    window.dispatchEvent(new CustomEvent('workspace:navigate', { detail: section }));
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  };

  return (
    <aside className={`workspace-sidebar${mobileOpen ? ' is-mobile-open' : ''}`} aria-label="Workspace navigation">
      <div className="workspace-sidebar-heading">WORKSPACE</div>
      <button
        type="button"
        className="workspace-mobile-toggle"
        aria-controls="workspace-section-navigation"
        aria-expanded={mobileOpen}
        onClick={() => setExpandedNavigation((current) => current === navigationKey ? null : navigationKey)}
      >
        <span>Workspace</span>
        <strong>{activeLabel}</strong>
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5 7 5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <nav className="workspace-side-nav" id="workspace-section-navigation">
        {WORKSPACE_NAVIGATION[roleKey].map(([section, label, code]) => (
          <a
            key={section}
            href={`/${roleKey}`}
            className={`workspace-side-link${active === section ? ' is-active' : ''}`}
            aria-current={active === section ? 'page' : undefined}
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
