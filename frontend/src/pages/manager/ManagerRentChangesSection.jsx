import Table from '../../components/ResponsiveTable.jsx';
import CollectionPagination from '../../components/CollectionPagination';

const STATUS_CLASS = {
  pending: 'pm-pill-pending',
  approved: 'pm-pill-available',
  rejected: 'pm-pill-terminated',
  cancelled: 'pm-pill-default',
};

function StatusPill({ status }) {
  if (!status) return null;
  return <span className={`pm-pill ${STATUS_CLASS[status.toLowerCase()] || 'pm-pill-default'}`}><span className="pm-pill-dot" />{status}</span>;
}

function getEffectiveDateLabel(request) {
  if (request.status === 'Pending') return 'After Owner approval';
  if (request.status !== 'Approved') return '—';
  if (!request.decidedAt) return 'On approval';

  const effectiveAt = new Date(request.decidedAt);
  return Number.isNaN(effectiveAt.getTime())
    ? 'On approval'
    : effectiveAt.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function ManagerRentChangesSection({ requests, pageInfo, onPageChange }) {
  return (
    <>
      <div className="pm-panel-header">Rent change proposals ({pageInfo.count})</div>
      <div className="p-3 text-muted small">The current rent remains active while a proposal is pending. An Owner must approve a proposal before it changes the advertised rate or rate used for a new lease.</div>
      <Table responsive className="pm-table mb-0">
        <thead><tr><th>Property / unit</th><th>Current</th><th>Proposed</th><th>Reason</th><th>Status</th><th>Effective date</th><th>Owner note</th></tr></thead>
        <tbody>
          {requests.length ? requests.map((request) => (
            <tr key={request.id}>
              <td className="pm-cell-title">{request.propertyTitle}<div className="text-muted small">{request.targetLabel}</div><div className="text-muted small">Sent {new Date(request.createdAt).toLocaleDateString()}</div></td>
              <td>₱{Number(request.currentRate).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/mo</td>
              <td className="pm-cell-strong">₱{Number(request.proposedRate).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/mo</td>
              <td>{request.reason}</td>
              <td><StatusPill status={request.status} /></td>
              <td>{getEffectiveDateLabel(request)}</td>
              <td>{request.decisionNote || (request.status === 'Pending' ? 'Awaiting Owner review' : '—')}</td>
            </tr>
          )) : <tr><td colSpan="7" className="pm-empty-row">No rent proposals yet. Open a property or unit to request a rate change.</td></tr>}
        </tbody>
      </Table>
      <CollectionPagination count={pageInfo.count} page={pageInfo.page} pageCount={pageInfo.pageCount} onPageChange={onPageChange} />
    </>
  );
}
