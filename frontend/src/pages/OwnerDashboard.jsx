import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Container, Spinner, Button, Form, Modal, Row, Col } from 'react-bootstrap';
import Table from '../components/ResponsiveTable.jsx';
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
import PaymentAcknowledgmentButton from '../components/PaymentAcknowledgmentButton';
import './OwnerDashboard.css';

const PILL_CLASS = {
  available: 'pm-pill-available',
  rented: 'pm-pill-occupied',
  occupied: 'pm-pill-occupied',
  'under maintenance': 'pm-pill-maintenance',
  active: 'pm-pill-active',
  terminated: 'pm-pill-terminated',
  pending: 'pm-pill-pending',
  cancelled: 'pm-pill-terminated',
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

function getRentChangeEffectiveDate(changeRequest) {
  if (changeRequest.status === 'Pending') return 'After Owner approval';
  if (changeRequest.status !== 'Approved') return '—';
  if (!changeRequest.decidedAt) return 'On approval';

  const effectiveAt = new Date(changeRequest.decidedAt);
  return Number.isNaN(effectiveAt.getTime())
    ? 'On approval'
    : effectiveAt.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
}

function getOwnerRentalProgress(application, contract) {
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
    if (portfolio.summary) {
      return {
        totalOwned: Number(portfolio.summary.totalOwned || 0),
        totalUnits: Number(portfolio.summary.totalUnits || 0),
        occupiedUnits: Number(portfolio.summary.occupiedUnits || 0),
        occupancyRate: Number(portfolio.summary.occupancyRate || 0),
        totalMonthlyIncome: Number(portfolio.summary.totalMonthlyIncome || 0),
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

  const ownerHistory = useMemo(() => portfolio.leaseSigningHistory.map((event) => {
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
  }).sort((first, second) => new Date(second.createdAt || 0) - new Date(first.createdAt || 0)), [portfolio.leaseSigningHistory]);

  const visibleOwnerHistory = historyFilter === 'all'
    ? ownerHistory
    : ownerHistory.filter((event) => event.category === historyFilter);

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
            {/* Metrics Strip */}
            <div className="pm-metrics" data-workspace-section="overview">
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
              <div style={{ padding: '20px' }}>
                  {sectionLoading[activePortfolioTab] && (
                    <div className="pm-loading py-2" role="status">
                      <Spinner animation="border" size="sm" className="me-2" />Loading this section…
                    </div>
                  )}
                  {sectionErrors[activePortfolioTab] && (
                    <div className="pm-alert pm-alert-error mb-3" role="alert">
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
                  {/* Tab 1: Owned Properties */}
                  {activePortfolioTab === 'properties' && (
                  <div>
                    <div className="pm-owner-assets-wrap">
                    <Table responsive className="pm-table pm-owner-assets-table mb-0">
                      <thead>
                        <tr>
                          <th>Property</th>
                          <th>Occupancy &amp; yield</th>
                          <th>Application approval</th>
                          <th>Manager authority</th>
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

                            const savedApprovalMode = prop.applicationApprovalMode || 'Owner';
                            const selectedApprovalMode = approvalModeDrafts[propId] || savedApprovalMode;
                            const approvalRuleUnchanged = selectedApprovalMode === savedApprovalMode;

                            return (
                              <tr key={propId}>
                                <td data-label="Property">
                                  <div className="pm-owner-property-title">{prop.title}</div>
                                  <div className="pm-owner-property-meta">
                                    <span>{prop.address}</span>
                                    <span className="pm-owner-property-type">{prop.propertyType}</span>
                                  </div>
                                </td>
                                <td data-label="Occupancy &amp; yield">
                                  <div className="pm-owner-property-metrics">
                                    <div className="pm-owner-property-metric">
                                      <span className="pm-owner-control-label">Occupied</span>
                                      <StatusPill status={`${occupiedCount}/${totalUnits} occupied`} />
                                    </div>
                                    <div className="pm-owner-property-metric">
                                      <span className="pm-owner-control-label">Monthly yield</span>
                                      <strong className="pm-owner-yield">
                                        ₱{Number(yieldAmt).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                      </strong>
                                    </div>
                                  </div>
                                </td>
                                <td data-label="Application approval">
                                  <div className="pm-owner-policy-control">
                                    <Form.Select
                                      id={`approval-rule-${propId}`}
                                      size="sm"
                                      aria-label={`Application approval rule for ${prop.title}`}
                                      value={selectedApprovalMode}
                                      onChange={(event) => setApprovalModeDrafts((current) => ({ ...current, [propId]: event.target.value }))}
                                    >
                                      <option value="Owner">Owner reviews applications</option>
                                      <option value="Manager" disabled={!prop.managerDetails}>Manager reviews applications</option>
                                    </Form.Select>
                                    {savingApprovalPropertyId === propId ? (
                                      <Button size="sm" className="pm-owner-save-state" variant="outline-secondary" disabled aria-live="polite">
                                        Saving…
                                      </Button>
                                    ) : approvalRuleUnchanged ? (
                                      <span className="pm-owner-saved-note" aria-live="polite">Saved</span>
                                    ) : (
                                      <Button
                                        size="sm"
                                        className="pm-owner-save-state"
                                        variant="outline-primary"
                                        onClick={() => handleApprovalPolicySave(prop)}
                                      >
                                        Save changes
                                      </Button>
                                    )}
                                  </div>
                                </td>
                                <td data-label="Manager authority">
                                  {prop.managerDetails ? (
                                    <div className="pm-owner-authority-control">
                                      <div className="pm-owner-manager-name">{prop.managerDetails.name || prop.managerDetails.email}</div>
                                      <div className="pm-owner-authority-row">
                                        <span className="pm-owner-authority-label">Sign leases</span>
                                        <span className={`pm-owner-authority-state ${prop.managerLeaseSigningAuthorized ? 'is-authorized' : ''}`}>
                                          {prop.managerLeaseSigningAuthorized ? 'Authorized' : 'Not authorized'}
                                        </span>
                                        <Button
                                          size="sm"
                                          variant={prop.managerLeaseSigningAuthorized ? 'outline-danger' : 'outline-primary'}
                                          aria-label={`${prop.managerLeaseSigningAuthorized ? 'Revoke' : 'Grant'} lease signing authority for ${prop.managerDetails.name || prop.managerDetails.email}`}
                                          onClick={() => handleLeaseAuthorityClick(prop, 'signing')}
                                        >
                                          {prop.managerLeaseSigningAuthorized ? 'Revoke' : 'Grant'}
                                        </Button>
                                      </div>
                                      <div className="pm-owner-authority-row">
                                        <span className="pm-owner-authority-label">End leases</span>
                                        <span className={`pm-owner-authority-state ${prop.managerLeaseTerminationAuthorized ? 'is-authorized' : ''}`}>
                                          {prop.managerLeaseTerminationAuthorized ? 'Authorized' : 'Not authorized'}
                                        </span>
                                        <Button
                                          size="sm"
                                          variant={prop.managerLeaseTerminationAuthorized ? 'outline-danger' : 'outline-primary'}
                                          aria-label={`${prop.managerLeaseTerminationAuthorized ? 'Revoke' : 'Grant'} lease termination authority for ${prop.managerDetails.name || prop.managerDetails.email}`}
                                          onClick={() => handleLeaseAuthorityClick(prop, 'termination')}
                                        >
                                          {prop.managerLeaseTerminationAuthorized ? 'Revoke' : 'Grant'}
                                        </Button>
                                      </div>
                                      <div className="pm-owner-authority-row">
                                        <span className="pm-owner-authority-label">Set rent prices</span>
                                        <span className={`pm-owner-authority-state ${prop.managerUnitPricingAuthorized ? 'is-authorized' : ''}`}>
                                          {prop.managerUnitPricingAuthorized ? 'Authorized' : 'Owner approval'}
                                        </span>
                                        <Button
                                          size="sm"
                                          variant={prop.managerUnitPricingAuthorized ? 'outline-danger' : 'outline-primary'}
                                          aria-label={`${prop.managerUnitPricingAuthorized ? 'Revoke' : 'Grant'} rent pricing authority for ${prop.managerDetails.name || prop.managerDetails.email}`}
                                          onClick={() => handleLeaseAuthorityClick(prop, 'pricing')}
                                        >
                                          {prop.managerUnitPricingAuthorized ? 'Revoke' : 'Grant'}
                                        </Button>
                                      </div>
                                      {(prop.leaseSigningAgreementReference || prop.leaseTerminationAgreementReference || prop.unitPricingAgreementReference) && (
                                        <div className="pm-owner-authority-reference">
                                          {prop.leaseSigningAgreementReference && <div>Lease signing: {prop.leaseSigningAgreementReference}</div>}
                                          {prop.leaseTerminationAgreementReference && <div>Lease ending: {prop.leaseTerminationAgreementReference}</div>}
                                          {prop.unitPricingAgreementReference && <div>Rent pricing: {prop.unitPricingAgreementReference}</div>}
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="pm-owner-manager-unassigned">Assign a Property Manager to manage lease permissions.</div>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan="4" className="pm-empty-row">
                              No property assets linked to your owner account.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </Table>
                    </div>
                  </div>
                  )}

                  {activePortfolioTab === 'pricing' && (
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
                          {portfolio.rentChangeRequests.length > 0 ? portfolio.rentChangeRequests.map((changeRequest) => (
                            <tr key={changeRequest.id}>
                              <td className="pm-cell-title">
                                {changeRequest.propertyTitle}
                                <div className="small text-muted">{changeRequest.targetLabel}</div>
                                <div className="small text-muted">Submitted by {changeRequest.proposedByName} · {new Date(changeRequest.createdAt).toLocaleDateString()}</div>
                              </td>
                              <td>₱{Number(changeRequest.currentRate).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / mo</td>
                              <td className="pm-cell-strong">₱{Number(changeRequest.proposedRate).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / mo</td>
                              <td>{changeRequest.reason}</td>
                              <td><StatusPill status={changeRequest.status} /></td>
                              <td>{getRentChangeEffectiveDate(changeRequest)}</td>
                              <td>
                                {changeRequest.status === 'Pending' ? (
                                  <div className="d-flex flex-wrap gap-2">
                                    <Button size="sm" variant="primary" onClick={() => handleRentChangeDecision(changeRequest, 'Approved')}>Approve</Button>
                                    <Button size="sm" variant="outline-danger" onClick={() => handleRentChangeDecision(changeRequest, 'Rejected')}>Decline</Button>
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
                  )}

                  {activePortfolioTab === 'approvals' && (
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
                        {ownerApprovals.map((application) => {
                          const relatedContracts = portfolio.contracts.filter(
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
                              <StatusPill status={application.status} />
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
                          );
                        })}
                        {ownerApprovals.length === 0 && (
                          <tr><td colSpan="8" className="pm-empty-row">No applications are recorded for your properties.</td></tr>
                        )}
                      </tbody>
                    </Table>
                  </div>
                  )}

                  {/* Tab 2: Lease Contracts */}
                  {activePortfolioTab === 'contracts' && (
                  <div>
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
                                  {con.status === 'Pending' && (
                                    <div className="pm-contract-next-step">
                                      Lease prepared. Waiting for all parties to sign outside the system.
                                    </div>
                                  )}
                                  {con.activatedAt && <div className="small text-muted mt-1">{con.activationBasis ? `Authority: ${con.activationBasis} · ` : ''}{new Date(con.activatedAt).toLocaleDateString()}</div>}
                                  {con.signedCopyReference && <div className="pm-contract-reference">Signed copy: {con.signedCopyReference}</div>}
                                  {con.terminationEffectiveDate && <div className="small text-muted mt-1">Ended effective {new Date(con.terminationEffectiveDate).toLocaleDateString()}</div>}
                                  {con.terminationReason && <div className="small text-muted mt-1">{con.terminationReason}</div>}
                                </td>
                                <td>
                                  {con.status === 'Pending' ? (
                                    <Button size="sm" variant="primary" disabled={activatingContractId === contractId} onClick={() => handleActivateLease(con)}>
                                      Record signatures & activate
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
                  </div>
                  )}

                  {activePortfolioTab === 'history' && (
                    <section className="pm-owner-history" aria-label="Portfolio history">
                      <div className="pm-owner-history-header">
                        <div>
                          <h3>Portfolio history</h3>
                          <p>Application review, manager permissions, and lease changes are recorded here.</p>
                        </div>
                        <div className="pm-owner-history-filter">
                          <Form.Label htmlFor="owner-history-filter">Show</Form.Label>
                          <Form.Select
                            id="owner-history-filter"
                            size="sm"
                            value={historyFilter}
                            onChange={(event) => setHistoryFilter(event.target.value)}
                          >
                            <option value="all">All activity</option>
                            <option value="approval">Application approval</option>
                            <option value="authority">Manager permissions</option>
                            <option value="pricing">Rent changes</option>
                            <option value="lease">Lease activity</option>
                          </Form.Select>
                        </div>
                      </div>
                      <div className="pm-owner-history-summary" aria-live="polite">
                        Showing {visibleOwnerHistory.length} of {ownerHistory.length} {ownerHistory.length === 1 ? 'record' : 'records'}
                      </div>
                      {visibleOwnerHistory.length > 0 ? (
                        <ol className="pm-owner-history-timeline">
                          {visibleOwnerHistory.map((event) => {
                            const createdAt = event.createdAt ? new Date(event.createdAt) : null;
                            const dateLabel = createdAt && !Number.isNaN(createdAt.getTime())
                              ? createdAt.toLocaleString()
                              : 'Date unavailable';
                            return (
                              <li className="pm-owner-history-item" key={event.id}>
                                <span className={`pm-owner-history-marker is-${event.category}`} aria-hidden="true" />
                                <article className="pm-owner-history-card">
                                  <div className="pm-owner-history-card-top">
                                    <span className={`pm-owner-history-category is-${event.category}`}>{event.categoryLabel}</span>
                                    <time dateTime={createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt.toISOString() : undefined}>
                                      {dateLabel}
                                    </time>
                                  </div>
                                  <h4>{event.title}</h4>
                                  {event.summary && <p className="pm-owner-history-description">{event.summary}</p>}
                                  <div className="pm-owner-history-actor">Recorded by {event.actor || 'System'}</div>
                                </article>
                              </li>
                            );
                          })}
                        </ol>
                      ) : (
                        <div className="pm-owner-history-empty">
                          <strong>{ownerHistory.length === 0 ? 'No history yet' : 'No matching activity'}</strong>
                          <span>{ownerHistory.length === 0 ? 'Updates to approval rules, manager permissions, and leases will appear here.' : 'Choose another filter to see more portfolio records.'}</span>
                        </div>
                      )}
                    </section>
                  )}

                  {/* Tab 3: Maintenance Oversight */}
                  {activePortfolioTab === 'maintenance' && (
                  <div>
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
                  </div>
                  )}

                  {activePortfolioTab === 'payments' && (
                  <div>
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
                    <Table responsive className="pm-table pm-payment-history mb-0">
                      <thead><tr><th>Property</th><th>Tenant</th><th>Payment date</th><th>Amount</th><th>Method</th><th>Reference</th><th>Status</th><th>Details</th></tr></thead>
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
                            <td>{payment.status === 'Verified' ? <PaymentAcknowledgmentButton payment={payment} /> : payment.rejectionReason || payment.reversalReason || '—'}</td>
                          </tr>
                        ))}
                        {portfolio.payments.length === 0 && <tr><td colSpan="8" className="text-center text-muted py-4">No payment transactions recorded for your properties.</td></tr>}
                      </tbody>
                    </Table>
                    <CollectionPagination
                      count={sectionPages.paymentTransactions?.count || 0}
                      page={sectionPages.paymentTransactions?.page || 1}
                      pageCount={sectionPages.paymentTransactions?.pageCount || 1}
                      onPageChange={(nextPage) => loadOwnerData({
                        section: 'payments', force: true, includeSummary: false,
                        page: sectionPages.payments?.page || 1, paymentPage: nextPage,
                      })}
                    />
                  </div>
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
