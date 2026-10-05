const DESTINATIONS = Object.freeze({
  'admin.overview': ['/admin', 'overview'],
  'admin.users': ['/admin', 'users'],
  'owner.overview': ['/owner', 'overview'],
  'owner.approvals': ['/owner', 'approvals'],
  'owner.pricing': ['/owner', 'pricing'],
  'owner.maintenance': ['/owner', 'maintenance'],
  'owner.billing': ['/owner', 'billing'],
  'owner.contracts': ['/owner', 'contracts'],
  'manager.overview': ['/manager', 'overview'],
  'manager.properties': ['/manager', 'properties'],
  'manager.inquiries': ['/manager', 'inquiries'],
  'manager.applications': ['/manager', 'applications'],
  'manager.pricing': ['/manager', 'pricing'],
  'manager.maintenance': ['/manager', 'maintenance'],
  'manager.billing': ['/manager', 'billing'],
  'manager.contracts': ['/manager', 'contracts'],
  'agent.overview': ['/agent', 'overview'],
  'agent.listings': ['/agent', 'listings'],
  'agent.inquiries': ['/agent', 'inquiries'],
  'agent.applications': ['/agent', 'applications'],
  'tenant.overview': ['/tenant', 'overview'],
  'tenant.payments': ['/tenant', 'payments'],
  'tenant.lease': ['/tenant', 'lease'],
  'tenant.maintenance': ['/tenant', 'maintenance'],
});

export function resolveNotificationDestination(destination) {
  const target = DESTINATIONS[destination];
  if (!target) return null;
  const [path, section] = target;
  return `${path}?section=${encodeURIComponent(section)}`;
}
