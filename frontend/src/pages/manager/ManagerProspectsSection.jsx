import { Button, Form } from 'react-bootstrap';
import Table from '../../components/ResponsiveTable.jsx';
import CollectionPagination from '../../components/CollectionPagination';

const STATUS_CLASS = {
  available: 'pm-pill-available',
  rented: 'pm-pill-occupied',
  occupied: 'pm-pill-occupied',
  'under maintenance': 'pm-pill-maintenance',
  pending: 'pm-pill-occupied',
  active: 'pm-pill-active',
  terminated: 'pm-pill-terminated',
  submitted: 'pm-pill-pending',
  'under review': 'pm-pill-active',
  'pending owner approval': 'pm-pill-pending',
  approved: 'pm-pill-available',
  rejected: 'pm-pill-terminated',
  cancelled: 'pm-pill-terminated',
  converted: 'pm-pill-occupied',
};

function StatusPill({ status }) {
  if (!status) return null;
  return <span className={`pm-pill ${STATUS_CLASS[status.toLowerCase()] || 'pm-pill-default'}`}><span className="pm-pill-dot" />{status}</span>;
}

export default function ManagerProspectsSection({
  inquiries,
  applications,
  properties,
  contracts,
  inquiryPageInfo,
  applicationPageInfo,
  onInquiryPageChange,
  onApplicationPageChange,
  onInquiryStatusChange,
  onOpenLeaseForApplication,
  onApplicationReview,
  managerReviewNotes,
  onReviewNotesChange,
}) {
  return (
    <>
      <div className="pm-panel mb-4" id="inquiries" data-workspace-section="inquiries">
        <div className="pm-panel-header">Agent inquiries and applications ({inquiryPageInfo.count ?? inquiries.length})</div>
        <Table responsive className="pm-table mb-0">
          <thead><tr><th>Prospect</th><th>Property</th><th>Viewing</th><th>Agent</th><th>Progress</th></tr></thead>
          <tbody>
            {inquiries.map((inquiry) => (
              <tr key={inquiry.id}>
                <td>{inquiry.prospect_name}<div className="text-muted small">{inquiry.prospect_email}</div></td>
                <td>{properties.find((property) => Number(property._id || property.id) === Number(inquiry.property))?.title || inquiry.property}</td>
                <td>{inquiry.viewing_at ? new Date(inquiry.viewing_at).toLocaleString() : '—'}</td>
                <td>{inquiry.agentDetails?.name || '—'}</td>
                <td><Form.Select size="sm" value={inquiry.status} onChange={(event) => onInquiryStatusChange(inquiry, event.target.value)}>{['New', 'Viewing Scheduled', 'Application In Progress', 'Converted', 'Closed'].map((status) => <option key={status}>{status}</option>)}</Form.Select></td>
              </tr>
            ))}
            {inquiries.length === 0 && <tr><td colSpan="5" className="pm-empty-row">No agent inquiries for your managed properties.</td></tr>}
          </tbody>
        </Table>
        <CollectionPagination count={inquiryPageInfo.count || 0} page={inquiryPageInfo.page || 1} pageCount={inquiryPageInfo.pageCount || 1} onPageChange={onInquiryPageChange} />
      </div>

      <div className="pm-panel mb-4" data-workspace-section="applications">
        <div className="pm-panel-header">Rental applications ({applicationPageInfo.count ?? applications.length})</div>
        <Table responsive className="pm-table mb-0">
          <thead><tr><th>Applicant</th><th>Property / unit</th><th>Employment</th><th>Income</th><th>Move-in</th><th>Status</th><th>Review</th></tr></thead>
          <tbody>
            {applications.map((application) => (
              <tr key={application.id}>
                <td>{application.applicantName}<div className="small text-muted">{application.applicantEmail}</div></td>
                <td>{application.propertyDetails?.title || 'Property'}{application.unitDetails?.unitNumber ? ` · ${application.unitDetails.unitNumber}` : ''}</td>
                <td>{application.employment || '—'}</td>
                <td>{application.monthlyIncome ? `₱${Number(application.monthlyIncome).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}</td>
                <td>{application.moveInDate || '—'}</td>
                <td>
                  <StatusPill status={application.status} />
                  {application.reviewNotes && <div className="small text-muted mt-1">Manager: {application.reviewNotes}</div>}
                  {application.ownerReviewNotes && <div className="small text-muted mt-1">Owner: {application.ownerReviewNotes}</div>}
                </td>
                <td>
                  {application.status === 'Approved' && contracts.some((contract) =>
                    String(contract.sourceApplication || '') === String(application.id)
                    && ['Pending', 'Active'].includes(contract.status)
                  ) ? (
                    <span className="small text-muted">
                      {contracts.some((contract) => String(contract.sourceApplication || '') === String(application.id) && contract.status === 'Active')
                        ? 'Lease active'
                        : 'Lease prepared · awaiting activation'}
                    </span>
                  ) : application.status === 'Approved' ? (
                    <div className="d-flex flex-wrap gap-1">
                      <Button size="sm" variant="primary" onClick={() => onOpenLeaseForApplication(application)}>Create lease</Button>
                      <Button size="sm" variant="outline-danger" onClick={() => onApplicationReview(application, 'Rejected')}>Reject and release</Button>
                    </div>
                  ) : application.applicationApprovalMode === 'Owner' && application.status === 'Pending Owner Approval' ? (
                    <span className="small text-muted">Awaiting owner decision</span>
                  ) : application.applicationApprovalMode === 'Owner' && application.status === 'Submitted' ? (
                    <Button size="sm" variant="outline-secondary" onClick={() => onApplicationReview(application, 'Under Review')}>Begin review</Button>
                  ) : application.applicationApprovalMode === 'Owner' && application.status === 'Under Review' ? (
                    <div style={{ minWidth: 210 }}>
                      <Form.Control
                        as="textarea"
                        rows={2}
                        className="mb-2"
                        aria-label={`Manager review notes for ${application.applicantName || 'applicant'}`}
                        placeholder="Add review notes for the owner (optional)"
                        value={managerReviewNotes[application.id] || ''}
                        onChange={(event) => onReviewNotesChange(application.id, event.target.value)}
                      />
                      <Button size="sm" variant="primary" onClick={() => onApplicationReview(application, 'Pending Owner Approval')}>Send to owner</Button>
                    </div>
                  ) : ['Submitted', 'Under Review'].includes(application.status) ? (
                    <div className="d-flex flex-wrap gap-1">
                      {application.status === 'Submitted' && <Button size="sm" variant="outline-secondary" onClick={() => onApplicationReview(application, 'Under Review')}>Review</Button>}
                      <Button size="sm" variant="outline-success" onClick={() => onApplicationReview(application, 'Approved')}>Approve</Button>
                      <Button size="sm" variant="outline-danger" onClick={() => onApplicationReview(application, 'Rejected')}>Reject</Button>
                    </div>
                  ) : '—'}
                </td>
              </tr>
            ))}
            {applications.length === 0 && <tr><td colSpan="7" className="pm-empty-row">No applications are linked to your managed properties yet. Agent-submitted applications appear here when the property is assigned to your account.</td></tr>}
          </tbody>
        </Table>
        <CollectionPagination count={applicationPageInfo.count || 0} page={applicationPageInfo.page || 1} pageCount={applicationPageInfo.pageCount || 1} onPageChange={onApplicationPageChange} />
      </div>
    </>
  );
}
