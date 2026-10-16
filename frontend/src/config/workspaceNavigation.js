export const WORKSPACE_NAVIGATION = {
  admin: [
    ['overview', 'Overview', 'OV'], ['properties', 'Properties', 'PR'], ['contracts', 'Lease contracts', 'LE'],
    ['users', 'User accounts', 'US'], ['maintenance', 'Maintenance', 'MA'], ['reports', 'Reports', 'RE'],
    ['billing', 'Payments', 'PA'], ['activity', 'Activity log', 'AC'], ['settings', 'System settings', 'SE'],
  ],
  manager: [
    ['overview', 'Overview', 'OV'], ['properties', 'Properties', 'PR'], ['contracts', 'Leases', 'LE'],
    ['inquiries', 'Inquiries', 'IN'], ['applications', 'Applications', 'AP'], ['pricing', 'Rent changes', '₱'],
    ['reports', 'Performance', 'RE'], ['billing', 'Rent ledger', 'PA'], ['maintenance', 'Maintenance', 'MA'],
  ],
  agent: [['overview', 'Overview', 'OV'], ['listings', 'Assigned listings', 'PR'], ['inquiries', 'Prospects', 'IN'], ['applications', 'Applications', 'AP']],
  owner: [['overview', 'Overview', 'OV'], ['portfolio', 'Portfolio', 'PO'], ['approvals', 'Application approvals', 'AP'], ['pricing', 'Rent changes', '₱'], ['contracts', 'Lease contracts', 'LE'], ['history', 'History', 'HI'], ['maintenance', 'Maintenance', 'MA'], ['billing', 'Payments', 'PA']],
  tenant: [['overview', 'Overview', 'OV'], ['payments', 'Rent & payments', 'PA'], ['lease', 'My lease', 'LE'], ['maintenance', 'Maintenance', 'MA']],
};

export const ROLE_WORKSPACES = {
  Admin: { key: 'admin', path: '/admin', label: 'Administrator' },
  'Property Manager': { key: 'manager', path: '/manager', label: 'Property manager' },
  Agent: { key: 'agent', path: '/agent', label: 'Agent' },
  Owner: { key: 'owner', path: '/owner', label: 'Property owner' },
  Tenant: { key: 'tenant', path: '/tenant', label: 'Tenant' },
};

export const MOBILE_PRIMARY_SECTIONS = {
  admin: ['overview', 'properties', 'contracts', 'maintenance'],
  manager: ['overview', 'properties', 'contracts', 'maintenance'],
  agent: ['overview', 'listings', 'inquiries', 'applications'],
  owner: ['overview', 'portfolio', 'approvals', 'maintenance'],
  tenant: ['overview', 'payments', 'lease', 'maintenance'],
};

export const MOBILE_TAB_LABELS = {
  admin: { contracts: 'Leases' },
  manager: { contracts: 'Leases' },
  agent: { listings: 'Listings' },
  owner: { portfolio: 'Portfolio', approvals: 'Approvals' },
  tenant: { payments: 'Payments', lease: 'Lease' },
};

export const MOBILE_SEARCH_SECTIONS = {
  admin: 'properties',
  manager: 'properties',
  agent: 'listings',
};

export const MOBILE_MORE_GROUPS = {
  admin: [['Manage', 'users', 'billing'], ['Insights', 'reports', 'activity'], ['Settings', 'settings']],
  manager: [['Leasing', 'inquiries', 'applications', 'pricing'], ['Insights', 'reports', 'billing']],
  owner: [['Leasing', 'contracts', 'pricing'], ['Records', 'history', 'billing']],
};

export function isWorkspaceSection(role, section) {
  return Boolean(WORKSPACE_NAVIGATION[role]?.some(([key]) => key === section));
}

export function workspaceSectionTitle(role, section) {
  return WORKSPACE_NAVIGATION[role]?.find(([key]) => key === section)?.[1] || 'Overview';
}
