export function getOwnerPropertyMetrics(property, contracts) {
  const propertyId = property._id || property.id;
  const totalUnits = property.units?.length || 1;
  const occupiedCount = property.units
    ? property.units.filter((unit) => unit.status === 'Occupied').length
    : ['occupied', 'rented'].includes(property.status?.toLowerCase()) ? 1 : 0;

  let yieldAmt = property.units
    ? property.units
        .filter((unit) => unit.status === 'Occupied')
        .reduce((sum, unit) => sum + Number(unit.monthlyRate || 0), 0)
    : ['occupied', 'rented'].includes(property.status?.toLowerCase())
      ? Number(property.price || property.monthlyRate || 0)
      : 0;

  if (yieldAmt === 0 && contracts.length > 0) {
    const activePropertyContract = contracts.find((contract) => (
      (contract.property?._id || contract.property?.id || contract.property) === propertyId
      && contract.status?.toLowerCase() === 'active'
    ));
    if (activePropertyContract) yieldAmt = Number(activePropertyContract.rentAmount || 0);
  }

  return { totalUnits, occupiedCount, yieldAmt };
}

export function getRentChangeEffectiveDate(changeRequest) {
  if (changeRequest.status === 'Pending') return 'After Owner approval';
  if (changeRequest.status !== 'Approved') return '—';
  if (!changeRequest.decidedAt) return 'On approval';

  const effectiveAt = new Date(changeRequest.decidedAt);
  return Number.isNaN(effectiveAt.getTime())
    ? 'On approval'
    : effectiveAt.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
}

export function getOwnerRentalProgress(application, contract) {
  if (contract?.status === 'Active') {
    return {
      label: 'Lease active',
      detail: 'The lease has been activated and the unit is occupied.',
      tone: 'active',
    };
  }
  if (contract?.status === 'Pending') {
    return {
      label: 'Lease awaiting signatures',
      detail: 'After everyone signs, the Owner or an authorized manager records the signed copy and activates the lease.',
      tone: 'pending',
    };
  }
  if (contract?.status === 'Terminated') {
    return {
      label: 'Lease ended',
      detail: 'This lease is no longer active.',
      tone: 'closed',
    };
  }
  if (contract?.status === 'Expired') {
    return {
      label: 'Lease expired',
      detail: 'The lease term has ended.',
      tone: 'closed',
    };
  }
  if (application.status === 'Converted') {
    return {
      label: 'Lease active',
      detail: 'A lease has been activated for this application.',
      tone: 'active',
    };
  }
  if (application.status === 'Rejected') {
    return {
      label: 'Application declined',
      detail: 'No lease will be prepared from this application.',
      tone: 'closed',
    };
  }
  if (application.status === 'Pending Owner Approval') {
    return {
      label: 'Owner decision needed',
      detail: 'Review the manager’s notes, then approve or decline the application.',
      tone: 'action',
    };
  }
  if (application.status === 'Approved') {
    return {
      label: 'Lease preparation',
      detail: 'The Property Manager prepares the lease once a matching Tenant account is available.',
      tone: 'pending',
    };
  }
  return {
    label: 'Property Manager review',
    detail: application.status === 'Under Review'
      ? 'The Property Manager is reviewing this application.'
      : 'The Property Manager reviews the application first.',
    tone: 'review',
  };
}

export function mapOwnerHistory(events) {
  return events.map((event) => {
    const action = String(event.action || '').toUpperCase();
    if (action.includes('APPLICATION APPROVAL RULE')) {
      return { ...event, category: 'approval', categoryLabel: 'Application approval', title: 'Application review responsibility changed' };
    }
    if (action.includes('RENT CHANGE')) {
      return {
        ...event,
        category: 'pricing',
        categoryLabel: 'Rent changes',
        title: action.startsWith('PROPOSE')
          ? 'Manager proposed a rent change'
          : action.startsWith('APPROVED')
            ? 'Rent change approved'
            : action.startsWith('CANCEL') ? 'Rent proposal closed because the rate changed' : 'Rent change declined',
      };
    }
    if (action.includes('LEASE SIGNING AUTHORITY')) {
      return {
        ...event,
        category: 'authority',
        categoryLabel: 'Manager permissions',
        title: action.startsWith('GRANT') ? 'Lease signing permission granted' : 'Lease signing permission removed',
      };
    }
    if (action.includes('LEASE TERMINATION AUTHORITY')) {
      return {
        ...event,
        category: 'authority',
        categoryLabel: 'Manager permissions',
        title: action.startsWith('GRANT') ? 'Lease ending permission granted' : 'Lease ending permission removed',
      };
    }
    if (action.includes('RENT PRICING AUTHORITY')) {
      return {
        ...event,
        category: 'authority',
        categoryLabel: 'Manager permissions',
        title: action.startsWith('GRANT') ? 'Rent-setting permission granted' : 'Rent-setting permission removed',
      };
    }
    if (action === 'ACTIVATE') {
      return { ...event, category: 'lease', categoryLabel: 'Lease activity', title: 'Lease activated' };
    }
    if (action === 'TERMINATE') {
      return { ...event, category: 'lease', categoryLabel: 'Lease activity', title: 'Lease ended' };
    }
    return { ...event, category: 'lease', categoryLabel: 'Lease activity', title: event.action || 'Portfolio record updated' };
  }).sort((first, second) => new Date(second.createdAt || 0) - new Date(first.createdAt || 0));
}
