import { Children } from 'react';
import { workspaceSectionTitle } from '../config/workspaceNavigation';

export default function DashboardHeader({ role, section, overviewTitle, overviewDescription, children }) {
  const overview = section === 'overview';
  const actions = Children.toArray(children);
  return (
    <header className="pm-header" id="overview">
      <div>
        <h1 className="pm-title">{overview ? overviewTitle : workspaceSectionTitle(role, section)}</h1>
        {overview && overviewDescription && <p className="pm-subtitle">{overviewDescription}</p>}
      </div>
      {actions.length > 0 && <div className="pm-header-actions">{actions}</div>}
    </header>
  );
}
