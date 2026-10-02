import { useState, useEffect, useMemo } from 'react';
import { Container, Table, Spinner, Badge, Tab, Tabs, Button, Form, Modal, Row, Col } from 'react-bootstrap';
import { useAuth } from '../context/AuthContext';
import { fetchOwnerPortfolio } from '../services/ownerService';
import { fetchPayments } from '../services/invoiceService';
import { fetchApplications, reviewApplication } from '../services/applicationService';
import { createProperty, setLeaseSigningAuthority, setLeaseTerminationAuthority, setApplicationApprovalPolicy } from '../services/propertyService';
import { activateContract } from '../services/contractService';
import './OwnerDashboard.css';

const PILL_CLASS = {
  available: 'pm-pill-available',
  rented: 'pm-pill-occupied',
  occupied: 'pm-pill-occupied',
  'under maintenance': 'pm-pill-maintenance',
  active: 'pm-pill-active',
  terminated: 'pm-pill-terminated',
  pending: 'pm-pill-pending',
};

function StatusPill({ status }) {
  if (!status) return null;
  const cls = PILL_CLASS[status.toLowerCase()] || 'pm-pill-default';
  return (
    <span className={`pm-pill ${cls}`}>
      <span className="pm-pill-dot" />
      {status}
    </span>
  );
}

