import { Badge } from 'react-bootstrap';

export const renderStatusBadge = (status) => {
  const normalized = status?.toLowerCase() || '';
  let variant = 'secondary';

  if (['active', 'occupied', 'paid', 'resolved'].includes(normalized)) {
    variant = 'success';
  } else if (['pending', 'in progress', 'open', 'available'].includes(normalized)) {
    variant = 'warning';
  } else if (['expired', 'closed', 'overdue', 'cancelled'].includes(normalized)) {
    variant = 'danger';
  }

  return <Badge bg={variant}>{status}</Badge>;
};