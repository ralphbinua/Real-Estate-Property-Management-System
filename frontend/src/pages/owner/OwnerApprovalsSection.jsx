import { Button, Form } from 'react-bootstrap';
import Table from '../../components/ResponsiveTable.jsx';
import OwnerStatusPill from './OwnerStatusPill.jsx';
import { getOwnerRentalProgress } from './ownerDashboardPresentation.js';

export default function OwnerApprovalsSection({
  applications,
  contracts,
  reviewNotes,
  savingApplicationId,
  onReviewNoteChange,
  onDecision,
}) {
  return (
    <div>
      <Table responsive className="pm-table mb-0">
        <thead>
          <tr>
            <th>Applicant</th>
            <th>Property / unit</th>
            <th>Employment</th>
            <th>Monthly income</th>
            <th>Requested move-in</th>
            <th>Manager review</th>
            <th>Application &amp; lease progress</th>
            <th>Decision</th>
          </tr>
        </thead>
        <tbody>
          {applications.map((application) => {
            const relatedContracts = contracts.filter(
              (contract) => String(contract.sourceApplication || '') === String(application.id),
            );
            const relatedContract = relatedContracts.find((contract) => contract.status === 'Active')
              || relatedContracts.find((contract) => contract.status === 'Pending')
              || relatedContracts[0];
            const rentalProgress = getOwnerRentalProgress(application, relatedContract);

            return (
              <tr key={application.id}>
                <td>{application.applicantName || 'Applicant'}<div className="small text-muted">{application.applicantEmail}</div></td>
                <td>{application.propertyDetails?.title || 'Property'}{application.unitDetails?.unitNumber ? ` · Unit ${application.unitDetails.unitNumber}` : ''}</td>
                <td>{application.employment || '—'}</td>
                <td>{application.monthlyIncome != null ? `₱${Number(application.monthlyIncome).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}</td>
                <td>{application.moveInDate || '—'}</td>
                <td>{application.reviewNotes || 'No manager notes'}</td>
                <td>
                  <OwnerStatusPill status={application.status} />
                  <div className={`pm-owner-progress is-${rentalProgress.tone}`}>
                    <strong>{rentalProgress.label}</strong>
                    <span>{rentalProgress.detail}</span>
                  </div>
                  {application.decisionHistory?.length > 0 && (
                    <details className="small mt-2">
                      <summary>Decision history</summary>
                      {application.decisionHistory.map((decision, index) => (
                        <div key={`${application.id}-decision-${index}`} className="border-top mt-1 pt-1">
                          {decision.fromStatus || 'New'} → {decision.toStatus} · {decision.actor} · {new Date(decision.createdAt).toLocaleDateString()}
                          {decision.note && <div>{decision.note}</div>}
                          {decision.instructionReference && <div>Instruction: {decision.instructionReference}</div>}
                        </div>
                      ))}
                    </details>
                  )}
                </td>
                <td style={{ minWidth: 240 }}>
                  {application.status === 'Pending Owner Approval' ? (
                    <>
                      <Form.Control
                        as="textarea"
                        rows={2}
                        className="mb-2"
                        aria-label={`Decision notes for ${application.applicantName || 'applicant'}`}
                        placeholder="Optional decision notes"
                        value={reviewNotes[application.id] || ''}
                        onChange={(event) => onReviewNoteChange(application.id, event.target.value)}
                      />
                      <div className="d-flex flex-wrap gap-2">
                        <Button size="sm" variant="success" disabled={savingApplicationId === application.id} onClick={() => onDecision(application, 'Approved')}>Approve</Button>
                        <Button size="sm" variant="outline-danger" disabled={savingApplicationId === application.id} onClick={() => onDecision(application, 'Rejected')}>{savingApplicationId === application.id ? 'Saving…' : 'Decline'}</Button>
                      </div>
                    </>
                  ) : <span className="small text-muted">Decision is read-only</span>}
                </td>
              </tr>
            );
          })}
          {applications.length === 0 && (
            <tr><td colSpan="8" className="pm-empty-row">No applications are recorded for your properties.</td></tr>
          )}
        </tbody>
      </Table>
    </div>
  );
}
