import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { isWorkspaceSection } from '../config/workspaceNavigation';

export default function useNotificationDeepLink(role) {
  const { pathname, search } = useLocation();

  useEffect(() => {
    const section = new URLSearchParams(search).get('section');
    if (pathname !== `/${role}` || !isWorkspaceSection(role, section)) return;
    window.dispatchEvent(new CustomEvent('workspace:navigate', { detail: section }));
  }, [pathname, role, search]);
}