export default function OwnerDashboard() {
  const { user } = useAuth();
  const [activeSection, setActiveSection] = useState('overview');
  const [portfolio, setPortfolio] = useState({ properties: [], contracts: [], maintenanceRequests: [], invoices: [], payments: [], leaseSigningHistory: [] });
  const [ownerApprovals, setOwnerApprovals] = useState([]);
  const [ownerReviewNotes, setOwnerReviewNotes] = useState({});
  const [savingOwnerDecisionId, setSavingOwnerDecisionId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activePortfolioTab, setActivePortfolioTab] = useState('properties');
  const [showPropertyModal, setShowPropertyModal] = useState(false);
  const [savingProperty, setSavingProperty] = useState(false);
  const [showLeaseAuthorityModal, setShowLeaseAuthorityModal] = useState(false);
  const [leaseAuthorityProperty, setLeaseAuthorityProperty] = useState(null);
  const [leaseAuthorityReference, setLeaseAuthorityReference] = useState('');
  const [confirmWrittenAuthority, setConfirmWrittenAuthority] = useState(false);
  const [savingLeaseAuthority, setSavingLeaseAuthority] = useState(false);
  const [activatingContractId, setActivatingContractId] = useState(null);
  const [approvalModeDrafts, setApprovalModeDrafts] = useState({});
  const [savingApprovalPropertyId, setSavingApprovalPropertyId] = useState(null);
  const [leaseAuthorityKind, setLeaseAuthorityKind] = useState('signing');
  const [contractForActivation, setContractForActivation] = useState(null);
  const [signedCopyReference, setSignedCopyReference] = useState('');
  const [manualActivationReason, setManualActivationReason] = useState('');
  const [manualActivationReference, setManualActivationReference] = useState('');
  const [contractForTermination, setContractForTermination] = useState(null);
  const [terminationReason, setTerminationReason] = useState('');
  const [terminationEffectiveDate, setTerminationEffectiveDate] = useState('');
  const [savingTermination, setSavingTermination] = useState(false);
  const [propertyDraft, setPropertyDraft] = useState({
    title: '',
    address: '',
    propertyType: 'Apartment',
    price: '',
    applicationApprovalMode: 'Owner',
    units: [{ unitNumber: '101', monthlyRate: '' }],
  });

  const loadOwnerData = async () => {
    setLoading(true);
    try {
      const [portfolioResult, approvalsResult, paymentResult] = await Promise.allSettled([
        fetchOwnerPortfolio(),
        fetchApplications(),
        fetchPayments(),
      ]);
      if (portfolioResult.status === 'rejected') throw portfolioResult.reason;
      const data = portfolioResult.value;
      setPortfolio({
        properties: Array.isArray(data.properties) ? data.properties : [],
        contracts: Array.isArray(data.contracts) ? data.contracts : [],
        maintenanceRequests: Array.isArray(data.maintenanceRequests) ? data.maintenanceRequests : [],
        invoices: Array.isArray(data.invoices) ? data.invoices : [],
        payments: paymentResult.status === 'fulfilled'
          ? (Array.isArray(paymentResult.value) ? paymentResult.value : paymentResult.value.results || [])
          : [],
        leaseSigningHistory: Array.isArray(data.leaseSigningHistory) ? data.leaseSigningHistory : [],
      });
      const warnings = [];
      if (approvalsResult.status === 'fulfilled') {
        setOwnerApprovals(Array.isArray(approvalsResult.value) ? approvalsResult.value : []);
      } else {
        setOwnerApprovals([]);
        warnings.push('Application approvals could not be loaded.');
      }
      if (paymentResult.status === 'rejected') warnings.push('Payment history could not be loaded.');
      setError(warnings.length ? warnings.join(' ') : '');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch portfolio data.');
    } finally {
      setLoading(false);
    }
  };

  const handleOwnerDecision = async (application, status) => {
    setError('');
    setSuccess('');
    setSavingOwnerDecisionId(application.id);
    try {
      await reviewApplication(application.id, {
        status,
        ownerReviewNotes: ownerReviewNotes[application.id]?.trim() || '',
      });
      setOwnerReviewNotes((current) => {
        const next = { ...current };
        delete next[application.id];
        return next;
      });
      setSuccess(status === 'Approved'
        ? 'Application approved. The selected unit is reserved while the lease is prepared.'
        : 'Application declined. The prospect inquiry has been closed.');
      await loadOwnerData();
    } catch (err) {
      const responseData = err.response?.data;
      setError(responseData?.status?.[0] || responseData?.detail || `Unable to ${status.toLowerCase()} this application.`);
    } finally {
      setSavingOwnerDecisionId(null);
    }
  };

  const handlePropertyCreate = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    setSavingProperty(true);

    const hasUnits = ['Apartment', 'Condo'].includes(propertyDraft.propertyType);
    const units = hasUnits
      ? propertyDraft.units.map((unit) => ({
          unitNumber: unit.unitNumber.trim(),
          monthlyRate: Number(unit.monthlyRate),
          status: 'Available',
        }))
      : [];

    try {
      await createProperty({
        title: propertyDraft.title.trim(),
        address: propertyDraft.address.trim(),
        propertyType: propertyDraft.propertyType,
        applicationApprovalMode: propertyDraft.applicationApprovalMode,
        price: Number(propertyDraft.price || (hasUnits ? propertyDraft.units[0]?.monthlyRate : 0) || 0),
        units,
      });
      setPropertyDraft({ title: '', address: '', propertyType: 'Apartment', price: '', applicationApprovalMode: 'Owner', units: [{ unitNumber: '101', monthlyRate: '' }] });
      setShowPropertyModal(false);
      setSuccess('Property added to your portfolio. An Admin can assign a Property Manager.');
      await loadOwnerData();
    } catch (err) {
      const details = err.response?.data;
      setError(details?.detail || details?.title?.[0] || details?.address?.[0] || 'Unable to register this property. Please review the details and try again.');
    } finally {
      setSavingProperty(false);
    }
  };

  const handleLeaseAuthorityClick = async (property, authorityKind = 'signing') => {
    const propertyId = property._id || property.id;
    const isAuthorized = authorityKind === 'signing'
      ? property.managerLeaseSigningAuthorized
      : property.managerLeaseTerminationAuthorized;
    const saveAuthority = authorityKind === 'signing' ? setLeaseSigningAuthority : setLeaseTerminationAuthority;
    if (isAuthorized) {
      if (!window.confirm(`Revoke ${authorityKind === 'signing' ? 'lease signing' : 'lease termination'} authority for ${property.managerDetails?.name || 'the assigned manager'} at ${property.title}?`)) return;
      setError('');
      setSuccess('');
      try {
        await saveAuthority(propertyId, { authorized: false });
        setSuccess(`Lease ${authorityKind === 'signing' ? 'signing' : 'termination'} authority revoked for ${property.title}.`);
        await loadOwnerData();
      } catch (err) {
        setError(err.response?.data?.detail || 'Unable to revoke manager authority.');
      }
      return;
    }
    setLeaseAuthorityProperty(property);
    setLeaseAuthorityKind(authorityKind);
    setLeaseAuthorityReference('');
    setConfirmWrittenAuthority(false);
    setShowLeaseAuthorityModal(true);
  };

  const handleGrantLeaseAuthority = async (event) => {
    event.preventDefault();
    if (!leaseAuthorityProperty) return;
    setError('');
    setSuccess('');
    setSavingLeaseAuthority(true);
    try {
      const saveAuthority = leaseAuthorityKind === 'signing' ? setLeaseSigningAuthority : setLeaseTerminationAuthority;
      await saveAuthority(leaseAuthorityProperty._id || leaseAuthorityProperty.id, {
        authorized: true,
        agreementReference: leaseAuthorityReference.trim(),
        confirmWrittenAuthority,
      });
      setShowLeaseAuthorityModal(false);
      setSuccess(`Lease ${leaseAuthorityKind === 'signing' ? 'signing' : 'termination'} authority recorded for ${leaseAuthorityProperty.title}.`);
      await loadOwnerData();
    } catch (err) {
      const details = err.response?.data;
      setError(details?.agreementReference?.[0] || details?.confirmWrittenAuthority?.[0] || details?.detail || 'Unable to grant manager authority.');
    } finally {
      setSavingLeaseAuthority(false);
    }
  };

  const handleActivateLease = async (contract) => {
    const contractId = contract._id || contract.id;
    setContractForActivation(contract);
    setSignedCopyReference('');
    setManualActivationReason('');
    setManualActivationReference('');
  };

  const handleActivationSubmit = async (event) => {
    event.preventDefault();
    if (!contractForActivation) return;
    if (!signedCopyReference.trim()) {
      setError('Enter the name or location of the signed lease copy before activating.');
      return;
    }
    if (!contractForActivation.sourceApplication && !manualActivationReason.trim() && !manualActivationReference.trim()) {
      setError('Enter a reason or an existing lease-record reference for this manual lease.');
      return;
    }
    const contractId = contractForActivation._id || contractForActivation.id;
    setError('');
    setSuccess('');
    setActivatingContractId(contractId);
    try {
      await activateContract(contractId, {
        signaturesComplete: true,
        signedCopyReference: signedCopyReference.trim(),
        manualLeaseReason: manualActivationReason.trim(),
        manualLeaseReference: manualActivationReference.trim(),
      });
      setContractForActivation(null);
      setSuccess('Lease activated and recorded in the signing history.');
      await loadOwnerData();
    } catch (err) {
      setError(err.response?.data?.detail || err.response?.data?.signedCopyReference?.[0] || err.response?.data?.manualLeaseReason?.[0] || err.response?.data?.status?.[0] || 'Unable to activate this lease.');
    } finally {
      setActivatingContractId(null);
    }
  };

  const handleApprovalPolicySave = async (property) => {
    const propertyId = property._id || property.id;
    const applicationApprovalMode = approvalModeDrafts[propertyId] || property.applicationApprovalMode || 'Owner';
    setError('');
    setSuccess('');
    setSavingApprovalPropertyId(propertyId);
    try {
      await setApplicationApprovalPolicy(propertyId, { applicationApprovalMode });
      setApprovalModeDrafts((current) => {
        const next = { ...current };
        delete next[propertyId];
        return next;
      });
      setSuccess(`Application approval rule updated for ${property.title}.`);
      await loadOwnerData();
    } catch (err) {
      setError(err.response?.data?.detail || err.response?.data?.applicationApprovalMode?.[0] || 'Unable to update the application approval rule.');
    } finally {
      setSavingApprovalPropertyId(null);
    }
  };

  const openTerminationForm = (contract) => {
    setContractForTermination(contract);
    setTerminationReason('');
    setTerminationEffectiveDate(new Date().toISOString().slice(0, 10));
  };

  const handleTerminationSubmit = async (event) => {
    event.preventDefault();
    if (!contractForTermination) return;
    setError('');
    setSuccess('');
    setSavingTermination(true);
    try {
      await terminateContract(contractForTermination._id || contractForTermination.id, {
        reason: terminationReason.trim(),
        effectiveDate: terminationEffectiveDate,
      });
      setContractForTermination(null);
      setSuccess('Lease ended. Its history remains in your portfolio.');
      await loadOwnerData();
    } catch (err) {
      setError(err.response?.data?.reason?.[0] || err.response?.data?.effectiveDate?.[0] || err.response?.data?.detail || 'Unable to end this lease.');
    } finally {
      setSavingTermination(false);
    }
  };

  useEffect(() => {
    loadOwnerData();
  }, []);

  useEffect(() => {
    const handleWorkspaceNavigation = (event) => {
      setActiveSection(event.detail);
      const tab = event.detail === 'billing' ? 'payments' : event.detail;
      if (event.detail === 'portfolio') setActivePortfolioTab('properties');
      if (['properties', 'approvals', 'contracts', 'maintenance', 'payments'].includes(tab)) setActivePortfolioTab(tab);
    };
    window.addEventListener('workspace:navigate', handleWorkspaceNavigation);
    return () => window.removeEventListener('workspace:navigate', handleWorkspaceNavigation);
  }, []);

  // Advanced Metrics Logic (Explicit Numeric Conversion)
  const metrics = useMemo(() => {
    const { properties, contracts } = portfolio;
    let totalUnits = 0;
    let occupiedUnits = 0;
    let totalMonthlyIncome = 0;

    properties.forEach((p) => {
      if (Array.isArray(p.units) && p.units.length > 0) {
        totalUnits += p.units.length;
        const occupied = p.units.filter((u) => u.status === 'Occupied');
        occupiedUnits += occupied.length;
        totalMonthlyIncome += occupied.reduce((sum, u) => sum + Number(u.monthlyRate || 0), 0);
      } else {
        totalUnits += 1;
        if (['occupied', 'rented'].includes(p.status?.toLowerCase())) {
          occupiedUnits += 1;
          totalMonthlyIncome += Number(p.price || p.monthlyRate || 0);
        }
      }
    });

    const activeContracts = contracts.filter((c) => c.status?.toLowerCase() === 'active');
    
    // Fallback: If no direct property income match but active contracts exist
    if (totalMonthlyIncome === 0 && activeContracts.length > 0) {
      totalMonthlyIncome = activeContracts.reduce((sum, c) => sum + Number(c.rentAmount || 0), 0);
    }

    const occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;
    const activeInvoices = portfolio.invoices.filter((invoice) => invoice.status !== 'Cancelled');
    const rentInvoiced = activeInvoices.reduce((sum, invoice) => sum + Number(invoice.totalDue || 0), 0);
    // Cancellation does not reverse payments already verified for an invoice.
    const rentCollected = portfolio.invoices.reduce((sum, invoice) => sum + Number(invoice.amountPaid || 0), 0);
    const outstandingBalance = activeInvoices.reduce((sum, invoice) => sum + Number(invoice.balanceDue || 0), 0);
    const paymentsAwaitingReview = portfolio.invoices.reduce(
      (sum, invoice) => sum + Number(invoice.pendingPaymentCount || 0),
      0,
    );

    return {
      totalOwned: properties.length,
      totalUnits,
      occupiedUnits,
      occupancyRate,
      totalMonthlyIncome,
      activeLeasesCount: activeContracts.length,
      rentInvoiced,
      rentCollected,
      outstandingBalance,
      paymentsAwaitingReview,
    };
  }, [portfolio]);

  return (
    <div className="pm-owner" data-active-section={activeSection}>
      <Container>
        {/* Header */}
        <div className="pm-header" id="overview">
          <div>
            <h1 className="pm-title">Owner Portfolio Overview</h1>
            <p className="pm-subtitle">
              Register properties you own and monitor occupancy, leases, maintenance, and rental income
            </p>
          </div>
          <div className="d-flex align-items-center gap-2">
            <Button variant="dark" onClick={() => setShowPropertyModal(true)}>Add property</Button>
            <Badge bg="dark" className="px-3 py-2 fs-6">Owner</Badge>
          </div>
        </div>

        {error && (
          <div className="pm-alert pm-alert-error" role="alert">
            <span>{error}</span>
            <button className="pm-alert-close" onClick={() => setError('')} aria-label="Dismiss">×</button>
          </div>
        )}
        {success && (
          <div className="pm-alert pm-alert-success" role="status">
            <span>{success}</span>
            <button className="pm-alert-close" onClick={() => setSuccess('')} aria-label="Dismiss">×</button>
          </div>
        )}

        {loading ? (
          <div className="pm-loading">
            <Spinner animation="border" size="sm" className="me-2" />
            Synchronizing portfolio records…
          </div>
        ) : (
          <>
            {/* Metrics Strip */}
            <div className="pm-metrics">
              <div className="pm-metric">
                <span className="pm-metric-label">Owned properties</span>
                <span className="pm-metric-value">{metrics.totalOwned}</span>
              </div>
              <div className="pm-metric">
                <span className="pm-metric-label">Occupancy rate</span>
                <span className="pm-metric-value">{metrics.occupancyRate}%</span>
                <span className="text-muted small mt-1">
                  ({metrics.occupiedUnits}/{metrics.totalUnits} Units)
                </span>
              </div>
              <div className="pm-metric">
                <span className="pm-metric-label">Est. monthly revenue</span>
                <span className="pm-metric-value">
                  ₱{Number(metrics.totalMonthlyIncome || 0).toLocaleString('en-PH', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
              <div className="pm-metric">
                <span className="pm-metric-label">Active leases</span>
                <span className="pm-metric-value">{metrics.activeLeasesCount}</span>
              </div>
            </div>

            {/* Tabbed Portfolio Views */}
            <div className="pm-panel mb-4" id="portfolio" data-workspace-section="portfolio approvals contracts maintenance billing">
              <div className="pm-panel-header">Portfolio Details</div>
              <div style={{ padding: '20px' }}>
                <Tabs activeKey={activePortfolioTab} onSelect={(key) => setActivePortfolioTab(key || 'properties')} id="owner-tabs" className="mb-3">
                  
                  {/* Tab 1: Owned Properties */}
                  <Tab eventKey="properties" title={`Assets (${portfolio.properties.length})`}>
                    <Table responsive className="pm-table mb-0">
                      <thead>
                        <tr>
                          <th>Property title</th>
                          <th>Address</th>
                          <th>Type</th>
                          <th>Occupancy</th>
                          <th>Monthly Yield</th>
                          <th>Application approval</th>
                          <th>Manager lease authority</th>
                        </tr>
                      </thead>
                      <tbody>
                        {portfolio.properties.length > 0 ? (
                          portfolio.properties.map((prop) => {
                            const propId = prop._id || prop.id;
                            const totalUnits = prop.units?.length || 1;
                            const occupiedCount = prop.units
                              ? prop.units.filter((u) => u.status === 'Occupied').length
                              : ['occupied', 'rented'].includes(prop.status?.toLowerCase()) ? 1 : 0;
                            
                            let yieldAmt = prop.units
                              ? prop.units
                                  .filter((u) => u.status === 'Occupied')
                                  .reduce((sum, u) => sum + Number(u.monthlyRate || 0), 0)
                              : ['occupied', 'rented'].includes(prop.status?.toLowerCase()) ? Number(prop.price || prop.monthlyRate || 0) : 0;

                            if (yieldAmt === 0 && portfolio.contracts.length > 0) {
                              const activePropContract = portfolio.contracts.find(
                                (c) => (c.property?._id || c.property?.id || c.property) === propId && c.status?.toLowerCase() === 'active'
                              );
                              if (activePropContract) yieldAmt = Number(activePropContract.rentAmount || 0);
                            }

                            return (
                              <tr key={propId}>
                                <td className="pm-cell-title">{prop.title}</td>
                                <td className="pm-cell-muted">{prop.address}</td>
                                <td>{prop.propertyType}</td>
                                <td>
                                  <StatusPill status={`${occupiedCount}/${totalUnits} Occupied`} />
                                </td>
                                <td className="pm-cell-strong text-success">
                                  ₱{Number(yieldAmt).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                                <td style={{ minWidth: 250 }}>
                                  <Form.Select
                                    size="sm"
                                    className="mb-2"
                                    aria-label={`Application approval rule for ${prop.title}`}
                                    value={approvalModeDrafts[propId] || prop.applicationApprovalMode || 'Owner'}
                                    onChange={(event) => setApprovalModeDrafts((current) => ({ ...current, [propId]: event.target.value }))}
                                  >
                                    <option value="Owner">Owner approves applications</option>
                                    <option value="Manager" disabled={!prop.managerDetails}>Manager decides (delegated)</option>
                                  </Form.Select>
                                  <Button
                                    size="sm"
                                    variant="outline-primary"
                                    disabled={savingApprovalPropertyId === propId || (approvalModeDrafts[propId] || prop.applicationApprovalMode || 'Owner') === prop.applicationApprovalMode}
                                    onClick={() => handleApprovalPolicySave(prop)}
                                  >
                                    {savingApprovalPropertyId === propId ? 'Saving…' : 'Save rule'}
                                  </Button>
                                  {prop.approvalPolicyHistory?.length > 0 && (
                                    <details className="small mt-2">
                                      <summary>Change history</summary>
                                      {prop.approvalPolicyHistory.map((change, index) => (
                                        <div key={`${propId}-approval-${index}`} className="border-top mt-1 pt-1">
                                          {change.previousMode} → {change.newMode} · {change.changedBy} · {new Date(change.changedAt).toLocaleDateString()}
                                          {change.instructionReference && <div>Instruction: {change.instructionReference}</div>}
                                        </div>
                                      ))}
                                    </details>
                                  )}
                                </td>
                                <td style={{ minWidth: 235 }}>
                                  {prop.managerDetails ? (
                                    <>
                                      <div className="small mb-1">{prop.managerDetails.name || prop.managerDetails.email}</div>
                                      <div className="mb-2">
                                        <StatusPill status={prop.managerLeaseSigningAuthorized ? 'Signing authorized' : 'Signing not authorized'} />
                                        <Button
                                          size="sm"
                                          className="ms-2"
                                          variant={prop.managerLeaseSigningAuthorized ? 'outline-danger' : 'outline-primary'}
                                          onClick={() => handleLeaseAuthorityClick(prop, 'signing')}
                                        >
                                          {prop.managerLeaseSigningAuthorized ? 'Revoke' : 'Grant'}
                                        </Button>
                                      </div>
                                      <div>
                                        <StatusPill status={prop.managerLeaseTerminationAuthorized ? 'Termination authorized' : 'Termination not authorized'} />
                                        <Button
                                          size="sm"
                                          className="ms-2"
                                          variant={prop.managerLeaseTerminationAuthorized ? 'outline-danger' : 'outline-primary'}
                                          onClick={() => handleLeaseAuthorityClick(prop, 'termination')}
                                        >
                                          {prop.managerLeaseTerminationAuthorized ? 'Revoke' : 'Grant'}
                                        </Button>
                                      </div>
                                      {prop.leaseSigningAgreementReference && <div className="small text-muted mt-1">Signing agreement: {prop.leaseSigningAgreementReference}</div>}
                                      {prop.leaseTerminationAgreementReference && <div className="small text-muted mt-1">Termination agreement: {prop.leaseTerminationAgreementReference}</div>}
                                    </>
                                  ) : (
                                    <span className="small text-muted">Assign a Property Manager first</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan="7" className="pm-empty-row">
                              No property assets linked to your owner account.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </Table>
                  </Tab>

                  <Tab eventKey="approvals" title={`Applications (${ownerApprovals.length})`}>
                    <Table responsive className="pm-table mb-0">
                      <thead>
                        <tr>
                          <th>Applicant</th>
                          <th>Property / unit</th>
                          <th>Employment</th>
                          <th>Monthly income</th>
                          <th>Requested move-in</th>
                          <th>Manager review</th>
                          <th>Status / history</th>
                          <th>Decision</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ownerApprovals.map((application) => (
                          <tr key={application.id}>
                            <td>{application.applicantName || 'Applicant'}<div className="small text-muted">{application.applicantEmail}</div></td>
                            <td>{application.propertyDetails?.title || 'Property'}{application.unitDetails?.unitNumber ? ` · Unit ${application.unitDetails.unitNumber}` : ''}</td>
                            <td>{application.employment || '—'}</td>
                            <td>{application.monthlyIncome != null ? `₱${Number(application.monthlyIncome).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}</td>
                            <td>{application.moveInDate || '—'}</td>
                            <td>{application.reviewNotes || 'No manager notes'}</td>
                            <td>
                              <StatusPill status={application.status} />
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
                                    value={ownerReviewNotes[application.id] || ''}
                                    onChange={(event) => setOwnerReviewNotes((current) => ({ ...current, [application.id]: event.target.value }))}
                                  />
                                  <div className="d-flex flex-wrap gap-2">
                                    <Button size="sm" variant="success" disabled={savingOwnerDecisionId === application.id} onClick={() => handleOwnerDecision(application, 'Approved')}>Approve</Button>
                                    <Button size="sm" variant="outline-danger" disabled={savingOwnerDecisionId === application.id} onClick={() => handleOwnerDecision(application, 'Rejected')}>{savingOwnerDecisionId === application.id ? 'Saving…' : 'Decline'}</Button>
                                  </div>
                                </>
                              ) : <span className="small text-muted">Decision is read-only</span>}
                            </td>
                          </tr>
                        ))}
                        {ownerApprovals.length === 0 && (
                          <tr><td colSpan="8" className="pm-empty-row">No applications are recorded for your properties.</td></tr>
                        )}
                      </tbody>
                    </Table>
                  </Tab>

                  {/* Tab 2: Lease Contracts */}
                  <Tab eventKey="contracts" title={`Lease Contracts (${portfolio.contracts.length})`}>
                    <Table responsive className="pm-table mb-0">
                      <thead>
                        <tr>
                          <th>Property / Unit</th>
                          <th>Tenant name</th>
                          <th>Monthly rental</th>
                          <th>Lease Term</th>
                          <th>Status</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {portfolio.contracts.length > 0 ? (
                          portfolio.contracts.map((con) => {
                            const contractId = con._id || con.id;
                            const propTitle = con.propertyDetails?.title || con.property?.title || con.property;
                            const tenantName = con.tenantDetails?.name || con.tenant?.name || con.tenant;

                            return (
                              <tr key={contractId}>
                                <td className="pm-cell-title">
                                  {propTitle}
                                  {(con.unitDetails?.unitNumber || con.unitNumber) && (con.unitDetails?.unitNumber || con.unitNumber) !== 'Main Unit'
                                    ? ` (${con.unitDetails?.unitNumber || con.unitNumber})`
                                    : ''}
                                </td>
                                <td>{tenantName} {con.tenantDetails?.email || con.tenant?.email ? `(${con.tenantDetails?.email || con.tenant?.email})` : ''}</td>
                                <td className="pm-cell-strong">
                                  ₱{Number(con.rentAmount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                                <td className="pm-cell-muted small">
                                  {con.startDate ? new Date(con.startDate).toLocaleDateString() : '—'} - {con.endDate ? new Date(con.endDate).toLocaleDateString() : '—'}
                                </td>
                                <td>
                                  <StatusPill status={con.status} />
                                  {con.activatedAt && <div className="small text-muted mt-1">{con.activationBasis} · {new Date(con.activatedAt).toLocaleDateString()}</div>}
                                  {con.terminationEffectiveDate && <div className="small text-muted mt-1">Ended effective {new Date(con.terminationEffectiveDate).toLocaleDateString()}</div>}
                                  {con.terminationReason && <div className="small text-muted mt-1">{con.terminationReason}</div>}
                                </td>
                                <td>
                                  {con.status === 'Pending' ? (
                                    <Button size="sm" variant="primary" disabled={activatingContractId === contractId} onClick={() => handleActivateLease(con)}>
                                      Confirm signed & activate
                                    </Button>
                                  ) : con.activatedAt ? (
                                    <span className="small text-muted d-block mb-2">Activated by {con.activatedBy?.name || con.activatedBy?.email || 'Owner'}</span>
                                  ) : null}
                                  {['Pending', 'Active'].includes(con.status) && (
                                    <Button size="sm" variant="outline-danger" onClick={() => openTerminationForm(con)}>
                                      {con.status === 'Pending' ? 'Cancel pending lease' : 'End lease'}
                                    </Button>
                                  )}
                                  {!['Pending', 'Active'].includes(con.status) && '—'}
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan="6" className="pm-empty-row">
                              No lease contracts found.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </Table>
                  </Tab>

                  <Tab eventKey="signingHistory" title={`Lease signing history (${portfolio.leaseSigningHistory.length})`}>
                    <Table responsive className="pm-table mb-0">
                      <thead>
                        <tr><th>Date</th><th>Event</th><th>Record</th><th>Recorded by</th></tr>
                      </thead>
                      <tbody>
                        {portfolio.leaseSigningHistory.map((event) => (
                          <tr key={event.id}>
                            <td>{event.createdAt ? new Date(event.createdAt).toLocaleString() : '—'}</td>
                            <td className="pm-cell-strong">{event.action}</td>
                            <td>{event.summary}</td>
                            <td>{event.actor || 'System'}</td>
                          </tr>
                        ))}
                        {portfolio.leaseSigningHistory.length === 0 && (
                          <tr><td colSpan="4" className="pm-empty-row">No lease signing events recorded.</td></tr>
                        )}
                      </tbody>
                    </Table>
                  </Tab>

                  {/* Tab 3: Maintenance Oversight */}
                  <Tab eventKey="maintenance" title={`Maintenance Tickets (${portfolio.maintenanceRequests.length})`}>
                    <Table responsive className="pm-table mb-0">
                      <thead>
                        <tr>
                          <th>Property</th>
                          <th>Issue Description</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {portfolio.maintenanceRequests.length > 0 ? (
                          portfolio.maintenanceRequests.map((m) => {
                            const reqId = m._id || m.id;
                            const propTitle = m.propertyDetails?.title || m.property?.title || m.property || 'Property Asset';

                            return (
                              <tr key={reqId}>
                                <td className="pm-cell-title">{propTitle}</td>
                                <td>{m.title || m.issueDescription}</td>
                                <td>
                                  <StatusPill status={m.status} />
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan="3" className="pm-empty-row">
                              No maintenance requests on record for your properties.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </Table>
                  </Tab>

                  <Tab eventKey="payments" title={`Payment Status (${portfolio.invoices.length})`}>
                    <h6 className="fw-bold mb-3">Portfolio rent summary</h6>
                    <Row className="g-3 mb-4">
                      <Col sm={6} xl={3}>
                        <div className="pm-panel p-3 h-100">
                          <div className="small text-muted">Rent invoiced</div>
                          <div className="fs-5 fw-bold">₱{metrics.rentInvoiced.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        </div>
                      </Col>
                      <Col sm={6} xl={3}>
                        <div className="pm-panel p-3 h-100">
                          <div className="small text-muted">Verified rent collected</div>
                          <div className="fs-5 fw-bold text-success">₱{metrics.rentCollected.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        </div>
                      </Col>
                      <Col sm={6} xl={3}>
                        <div className="pm-panel p-3 h-100">
                          <div className="small text-muted">Balance outstanding</div>
                          <div className="fs-5 fw-bold text-danger">₱{metrics.outstandingBalance.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        </div>
                      </Col>
                      <Col sm={6} xl={3}>
                        <div className="pm-panel p-3 h-100">
                          <div className="small text-muted">Payments awaiting review</div>
                          <div className="fs-5 fw-bold">{metrics.paymentsAwaitingReview}</div>
                        </div>
                      </Col>
                    </Row>
                    <h6 className="fw-bold mb-3">Invoice balances</h6>
                    <Table responsive className="pm-table mb-4">
                      <thead><tr><th>Property</th><th>Tenant</th><th>Total due</th><th>Paid</th><th>Balance</th><th>Due date</th><th>Status</th><th>Awaiting review</th></tr></thead>
                      <tbody>
                        {portfolio.invoices.map((invoice) => (
                          <tr key={invoice._id || invoice.id}>
                            <td>{invoice.propertyDetails?.title || 'Property'}</td>
                            <td>{invoice.tenantDetails?.name || invoice.tenantDetails?.email || 'Tenant'}</td>
                            <td>₱{Number(invoice.totalDue || invoice.amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td>₱{Number(invoice.amountPaid || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="fw-semibold">₱{Number(invoice.balanceDue || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td>{invoice.dueDate || '—'}</td>
                            <td>
                              <StatusPill status={invoice.status} />
                              {invoice.isArchived && <div className="small text-muted mt-1">Archived history</div>}
                            </td>
                            <td>{Number(invoice.pendingPaymentCount || 0)}</td>
                          </tr>
                        ))}
                        {portfolio.invoices.length === 0 && <tr><td colSpan="8" className="text-center text-muted py-4">No invoices found for your properties.</td></tr>}
                      </tbody>
                    </Table>

                    <h6 className="fw-bold mb-3">Payment history</h6>
                    <Table responsive className="pm-table mb-0">
                      <thead><tr><th>Property</th><th>Tenant</th><th>Payment date</th><th>Amount</th><th>Method</th><th>Reference</th><th>Status</th><th>Review note</th></tr></thead>
                      <tbody>
                        {portfolio.payments.map((payment) => (
                          <tr key={payment.id}>
                            <td>{payment.invoiceDetails?.property || 'Property'}</td>
                            <td>{payment.invoiceDetails?.tenant || 'Tenant'}</td>
                            <td>{payment.paymentDate ? new Date(`${payment.paymentDate}T00:00:00`).toLocaleDateString('en-PH') : '—'}</td>
                            <td className="fw-semibold">₱{Number(payment.amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td>{payment.paymentMethod || '—'}</td>
                            <td>{payment.referenceNumber || '—'}</td>
                            <td><StatusPill status={payment.status} /></td>
                            <td>{payment.rejectionReason || payment.reversalReason || '—'}</td>
                          </tr>
                        ))}
                        {portfolio.payments.length === 0 && <tr><td colSpan="8" className="text-center text-muted py-4">No payment transactions recorded for your properties.</td></tr>}
                      </tbody>
                    </Table>
                  </Tab>

                </Tabs>
              </div>
            </div>
          </>
        )}
      </Container>

      <Modal show={showPropertyModal} onHide={() => setShowPropertyModal(false)} centered dialogClassName="pm-modal">
        <Modal.Header closeButton>
          <Modal.Title>Register a property</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handlePropertyCreate}>
          <Modal.Body>
            <p className="text-muted small">Register a property you own. Your Owner account will be linked automatically. An Admin can assign the Property Manager.</p>
            <Form.Group className="mb-3">
              <Form.Label>Property name</Form.Label>
              <Form.Control value={propertyDraft.title} onChange={(event) => setPropertyDraft({ ...propertyDraft, title: event.target.value })} required />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Address</Form.Label>
              <Form.Control value={propertyDraft.address} onChange={(event) => setPropertyDraft({ ...propertyDraft, address: event.target.value })} required />
            </Form.Group>
            <Row className="g-3 mb-3">
              <Col md={['Apartment', 'Condo'].includes(propertyDraft.propertyType) ? 12 : 6}>
                <Form.Label>Property type</Form.Label>
                <Form.Select value={propertyDraft.propertyType} onChange={(event) => setPropertyDraft({ ...propertyDraft, propertyType: event.target.value })}>
                  {['Apartment', 'Condo', 'House', 'Commercial'].map((type) => <option key={type}>{type}</option>)}
                </Form.Select>
              </Col>
              {!['Apartment', 'Condo'].includes(propertyDraft.propertyType) && (
                <Col md={6}>
                  <Form.Label>Monthly rent (₱)</Form.Label>
                  <Form.Control type="number" min="0.01" step="0.01" value={propertyDraft.price} onChange={(event) => setPropertyDraft({ ...propertyDraft, price: event.target.value })} required />
                </Col>
              )}
            </Row>
            <Form.Group className="mb-3">
              <Form.Label>Rental application approval</Form.Label>
              <Form.Select value={propertyDraft.applicationApprovalMode} disabled>
                <option value="Owner">Owner reviews and makes the final decision</option>
              </Form.Select>
              <Form.Text className="text-muted">New properties start with Owner approval. After a Manager is assigned, you can delegate application decisions from the property settings.</Form.Text>
            </Form.Group>
            {['Apartment', 'Condo'].includes(propertyDraft.propertyType) && (
              <Form.Group>
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <Form.Label className="mb-0">Initial units and rent</Form.Label>
                  <Button type="button" size="sm" variant="outline-primary" onClick={() => setPropertyDraft((current) => ({ ...current, units: [...current.units, { unitNumber: '', monthlyRate: '' }] }))}>Add unit</Button>
                </div>
                {propertyDraft.units.map((unit, index) => (
                  <Row className="g-2 mb-2" key={`owner-property-unit-${index}`}>
                    <Col><Form.Control placeholder="Unit number" value={unit.unitNumber} onChange={(event) => setPropertyDraft((current) => ({ ...current, units: current.units.map((item, itemIndex) => itemIndex === index ? { ...item, unitNumber: event.target.value } : item) }))} required /></Col>
                    <Col><Form.Control type="number" min="0.01" step="0.01" placeholder="Monthly rent (₱)" value={unit.monthlyRate} onChange={(event) => setPropertyDraft((current) => ({ ...current, units: current.units.map((item, itemIndex) => itemIndex === index ? { ...item, monthlyRate: event.target.value } : item) }))} required /></Col>
                    <Col xs="auto"><Button type="button" variant="outline-danger" disabled={propertyDraft.units.length === 1} onClick={() => setPropertyDraft((current) => ({ ...current, units: current.units.filter((_, itemIndex) => itemIndex !== index) }))}>Remove</Button></Col>
                  </Row>
                ))}
              </Form.Group>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline-secondary" onClick={() => setShowPropertyModal(false)}>Cancel</Button>
            <Button variant="dark" type="submit" disabled={savingProperty}>{savingProperty ? 'Saving…' : 'Add property'}</Button>
          </Modal.Footer>
        </Form>
      </Modal>

      <Modal show={Boolean(contractForActivation)} onHide={() => !activatingContractId && setContractForActivation(null)} centered dialogClassName="pm-modal">
        <Modal.Header closeButton>
          <Modal.Title>Activate signed lease</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleActivationSubmit}>
          <Modal.Body>
            <p>Confirm the parties signed <strong>{contractForActivation?.propertyDetails?.title || 'this lease'}</strong>. This records activation and marks the unit occupied.</p>
            <Form.Group className="mb-3">
              <Form.Label>Signed-copy reference</Form.Label>
              <Form.Control value={signedCopyReference} onChange={(event) => setSignedCopyReference(event.target.value)} maxLength={500} placeholder="File name, document location, or reference" required />
            </Form.Group>
            {contractForActivation && !contractForActivation.sourceApplication && (
              <>
                <p className="small text-muted">This is a manual/offline lease. Add a reason or reference to the existing tenancy record.</p>
                <Form.Group className="mb-3">
                  <Form.Label>Manual lease reason</Form.Label>
                  <Form.Control as="textarea" rows={2} value={manualActivationReason} onChange={(event) => setManualActivationReason(event.target.value)} placeholder="Existing tenancy or offline arrangement" />
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>Existing lease-record reference</Form.Label>
                  <Form.Control value={manualActivationReference} onChange={(event) => setManualActivationReference(event.target.value)} maxLength={500} placeholder="Optional if a reason is entered" />
                </Form.Group>
              </>
            )}
            <Form.Check type="checkbox" id="owner-confirm-signed-lease" label="I confirm all required parties signed this lease outside the system." required />
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline-secondary" onClick={() => setContractForActivation(null)} disabled={Boolean(activatingContractId)}>Cancel</Button>
            <Button variant="primary" type="submit" disabled={Boolean(activatingContractId)}>{activatingContractId ? 'Activating…' : 'Activate lease'}</Button>
          </Modal.Footer>
        </Form>
      </Modal>

      <Modal show={Boolean(contractForTermination)} onHide={() => !savingTermination && setContractForTermination(null)} centered dialogClassName="pm-modal">
        <Modal.Header closeButton>
          <Modal.Title>End lease</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleTerminationSubmit}>
          <Modal.Body>
            <p>End the lease for <strong>{contractForTermination?.propertyDetails?.title || 'this property'}</strong>. The lease record will remain in your history.</p>
            <Form.Group className="mb-3">
              <Form.Label>Effective date</Form.Label>
              <Form.Control type="date" value={terminationEffectiveDate} onChange={(event) => setTerminationEffectiveDate(event.target.value)} required />
            </Form.Group>
            <Form.Group>
              <Form.Label>Reason</Form.Label>
              <Form.Control as="textarea" rows={3} value={terminationReason} onChange={(event) => setTerminationReason(event.target.value)} required />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline-secondary" onClick={() => setContractForTermination(null)} disabled={savingTermination}>Cancel</Button>
            <Button variant="danger" type="submit" disabled={savingTermination}>{savingTermination ? 'Saving…' : 'End lease'}</Button>
          </Modal.Footer>
        </Form>
      </Modal>

      <Modal
        show={showLeaseAuthorityModal}
        onHide={() => !savingLeaseAuthority && setShowLeaseAuthorityModal(false)}
        centered
        dialogClassName="pm-modal"
      >
        <Modal.Header closeButton>
          <Modal.Title>Grant lease {leaseAuthorityKind === 'signing' ? 'signing' : 'termination'} authority</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleGrantLeaseAuthority}>
          <Modal.Body>
            <p>
              This allows <strong>{leaseAuthorityProperty?.managerDetails?.name || 'the assigned Property Manager'}</strong> to
              {leaseAuthorityKind === 'signing' ? ' activate signed leases for ' : ' end leases for '}
              <strong>{leaseAuthorityProperty?.title}</strong>
              It applies only to this property.
            </p>
            <p className="small text-muted">
              Grant this only when your written management agreement gives the manager this authority. This system does not
              {leaseAuthorityKind === 'signing' ? ' sign leases or determine their legal validity.' : ' decide whether ending a lease is legally justified.'}
            </p>
            <Form.Group className="mb-3">
              <Form.Label>Written agreement reference</Form.Label>
              <Form.Control
                value={leaseAuthorityReference}
                onChange={(event) => setLeaseAuthorityReference(event.target.value)}
                maxLength={500}
                placeholder="Agreement name, date, or clause"
                required
              />
            </Form.Group>
            <Form.Check
              type="checkbox"
              id="confirm-written-lease-authority"
              checked={confirmWrittenAuthority}
              onChange={(event) => setConfirmWrittenAuthority(event.target.checked)}
              label={`I confirm the written agreement grants this manager authority to ${leaseAuthorityKind === 'signing' ? 'activate signed leases' : 'end leases'} for this property.`}
              required
            />
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline-secondary" onClick={() => setShowLeaseAuthorityModal(false)} disabled={savingLeaseAuthority}>Cancel</Button>
            <Button variant="primary" type="submit" disabled={savingLeaseAuthority}>
              {savingLeaseAuthority ? 'Saving…' : `Grant ${leaseAuthorityKind === 'signing' ? 'signing' : 'termination'} authority`}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </div>
  );
}
