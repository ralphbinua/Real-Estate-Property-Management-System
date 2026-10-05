import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const ROLE_ROUTES = {
  admin: { path: '/admin', sections: ['overview', 'properties', 'contracts', 'users', 'maintenance', 'reports', 'billing', 'activity', 'settings'] },
  manager: { path: '/manager', sections: ['overview', 'properties', 'contracts', 'inquiries', 'applications', 'pricing', 'reports', 'billing', 'maintenance'] },
  agent: { path: '/agent', sections: ['overview', 'listings', 'inquiries', 'applications'] },
  owner: { path: '/owner', sections: ['overview', 'portfolio', 'approvals', 'pricing', 'contracts', 'history', 'maintenance', 'billing'] },
  tenant: { path: '/tenant', sections: ['overview', 'payments', 'lease', 'maintenance'] },
};

export default function useNotificationDeepLink(role) {
  const { pathname, search } = useLocation();

  useEffect(() => {
    const route = ROLE_ROUTES[role];
    const section = new URLSearchParams(search).get('section');
    if (pathname !== route?.path || !route.sections.includes(section)) return;
    window.dispatchEvent(new CustomEvent('workspace:navigate', { detail: section }));
  }, [pathname, role, search]);
}
