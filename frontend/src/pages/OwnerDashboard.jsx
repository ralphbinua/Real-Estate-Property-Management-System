import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Container, Spinner, Button, Form, Modal, Row, Col } from 'react-bootstrap';
import { fetchOwnerPortfolio, fetchOwnerPortfolioPage } from '../services/ownerService';
import { fetchPaymentsPage } from '../services/invoiceService';
import { fetchApplicationsPage, reviewApplication } from '../services/applicationService';
import CollectionPagination from '../components/CollectionPagination';
import useNotificationDeepLink from '../hooks/useNotificationDeepLink';
import {
  createProperty, setLeaseSigningAuthority, setLeaseTerminationAuthority,
  setUnitPricingAuthority, setApplicationApprovalPolicy, decideRentChange,
} from '../services/propertyService';
import { activateContract, terminateContract } from '../services/contractService';
import DashboardHeader from '../components/DashboardHeader';
import { resolveMonthlyIncome } from '../utils/leaseIncome';
import OwnerMetricsSection from './owner/OwnerMetricsSection.jsx';
import OwnerPropertiesSection from './owner/OwnerPropertiesSection.jsx';
import OwnerPricingSection from './owner/OwnerPricingSection.jsx';
import OwnerApprovalsSection from './owner/OwnerApprovalsSection.jsx';
import OwnerContractsSection from './owner/OwnerContractsSection.jsx';
import OwnerHistorySection from './owner/OwnerHistorySection.jsx';
import OwnerMaintenanceSection from './owner/OwnerMaintenanceSection.jsx';
import OwnerBillingSection from './owner/OwnerBillingSection.jsx';
import { mapOwnerHistory } from './owner/ownerDashboardPresentation.js';
import './OwnerDashboard.css';

