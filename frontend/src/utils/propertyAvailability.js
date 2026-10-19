const UNIT_STATUS_KEYS = {
  Available: 'available',
  Reserved: 'reserved',
  Occupied: 'occupied',
  Maintenance: 'maintenance',
};

const PROPERTY_STATUS_TO_UNIT = {
  Available: 'Available',
  Occupied: 'Occupied',
  Pending: 'Reserved',
  'Under Maintenance': 'Maintenance',
};

export function getPropertyUnitSummary(property = {}) {
  const units = Array.isArray(property.units) ? property.units : [];
  const hasUnitInventory = units.length > 0 || ['Apartment', 'Condo'].includes(property.propertyType);
  const statuses = hasUnitInventory ? units.map((unit) => unit.status) : [PROPERTY_STATUS_TO_UNIT[property.status] || 'Available'];
  const counts = { total: statuses.length, available: 0, reserved: 0, occupied: 0, maintenance: 0 };

  statuses.forEach((status) => {
    const key = UNIT_STATUS_KEYS[status];
    if (key) counts[key] += 1;
  });

  return {
    ...counts,
    availabilityLabel: counts.available > 0 ? 'Available' : 'No available units',
  };
}

export function getPortfolioUnitSummary(properties = []) {
  return properties.reduce((totals, property) => {
    const summary = getPropertyUnitSummary(property);
    Object.keys(totals).forEach((key) => { totals[key] += summary[key]; });
    return totals;
  }, { total: 0, available: 0, reserved: 0, occupied: 0, maintenance: 0 });
}

export function propertyMatchesStatus(property, status) {
  if (!status) return true;
  const summary = getPropertyUnitSummary(property);
  const statusKey = UNIT_STATUS_KEYS[status] || ({ Pending: 'reserved', 'Under Maintenance': 'maintenance' }[status]);
  return statusKey ? summary[statusKey] > 0 : false;
}
