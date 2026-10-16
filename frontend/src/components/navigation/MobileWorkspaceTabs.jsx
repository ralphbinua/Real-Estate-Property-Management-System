import { useLocation, useNavigate } from 'react-router-dom';
import { MOBILE_MORE_GROUPS, MOBILE_PRIMARY_SECTIONS, MOBILE_TAB_LABELS, WORKSPACE_NAVIGATION } from '../../config/workspaceNavigation';
import { SectionIcon } from './WorkspaceSidebar';

export default function MobileWorkspaceTabs({ role, onMore, moreOpen }) {
  const location = useLocation();
  const navigate = useNavigate();
  const tabs = MOBILE_PRIMARY_SECTIONS[role].map((section) => [section, MOBILE_TAB_LABELS[role]?.[section] || WORKSPACE_NAVIGATION[role].find(([key]) => key === section)?.[1]]);
  const hasMore = Boolean(MOBILE_MORE_GROUPS[role]?.length);
  const requested = new URLSearchParams(location.search).get('section');
  const active = requested || 'overview';

  const select = (section) => {
    navigate(`/${role}?section=${encodeURIComponent(section)}`);
    window.dispatchEvent(new CustomEvent('workspace:navigate', { detail: section }));
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  };

  return (
    <nav className="mobile-workspace-tabs" aria-label="Primary workspace navigation">
      {tabs.map(([section, label]) => (
        <button key={section} type="button" className={active === section && !moreOpen ? 'is-active' : ''} aria-current={active === section && !moreOpen ? 'page' : undefined} onClick={() => select(section)}>
          <SectionIcon section={section} /><small>{label}</small>
        </button>
      ))}
      {hasMore && <button type="button" className={moreOpen || !tabs.some(([section]) => section === active) ? 'is-active' : ''} aria-current={!tabs.some(([section]) => section === active) ? 'page' : undefined} aria-expanded={moreOpen} aria-controls="app-primary-navigation" onClick={onMore}>
        <span aria-hidden="true">{moreOpen ? '✕' : '☰'}</span><small>{moreOpen ? 'Close' : 'More'}</small>
      </button>}
    </nav>
  );
}