export default function OwnerDashboard() {
  const [activeSection, setActiveSection] = useState('overview');
  const [portfolio, setPortfolio] = useState({ summary: null, properties: [], contracts: [], maintenanceRequests: [], invoices: [], payments: [], leaseSigningHistory: [], rentChangeRequests: [] });
  const [ownerApprovals, setOwnerApprovals] = useState([]);
  const [ownerReviewNotes, setOwnerReviewNotes] = useState({});
  const [savingOwnerDecisionId, setSavingOwnerDecisionId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sectionLoading, setSectionLoading] = useState({});
  const [sectionErrors, setSectionErrors] = useState({});
  const [sectionPages, setSectionPages] = useState({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activePortfolioTab, setActivePortfolioTab] = useState('properties');
  const [historyFilter, setHistoryFilter] = useState('all');
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

  const loadedOwnerSections = useRef(new Set());
  const loadingOwnerSections = useRef(new Set());

  const loadOwnerData = useCallback(async ({ section = activePortfolioTab, force = true, includeSummary = true, page = 1, paymentPage = 1 } = {}) => {
    const sectionKey = section === 'overview' ? 'overview' : section;
    if (loadingOwnerSections.current.has(sectionKey)) return;
    if (!force && loadedOwnerSections.current.has(sectionKey) && !includeSummary) return;
    loadingOwnerSections.current.add(sectionKey);
    setSectionLoading((current) => ({ ...current, [sectionKey]: true }));
    setSectionErrors((current) => ({ ...current, [sectionKey]: '' }));
    const apiSection = {
      properties: 'properties',
      pricing: 'pricing',
      contracts: 'contracts',
      history: 'history',
      maintenance: 'maintenance',
      payments: 'payments',
    }[sectionKey];
    const summaryPromise = includeSummary && (force || !loadedOwnerSections.current.has('overview'))
      ? fetchOwnerPortfolio('overview')
      : Promise.resolve(null);
    const sectionPromise = sectionKey === 'approvals'
      ? fetchApplicationsPage({ page })
      : apiSection
        ? fetchOwnerPortfolioPage(apiSection, {
          page,
          ...(sectionKey === 'history' && historyFilter !== 'all' ? { category: historyFilter } : {}),
        })
        : Promise.resolve(null);
    const paymentsPromise = sectionKey === 'payments' ? fetchPaymentsPage({ page: paymentPage }) : Promise.resolve(null);

    try {
      const [summaryResult, sectionResult, paymentResult] = await Promise.allSettled([
        summaryPromise, sectionPromise, paymentsPromise,
      ]);
      const failures = [];
      if (summaryResult.status === 'fulfilled' && summaryResult.value) {
        setPortfolio((current) => ({ ...current, summary: summaryResult.value.summary || null }));
        loadedOwnerSections.current.add('overview');
      } else if (summaryResult.status === 'rejected') {
        failures.push('Portfolio summary could not be loaded.');
      }

      if (sectionResult.status === 'fulfilled' && sectionResult.value) {
        if (sectionKey === 'approvals') {
          setOwnerApprovals(sectionResult.value.results);
        } else {
          const responseKey = {
            properties: 'properties',
            pricing: 'rentChangeRequests',
            contracts: 'contracts',
            history: 'leaseSigningHistory',
            maintenance: 'maintenanceRequests',
            payments: 'invoices',
          }[sectionKey];
          setPortfolio((current) => ({
            ...current,
            [responseKey]: sectionResult.value.results,
          }));
        }
        setSectionPages((current) => ({
          ...current,
          [sectionKey]: {
            count: sectionResult.value.count,
            page,
            pageCount: Math.max(1, Math.ceil(sectionResult.value.count / 50)),
          },
        }));
        loadedOwnerSections.current.add(sectionKey);
      } else if (sectionResult.status === 'rejected') {
        failures.push('This section could not be loaded. Try again.');
      }

      if (sectionKey === 'payments' && paymentResult.status === 'fulfilled') {
        const data = paymentResult.value;
        setPortfolio((current) => ({
          ...current,
          payments: data.results,
        }));
        setSectionPages((current) => ({
          ...current,
          paymentTransactions: {
            count: data.count,
            page: paymentPage,
            pageCount: Math.max(1, Math.ceil(data.count / 50)),
          },
        }));
      } else if (sectionKey === 'payments' && paymentResult.status === 'rejected') {
        failures.push('Payment transactions could not be loaded.');
      }

      setSectionErrors((current) => ({ ...current, [sectionKey]: failures.join(' ') }));
      setError('');
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to fetch portfolio data.';
      setSectionErrors((current) => ({ ...current, [sectionKey]: message }));
    } finally {
      loadingOwnerSections.current.delete(sectionKey);
      setSectionLoading((current) => ({ ...current, [sectionKey]: false }));
      if (sectionKey === 'overview') setLoading(false);
    }
  }, [activePortfolioTab, historyFilter]);

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
      : authorityKind === 'termination'
        ? property.managerLeaseTerminationAuthorized
        : property.managerUnitPricingAuthorized;
    const saveAuthority = authorityKind === 'signing'
      ? setLeaseSigningAuthority
      : authorityKind === 'termination'
        ? setLeaseTerminationAuthority
        : setUnitPricingAuthority;
    const authorityLabel = authorityKind === 'signing'
      ? 'lease signing'
      : authorityKind === 'termination' ? 'lease termination' : 'rent pricing';
    if (isAuthorized) {
      if (!window.confirm(`Revoke ${authorityLabel} authority for ${property.managerDetails?.name || 'the assigned manager'} at ${property.title}?`)) return;
      setError('');
      setSuccess('');
      try {
        await saveAuthority(propertyId, { authorized: false });
        setSuccess(`${authorityLabel[0].toUpperCase()}${authorityLabel.slice(1)} authority revoked for ${property.title}.`);
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
      const saveAuthority = leaseAuthorityKind === 'signing'
        ? setLeaseSigningAuthority
        : leaseAuthorityKind === 'termination' ? setLeaseTerminationAuthority : setUnitPricingAuthority;
      await saveAuthority(leaseAuthorityProperty._id || leaseAuthorityProperty.id, {
        authorized: true,
        agreementReference: leaseAuthorityReference.trim(),
        confirmWrittenAuthority,
      });
      setShowLeaseAuthorityModal(false);
      const authorityLabel = leaseAuthorityKind === 'signing'
        ? 'lease signing'
        : leaseAuthorityKind === 'termination' ? 'lease termination' : 'rent pricing';
      setSuccess(`${authorityLabel[0].toUpperCase()}${authorityLabel.slice(1)} authority recorded for ${leaseAuthorityProperty.title}.`);
      await loadOwnerData();
    } catch (err) {
      const details = err.response?.data;
      setError(details?.agreementReference?.[0] || details?.confirmWrittenAuthority?.[0] || details?.detail || 'Unable to grant manager authority.');
    } finally {
      setSavingLeaseAuthority(false);
    }
  };

  const handleRentChangeDecision = async (changeRequest, status) => {
    if (status === 'Approved' && !window.confirm(`Approve the change to ${changeRequest.targetLabel} at ${changeRequest.propertyTitle} from ₱${Number(changeRequest.currentRate).toLocaleString()} to ₱${Number(changeRequest.proposedRate).toLocaleString()} per month?`)) return;
    const noteInput = status === 'Rejected'
      ? window.prompt('Optional: add a note for the Property Manager about this decision.')
      : '';
    if (noteInput === null) return;
    const decisionNote = (noteInput || '').trim();
    setError('');
    setSuccess('');
    try {
      await decideRentChange(changeRequest.id, { status, decisionNote });
      setSuccess(status === 'Approved'
        ? `Rent change approved for ${changeRequest.targetLabel}. New leases will use the approved rate; existing lease amounts stay as written.`
        : `Rent change declined for ${changeRequest.targetLabel}.`);
      await loadOwnerData();
    } catch (err) {
      if (err.response?.status === 409) {
        await loadOwnerData();
        setSuccess(err.response?.data?.detail || 'This proposal was closed because its current rate changed. Ask the Manager to submit a fresh proposal.');
        return;
      }
      const details = err.response?.data;
      setError(details?.detail || details?.status?.[0] || 'Unable to update this rent-change request.');
    }
  };

  const handleActivateLease = async (contract) => {
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
    void loadOwnerData({ section: 'overview', force: false, includeSummary: true });
  }, [loadOwnerData]);

  useEffect(() => {
    void loadOwnerData({ section: activePortfolioTab, force: false, includeSummary: false });
  }, [activePortfolioTab, loadOwnerData]);

  useEffect(() => {
    if (activePortfolioTab === 'history') {
      void loadOwnerData({ section: 'history', force: true, includeSummary: false, page: 1 });
    }
  }, [historyFilter, activePortfolioTab, loadOwnerData]);

  useEffect(() => {
    const handleWorkspaceNavigation = (event) => {
      setActiveSection(event.detail);
      const tab = event.detail === 'billing' ? 'payments' : event.detail;
      if (event.detail === 'portfolio') setActivePortfolioTab('properties');
      if (['properties', 'approvals', 'pricing', 'contracts', 'history', 'maintenance', 'payments'].includes(tab)) setActivePortfolioTab(tab);
    };
    window.addEventListener('workspace:navigate', handleWorkspaceNavigation);
    return () => window.removeEventListener('workspace:navigate', handleWorkspaceNavigation);
  }, []);
  useNotificationDeepLink('owner');

  // Advanced Metrics Logic (Explicit Numeric Conversion)
  const metrics = useMemo(() => {
    const totalMonthlyIncome = resolveMonthlyIncome(
      portfolio.summary, portfolio.contracts, sectionPages.contracts?.count,
    );
    if (portfolio.summary) {
      return {
        totalOwned: Number(portfolio.summary.totalOwned || 0),
        totalUnits: Number(portfolio.summary.totalUnits || 0),
        occupiedUnits: Number(portfolio.summary.occupiedUnits || 0),
        occupancyRate: Number(portfolio.summary.occupancyRate || 0),
        totalMonthlyIncome,
        activeLeasesCount: Number(portfolio.summary.activeLeasesCount || 0),
        rentInvoiced: Number(portfolio.summary.rentInvoiced || 0),
        rentCollected: Number(portfolio.summary.rentCollected || 0),
        outstandingBalance: Number(portfolio.summary.outstandingBalance || 0),
        paymentsAwaitingReview: Number(portfolio.summary.paymentsAwaitingReview || 0),
      };
    }
    const { properties, contracts } = portfolio;
    let totalUnits = 0;
    let occupiedUnits = 0;

    properties.forEach((p) => {
      if (Array.isArray(p.units) && p.units.length > 0) {
        totalUnits += p.units.length;
        const occupied = p.units.filter((u) => u.status === 'Occupied');
        occupiedUnits += occupied.length;
      } else {
        totalUnits += 1;
        if (['occupied', 'rented'].includes(p.status?.toLowerCase())) {
          occupiedUnits += 1;
        }
      }
    });

    const activeContracts = contracts.filter((c) => c.status?.toLowerCase() === 'active');
    

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
  }, [portfolio, sectionPages.contracts?.count]);

  const ownerHistory = useMemo(
    () => mapOwnerHistory(portfolio.leaseSigningHistory),
    [portfolio.leaseSigningHistory],
  );

  return (
    <div className="pm-owner" data-active-section={activeSection}>
      <Container>
        <DashboardHeader role="owner" section={activeSection} overviewTitle="Owner Portfolio Overview" overviewDescription="Register properties you own and monitor occupancy, leases, maintenance, and rental income.">
          {(activeSection === 'overview' || activeSection === 'portfolio') && <Button variant="dark" onClick={() => setShowPropertyModal(true)}>Add property</Button>}
        </DashboardHeader>

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
            {sectionErrors.overview && (
              <div className="pm-alert pm-alert-error mb-3" data-workspace-section="overview" role="alert">
                <span>{sectionErrors.overview}</span>
                <Button
                  size="sm" variant="outline-danger" className="ms-2"
                  disabled={sectionLoading.overview}
                  onClick={() => loadOwnerData({ section: 'overview', force: true, includeSummary: true })}
                >
                  Retry overview
                </Button>
              </div>
            )}
            <OwnerMetricsSection metrics={metrics} />

            <div className="pm-panel mb-4" id="portfolio" data-workspace-section="portfolio approvals pricing contracts history maintenance billing">
              <div className="pm-panel-header">{{
                properties: 'Properties',
                approvals: 'Application approvals',
                pricing: 'Rent change approvals',
                contracts: 'Lease contracts',
                history: 'Portfolio history',
                maintenance: 'Maintenance',
                payments: 'Payments',
              }[activePortfolioTab] || 'Properties'}</div>
              <div className="pm-owner-panel-content">
                  {sectionLoading[activePortfolioTab] && (
                    <div className="pm-loading pm-owner-section-loading py-2" role="status">
                      <Spinner animation="border" size="sm" className="me-2" />Loading this section…
                    </div>
                  )}
                  {sectionErrors[activePortfolioTab] && (
                    <div className="pm-alert pm-alert-error pm-owner-section-error mb-3" role="alert">
                      <span>{sectionErrors[activePortfolioTab]}</span>
                      <Button
                        size="sm"
                        variant="outline-danger"
                        className="ms-2"
                        onClick={() => loadOwnerData({ section: activePortfolioTab, force: true, includeSummary: false })}
                      >
                        Retry
                      </Button>
                    </div>
                  )}
                  {activePortfolioTab === 'properties' && (
                    <OwnerPropertiesSection
                      properties={portfolio.properties}
                      contracts={portfolio.contracts}
                      approvalModeDrafts={approvalModeDrafts}
                      savingApprovalPropertyId={savingApprovalPropertyId}
                      onApprovalModeChange={(propertyId, value) => setApprovalModeDrafts((current) => ({ ...current, [propertyId]: value }))}
                      onApprovalPolicySave={handleApprovalPolicySave}
                      onLeaseAuthorityClick={handleLeaseAuthorityClick}
                    />
                  )}
                  {activePortfolioTab === 'pricing' && (
                    <OwnerPricingSection
                      requests={portfolio.rentChangeRequests}
                      onDecision={handleRentChangeDecision}
                    />
                  )}
                  {activePortfolioTab === 'approvals' && (
                    <OwnerApprovalsSection
                      applications={ownerApprovals}
                      contracts={portfolio.contracts}
                      reviewNotes={ownerReviewNotes}
                      savingApplicationId={savingOwnerDecisionId}
                      onReviewNoteChange={(applicationId, value) => setOwnerReviewNotes((current) => ({ ...current, [applicationId]: value }))}
                      onDecision={handleOwnerDecision}
                    />
                  )}
                  {activePortfolioTab === 'contracts' && (
                    <OwnerContractsSection
                      contracts={portfolio.contracts}
                      activatingContractId={activatingContractId}
                      onActivate={handleActivateLease}
                      onTerminate={openTerminationForm}
                    />
                  )}
                  {activePortfolioTab === 'history' && (
                    <OwnerHistorySection
                      events={ownerHistory}
                      filter={historyFilter}
                      onFilterChange={setHistoryFilter}
                    />
                  )}
                  {activePortfolioTab === 'maintenance' && (
                    <OwnerMaintenanceSection requests={portfolio.maintenanceRequests} />
                  )}
                  {activePortfolioTab === 'payments' && (
                    <OwnerBillingSection
                      metrics={metrics}
                      invoices={portfolio.invoices}
                      payments={portfolio.payments}
                      paymentCount={sectionPages.paymentTransactions?.count || 0}
                      paymentPage={sectionPages.paymentTransactions?.page || 1}
                      paymentPageCount={sectionPages.paymentTransactions?.pageCount || 1}
                      onPaymentPageChange={(nextPage) => loadOwnerData({
                        section: 'payments',
                        force: true,
                        includeSummary: false,
                        page: sectionPages.payments?.page || 1,
                        paymentPage: nextPage,
                      })}
                    />
                  )}
                  {sectionPages[activePortfolioTab] && (
                    <CollectionPagination
                      count={sectionPages[activePortfolioTab].count}
                      page={sectionPages[activePortfolioTab].page}
                      pageCount={sectionPages[activePortfolioTab].pageCount}
                      onPageChange={(nextPage) => loadOwnerData({
                        section: activePortfolioTab,
                        force: true,
                        includeSummary: false,
                        page: nextPage,
                        paymentPage: sectionPages.paymentTransactions?.page || 1,
                      })}
                    />
                  )}
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
            <p>Once everyone has signed <strong>{contractForActivation?.propertyDetails?.title || 'this lease'}</strong> outside the system, record where the signed copy is kept. Activating the lease marks the unit occupied.</p>
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
          <Modal.Title>
            {leaseAuthorityKind === 'pricing' ? 'Grant rent pricing authority' : `Grant lease ${leaseAuthorityKind === 'signing' ? 'signing' : 'termination'} authority`}
          </Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleGrantLeaseAuthority}>
          <Modal.Body>
            <p>
              {leaseAuthorityKind === 'pricing'
                ? <>This allows <strong>{leaseAuthorityProperty?.managerDetails?.name || 'the assigned Property Manager'}</strong> to set or change the asking rent for <strong>{leaseAuthorityProperty?.title}</strong> and its units without asking you to approve each rate.</>
                : <>This allows <strong>{leaseAuthorityProperty?.managerDetails?.name || 'the assigned Property Manager'}</strong> to{leaseAuthorityKind === 'signing' ? ' activate signed leases for ' : ' end leases for '}<strong>{leaseAuthorityProperty?.title}</strong>. It applies only to this property.</>}
            </p>
            <p className="small text-muted">
              Grant this only when your written management agreement gives the Manager this authority. {leaseAuthorityKind === 'pricing' && 'Changes apply to future listings and new leases; existing lease amounts will not change.'}
              {leaseAuthorityKind === 'signing' && 'This system does not sign leases or determine their legal validity.'}
              {leaseAuthorityKind === 'termination' && 'This system does not decide whether ending a lease is legally justified.'}
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
              label={leaseAuthorityKind === 'pricing'
                ? 'I confirm the written agreement gives this Manager authority to set and change rent for this property.'
                : `I confirm the written agreement grants this Manager authority to ${leaseAuthorityKind === 'signing' ? 'activate signed leases' : 'end leases'} for this property.`}
              required
            />
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline-secondary" onClick={() => setShowLeaseAuthorityModal(false)} disabled={savingLeaseAuthority}>Cancel</Button>
            <Button variant="primary" type="submit" disabled={savingLeaseAuthority}>
              {savingLeaseAuthority ? 'Saving…' : leaseAuthorityKind === 'pricing' ? 'Grant pricing authority' : `Grant ${leaseAuthorityKind === 'signing' ? 'signing' : 'termination'} authority`}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </div>
  );
}
