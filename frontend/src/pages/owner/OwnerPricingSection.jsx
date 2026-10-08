import { Button } from 'react-bootstrap';
import Table from '../../components/ResponsiveTable.jsx';
import OwnerStatusPill from './OwnerStatusPill.jsx';
import { getRentChangeEffectiveDate } from './ownerDashboardPresentation.js';

export default function OwnerPricingSection({ requests, onDecision }) {
  return (
    <section data-workspace-section="pricing" aria-label="Rent change approvals">
      <p className="text-muted mb-3">Review each property or unit rent proposal. Approving a unit proposal updates that unit only; its effective date is the approval date. Existing leases keep the rent stated in their signed contract.</p>
      <Table responsive className="pm-table mb-0">
        <thead>
          <tr>
            <th>Property / unit</th>
            <th>Current rent</th>
            <th>Proposed rent</th>
            <th>Reason</th>
            <th>Status</th>
            <th>Effective date</th>
            <th>Decision</th>
          </tr>
        </thead>
        <tbody>
          {requests.length > 0 ? requests.map((changeRequest) => (
            <tr key={changeRequest.id}>
              <td className="pm-cell-title">
                {changeRequest.propertyTitle}
                <div className="small text-muted">{changeRequest.targetLabel}</div>
                <div className="small text-muted">Submitted by {changeRequest.proposedByName} · {new Date(changeRequest.createdAt).toLocaleDateString()}</div>
              </td>
              <td>₱{Number(changeRequest.currentRate).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / mo</td>
              <td className="pm-cell-strong">₱{Number(changeRequest.proposedRate).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / mo</td>
              <td>{changeRequest.reason}</td>
              <td><OwnerStatusPill status={changeRequest.status} /></td>
              <td>{getRentChangeEffectiveDate(changeRequest)}</td>
              <td>
                {changeRequest.status === 'Pending' ? (
                  <div className="d-flex flex-wrap gap-2">
                    <Button size="sm" variant="primary" onClick={() => onDecision(changeRequest, 'Approved')}>Approve</Button>
                    <Button size="sm" variant="outline-danger" onClick={() => onDecision(changeRequest, 'Rejected')}>Decline</Button>
                  </div>
                ) : (
                  <span className="small text-muted">{changeRequest.decidedByName ? `Decided by ${changeRequest.decidedByName}` : 'Decision recorded'}{changeRequest.decisionNote ? <div>{changeRequest.decisionNote}</div> : null}</span>
                )}
              </td>
            </tr>
          )) : (
            <tr><td colSpan="7" className="pm-empty-row">No rent-change proposals yet.</td></tr>
          )}
        </tbody>
      </Table>
    </section>
  );
}
