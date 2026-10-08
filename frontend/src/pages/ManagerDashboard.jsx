import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Container, Form, Spinner, Button, Row, Col, Badge, Modal } from 'react-bootstrap';
import Table from '../components/ResponsiveTable.jsx';
import { fetchProperties, updateProperty, deleteProperty, fetchRentChangeRequestsPage, proposeRentChange } from '../services/propertyService';
import { fetchContracts, createContract, terminateContract, activateContract } from '../services/contractService';
import { fetchAssignableTenants } from '../services/userService';
import { fetchInvoices } from '../services/invoiceService';
import { createUnit, deleteUnit, updateUnit } from '../services/unitService';
import { fetchSystemSettings } from '../services/systemSettingsService';
import { addMonthsToDate } from '../utils/dateUtils';
import { fetchInquiriesPage, updateInquiry } from '../services/inquiryService';
import { createLeaseFromApplication, fetchApplicationsPage, reviewApplication } from '../services/applicationService';
import AdminMaintenanceManager from '../components/AdminMaintenanceManager';
import useNotificationDeepLink from '../hooks/useNotificationDeepLink';
import ManagerInvoiceTracker from '../components/ManagerInvoiceTracker';
import ManagerReports from '../components/ManagerReports';
import ManagerRentChangesSection from './manager/ManagerRentChangesSection';
import ManagerContractSection from './manager/ManagerContractSection';
import ManagerProspectsSection from './manager/ManagerProspectsSection';
import DashboardHeader from '../components/DashboardHeader';
import './ManagerDashboard.css';

const PROPERTY_TYPES = ['Condo', 'House', 'Apartment', 'Commercial'];
const PROPERTY_STATUSES = ['Available', 'Occupied', 'Pending', 'Under Maintenance'];

const PILL_CLASS = {
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
  const cls = PILL_CLASS[status.toLowerCase()] || 'pm-pill-default';
  return (
    <span className={`pm-pill ${cls}`}>
      <span className="pm-pill-dot" />
      {status}
    </span>
  );
}

export default function ManagerDashboard() {
  const [activeSection, setActiveSection] = useState('overview');
  const [properties, setProperties] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [userList, setUserList] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [inquiries, setInquiries] = useState([]);
  const [applications, setApplications] = useState([]);
  const [rentChangeRequests, setRentChangeRequests] = useState([]);
  const [managerPages, setManagerPages] = useState({});
  const [activatingContractId, setActivatingContractId] = useState(null);
  const [showManagerActivationModal, setShowManagerActivationModal] = useState(false);
  const [contractForActivation, setContractForActivation] = useState(null);
  const [signedCopyReference, setSignedCopyReference] = useState('');
  const [showTerminationModal, setShowTerminationModal] = useState(false);
  const [contractForTermination, setContractForTermination] = useState(null);
  const [terminationReason, setTerminationReason] = useState('');
  const [terminationEffectiveDate, setTerminationEffectiveDate] = useState('');
  const [managerReviewNotes, setManagerReviewNotes] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [summaryRefreshError, setSummaryRefreshError] = useState('');

  
  // Selected property for viewing units
  const [selectedPropertyId, setSelectedPropertyId] = useState(null);

  // New Lease Contract Modal State
  const [showContractModal, setShowContractModal] = useState(false);
  const [applicationForLease, setApplicationForLease] = useState(null);
  const [contractData, setContractData] = useState({
    property: '',
    unitId: '',
    unitNumber: '',
    tenant: '',
    startDate: '',
    endDate: '',
    rentAmount: '',
    rentDueDay: 1,
    manualLeaseReason: '',
    manualLeaseReference: '',
  });

  const [showPropertyEditModal, setShowPropertyEditModal] = useState(false);
  const [editingProperty, setEditingProperty] = useState(null);
  const [showUnitModal, setShowUnitModal] = useState(false);
  const [unitData, setUnitData] = useState({ id: null, property: '', unitNumber: '', monthlyRate: '', status: 'Available' });
  const [showRentProposalModal, setShowRentProposalModal] = useState(false);
  const [rentProposalTarget, setRentProposalTarget] = useState(null);
  const [rentProposalRate, setRentProposalRate] = useState('');
  const [rentProposalReason, setRentProposalReason] = useState('');
  const [savingRentProposal, setSavingRentProposal] = useState(false);
  const [leaseTermMonths, setLeaseTermMonths] = useState(12);
  // Filter State
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const managerLoadedSections = useRef(new Set());

  const loadManagerData = useCallback(async (section = activeSection, force = true, page = 1) => {
    if (!force && managerLoadedSections.current.has(section)) return;
    const requestMap = {
      overview: [['properties', fetchProperties], ['pricing', fetchRentChangeRequestsPage]],
      properties: [['properties', fetchProperties]],
      pricing: [['pricing', fetchRentChangeRequestsPage]],
      contracts: [['contracts', fetchContracts]],
      inquiries: [['inquiries', fetchInquiriesPage]],
      applications: [['applications', fetchApplicationsPage]],
      reports: [['invoices', fetchInvoices]],
    };
    const requests = requestMap[section] || [];
    const results = await Promise.allSettled(requests.map(([, fetcher]) => fetcher === fetchProperties || fetcher === fetchContracts || fetcher === fetchInvoices ? fetcher() : fetcher({ page })));
    const failures = [];
    results.forEach((result, index) => {
      const [dataKey] = requests[index];
      if (result.status === 'rejected') {
        failures.push(dataKey);
        return;
      }
      const data = Array.isArray(result.value) ? result.value : result.value?.results || [];
      if (dataKey === 'properties') setProperties(data);
      if (dataKey === 'contracts') setContracts(data);
      if (dataKey === 'invoices') setInvoices(data);
      if (dataKey === 'inquiries') setInquiries(data);
      if (dataKey === 'applications') setApplications(data);
      if (dataKey === 'pricing') setRentChangeRequests(data);
      if (result.value && !Array.isArray(result.value) && Number.isFinite(result.value.count)) {
        setManagerPages((current) => ({
          ...current,
          [dataKey]: { count: result.value.count, page, pageCount: Math.max(1, Math.ceil(result.value.count / 50)) },
        }));
      }
    });
    if (failures.length) setError(`Could not load ${failures.join(' and ')}. Try opening the section again.`);
    else {
      managerLoadedSections.current.add(section);
      setError('');
    }
    if (section === 'overview') setLoading(false);
  }, [activeSection]);

  const refreshManagerSections = async (...sections) => {
    await Promise.all(sections.map((section) => loadManagerData(section, true)));
  };

  const loadTenantChoices = async () => {
    try {
      const data = await fetchAssignableTenants();
      const tenants = Array.isArray(data) ? data : data?.results || [];
      setUserList(tenants);
      return tenants;
    } catch {
      setError('Unable to load tenant choices. Please try again.');
      return null;
    }
  };

  const openNewLeaseForm = async () => {
    const tenants = await loadTenantChoices();
    if (!tenants) return;
    setApplicationForLease(null);
    setContractData((current) => ({ ...current, rentDueDay: 1, manualLeaseReason: '', manualLeaseReference: '' }));
    setShowContractModal(true);
  };

  const refreshInvoiceSummaries = async () => {
    setSummaryRefreshError('');
    if (!managerLoadedSections.current.has('reports')) return;
    try {
      const data = await fetchInvoices();
      setInvoices(Array.isArray(data) ? data : []);
    } catch {
      setSummaryRefreshError('The billing action succeeded, but report totals could not be refreshed. Retry to update them.');
    }
  };

  useEffect(() => {
    void Promise.resolve().then(() => loadManagerData('overview', false));
    fetchSystemSettings().then((settings) => setLeaseTermMonths(settings.default_lease_term_months || 12)).catch(() => {});
  }, [loadManagerData]);

  useEffect(() => {
    const handleWorkspaceNavigation = (event) => {
      setActiveSection(event.detail);
      void loadManagerData(event.detail, false);
    };
    window.addEventListener('workspace:navigate', handleWorkspaceNavigation);
    return () => window.removeEventListener('workspace:navigate', handleWorkspaceNavigation);
  }, [loadManagerData]);
  useNotificationDeepLink('manager');

  const handlePropertySelect = (propertyId) => {
    const selectedProp = properties.find((p) => (p._id || p.id)?.toString() === propertyId?.toString());
    if (!selectedProp) return;

    const propId = selectedProp._id || selectedProp.id;

    if (!selectedProp.units || selectedProp.units.length === 0) {
      setContractData({
        ...contractData,
        property: propId,
        unitId: '',
        unitNumber: 'Main Unit',
        rentAmount: selectedProp.price || selectedProp.monthlyRate || ''
      });
    } else {
      setContractData({
        ...contractData,
        property: propId,
        unitId: '',
        unitNumber: '',
        rentAmount: ''
      });
    }
  };

  const handleUnitSelect = (unitId) => {
    const selectedProp = properties.find((p) => (p._id || p.id)?.toString() === contractData.property?.toString());
    if (!selectedProp || !selectedProp.units) return;

    const selectedUnit = selectedProp.units.find((u) => (u._id || u.id)?.toString() === unitId?.toString());
    if (selectedUnit) {
      setContractData({
        ...contractData,
        unitId: selectedUnit._id || selectedUnit.id,
        unitNumber: selectedUnit.unitNumber,
        rentAmount: selectedUnit.monthlyRate
      });
    }
  };

  const handleOpenLeaseForUnit = async (propertyId, unit) => {
    await loadTenantChoices();
    setContractData({
      property: propertyId,
      unitId: unit._id || unit.id,
      unitNumber: unit.unitNumber,
      tenant: '',
      startDate: '',
      endDate: '',
      rentAmount: unit.monthlyRate,
      rentDueDay: 1,
      manualLeaseReason: '',
      manualLeaseReference: '',
    });
    setShowContractModal(true);
  };

  const handleContractSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (new Date(contractData.endDate) <= new Date(contractData.startDate)) {
      setError('End Date must be strictly after Start Date.');
      return;
    }
    if (!applicationForLease && !contractData.manualLeaseReason.trim() && !contractData.manualLeaseReference.trim()) {
      setError('For an existing or offline tenancy, enter a reason or a reference to its current lease record.');
      return;
    }

    const payload = {
      ...contractData,
      unit: contractData.unitId ? Number(contractData.unitId) : null,
      rentAmount: Number(contractData.rentAmount),
      rentDueDay: Number(contractData.rentDueDay),
      manualLeaseReason: contractData.manualLeaseReason.trim(),
      manualLeaseReference: contractData.manualLeaseReference.trim(),
    };
    delete payload.unitId;
    delete payload.unitNumber;

    try {
      if (applicationForLease) {
        await createLeaseFromApplication(applicationForLease.id, {
          tenant: Number(contractData.tenant),
          startDate: contractData.startDate,
          endDate: contractData.endDate,
          rentDueDay: Number(contractData.rentDueDay),
        });
        setSuccess(`Lease prepared for ${applicationForLease.applicantName}. It is pending until all parties sign and an authorized person activates it.`);
        setApplicationForLease(null);
      } else {
        await createContract(payload);
        setSuccess('Lease prepared. It will remain pending until all parties sign and an authorized person activates it.');
      }
      setContractData({ property: '', unitId: '', unitNumber: '', tenant: '', startDate: '', endDate: '', rentAmount: '', rentDueDay: 1, manualLeaseReason: '', manualLeaseReference: '' });
      setShowContractModal(false);
      await refreshManagerSections('contracts', 'overview');
    } catch (err) {
      const details = err.response?.data || {};
      setError(details.detail || details.tenant?.[0] || details.unit?.[0] || details.manualLeaseReason?.[0] || details.property?.[0] || details.message || 'Failed to create lease contract.');
    }
  };

  const handleActivateLease = (contract) => {
    if (!contract.sourceApplication) {
      setError('Managers may prepare manual/offline leases, but only the Owner or an Admin with the Owner’s instruction can activate them.');
      return;
    }
    if (!contract.propertyDetails?.managerLeaseSigningAuthorized) {
      setError('The Owner has not recorded signing authority for you on this property. Ask the Owner to grant it or have them activate the signed lease.');
      return;
    }
    setContractForActivation(contract);
    setSignedCopyReference('');
    setShowManagerActivationModal(true);
  };

  const handleManagerActivationSubmit = async (event) => {
    event.preventDefault();
    if (!contractForActivation || !signedCopyReference.trim()) return;
    const contractId = contractForActivation._id || contractForActivation.id;
    setError('');
    setSuccess('');
    setActivatingContractId(contractId);
    try {
      await activateContract(contractId, { signaturesComplete: true, signedCopyReference: signedCopyReference.trim() });
      setShowManagerActivationModal(false);
      setContractForActivation(null);
      setSuccess('Signed lease activated and recorded.');
      await refreshManagerSections('contracts', 'overview');
    } catch (err) {
      setError(err.response?.data?.detail || err.response?.data?.signedCopyReference?.[0] || err.response?.data?.status?.[0] || 'Unable to activate this lease.');
    } finally {
      setActivatingContractId(null);
    }
  };

  const handleApplicationReview = async (application, status) => {
    setError('');
    setSuccess('');
    try {
      await reviewApplication(application.id, {
        status,
        ...(status === 'Pending Owner Approval' ? { reviewNotes: managerReviewNotes[application.id]?.trim() || '' } : {}),
      });
      setManagerReviewNotes((current) => {
        const next = { ...current };
        delete next[application.id];
        return next;
      });
      setSuccess(status === 'Pending Owner Approval'
        ? 'Application sent to the property owner for a decision.'
        : `Application ${status.toLowerCase()}.`);
      await refreshManagerSections('applications', 'overview', 'inquiries');
    } catch (err) {
      const responseData = err.response?.data;
      setError(responseData?.status?.[0] || responseData?.unit?.[0] || responseData?.detail || `Unable to ${status.toLowerCase()} this application.`);
    }
  };

  const openLeaseForApplication = async (application) => {
    const tenants = await loadTenantChoices();
    if (!tenants) return;
    const propertyId = application.propertyDetails?._id;
    const unitId = application.unitDetails?._id || '';
    const matchingTenant = tenants.find((tenant) => tenant.email?.trim().toLowerCase() === application.applicantEmail?.trim().toLowerCase());
    setApplicationForLease(application);
    setContractData({
      property: propertyId || '',
      unitId,
      unitNumber: application.unitDetails?.unitNumber || '',
      tenant: matchingTenant?._id || matchingTenant?.id || '',
      startDate: application.moveInDate || '',
      endDate: application.moveInDate ? addMonthsToDate(application.moveInDate, leaseTermMonths) : '',
      rentAmount: application.unitDetails?.monthlyRate || application.propertyDetails?.monthlyRate || '',
      rentDueDay: 1,
      manualLeaseReason: '',
      manualLeaseReference: '',
    });
    setShowContractModal(true);
  };

  const openUnitEditor = (property, unit = null) => {
    setUnitData({
      id: unit?._id || null,
      property: property._id || property.id,
      unitNumber: unit?.unitNumber || '',
      monthlyRate: unit?.monthlyRate ?? property.price ?? '',
      status: unit?.status || 'Available',
    });
    setShowUnitModal(true);
  };

  const openRentProposal = (property, targetKind = 'Property', unit = null) => {
    setShowPropertyEditModal(false);
    setShowUnitModal(false);
    setRentProposalTarget({
      property,
      targetKind,
      unit,
      currentRate: targetKind === 'Unit' ? unit?.monthlyRate : property.price,
    });
    setRentProposalRate('');
    setRentProposalReason('');
    setShowRentProposalModal(true);
  };

  const handleRentProposalSubmit = async (event) => {
    event.preventDefault();
    if (!rentProposalTarget) return;
    setError('');
    setSuccess('');
    setSavingRentProposal(true);
    try {
      await proposeRentChange({
        propertyId: Number(rentProposalTarget.property._id || rentProposalTarget.property.id),
        targetKind: rentProposalTarget.targetKind,
        unitId: rentProposalTarget.targetKind === 'Unit' ? Number(rentProposalTarget.unit._id || rentProposalTarget.unit.id) : null,
        proposedRate: Number(rentProposalRate),
        reason: rentProposalReason.trim(),
      });
      setShowRentProposalModal(false);
      setSuccess('Rent proposal sent to the Owner. The current rate stays in effect until it is approved.');
      await loadManagerData('pricing');
    } catch (err) {
      const details = err.response?.data;
      setError(details?.detail || details?.proposedRate?.[0] || details?.reason?.[0] || 'Unable to send the rent proposal.');
    } finally {
      setSavingRentProposal(false);
    }
  };

  const handleUnitSave = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const payload = {
        property: Number(unitData.property),
        unitNumber: unitData.unitNumber,
        monthlyRate: Number(unitData.monthlyRate),
        status: unitData.status,
      };
      if (unitData.id) await updateUnit(unitData.id, payload);
      else await createUnit(payload);
      setShowUnitModal(false);
      setSuccess(unitData.id ? 'Unit updated.' : 'Unit added.');
      await loadManagerData('properties');
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save unit.');
    }
  };

  const handleUnitDelete = async () => {
    if (!unitData.id || !window.confirm('Remove this unit? Units with an active lease cannot be removed.')) return;
    try {
      await deleteUnit(unitData.id);
      setShowUnitModal(false);
      setSuccess('Unit removed.');
      await loadManagerData('properties');
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to remove unit.');
    }
  };

  const handleInquiryStatusChange = async (inquiry, status) => {
    try {
      const updated = await updateInquiry(inquiry.id, { status });
      setInquiries((items) => items.map((item) => item.id === updated.id ? updated : item));
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update prospect inquiry.');
    }
  };

  const openPropertyEditor = (property) => {
    setEditingProperty({
      id: property._id || property.id,
      title: property.title,
      address: property.address,
      propertyType: property.propertyType,
      status: property.status,
      price: property.price || property.monthlyRate || 0,
    });
    setShowPropertyEditModal(true);
  };

  const handlePropertyEdit = async (e) => {
    e.preventDefault();
    try {
      await updateProperty(editingProperty.id, {
        title: editingProperty.title,
        address: editingProperty.address,
        propertyType: editingProperty.propertyType,
        status: editingProperty.status,
        ...(properties.find((property) => Number(property._id || property.id) === Number(editingProperty.id))?.managerUnitPricingAuthorized
          ? { price: Number(editingProperty.price) }
          : {}),
      });
      setShowPropertyEditModal(false);
      setSuccess('Property details updated.');
      await loadManagerData('properties');
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update property.');
    }
  };

  const handlePropertyArchive = async (property) => {
    const id = property._id || property.id;
    if (contracts.some((contract) => Number(contract.property) === Number(id) && ['Active', 'Pending'].includes(contract.status))) {
      setError('End or reassign active lease contracts before archiving this property.');
      return;
    }
    if (!window.confirm(`Archive ${property.title}? Its records will be retained.`)) return;
    try {
      await deleteProperty(id);
      setSuccess('Property archived.');
      await loadManagerData('overview');
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to archive property.');
    }
  };

  const openTerminationForm = (contract) => {
    setContractForTermination(contract);
    setTerminationReason('');
    setTerminationEffectiveDate(new Date().toISOString().slice(0, 10));
    setShowTerminationModal(true);
  };

  const handleTerminateContract = async (event) => {
    event.preventDefault();
    if (!contractForTermination) return;
    setError('');
    setSuccess('');
    try {
      await terminateContract(contractForTermination._id || contractForTermination.id, {
        reason: terminationReason.trim(),
        effectiveDate: terminationEffectiveDate,
      });
      setShowTerminationModal(false);
      setContractForTermination(null);
      setSuccess('Lease ended. Its history remains on the property record.');
      await refreshManagerSections('contracts', 'overview');
    } catch (err) {
      const details = err.response?.data || {};
      setError(details.reason?.[0] || details.effectiveDate?.[0] || details.detail || 'Unable to end this lease.');
    }
  };

  const filteredProperties = useMemo(() => {
    const q = search.toLowerCase();
    return properties.filter((prop) => {
      const matchesSearch =
        prop.title?.toLowerCase().includes(q) || prop.address?.toLowerCase().includes(q);
      const matchesType = filterType ? prop.propertyType === filterType : true;
      const matchesStatus = filterStatus ? prop.status?.toLowerCase() === filterStatus.toLowerCase() : true;
      return matchesSearch && matchesType && matchesStatus;
    });
  }, [properties, search, filterType, filterStatus]);

  const metrics = useMemo(() => {
    let totalAssigned = properties.length;
    let availableCount = 0;
    let occupiedCount = 0;

    properties.forEach((p) => {
      if (Array.isArray(p.units) && p.units.length > 0) {
        availableCount += p.units.filter((u) => u.status === 'Available').length;
        occupiedCount += p.units.filter((u) => u.status === 'Occupied').length;
      } else {
        if (p.status?.toLowerCase() === 'available') availableCount += 1;
        if (['occupied', 'rented'].includes(p.status?.toLowerCase())) occupiedCount += 1;
      }
    });

    return { totalAssigned, availableCount, occupiedCount };
  }, [properties]);

  const selectedPropertyObj = useMemo(
    () => properties.find((p) => (p._id || p.id)?.toString() === selectedPropertyId?.toString()),
    [properties, selectedPropertyId]
  );
  const unitDataProperty = useMemo(
    () => properties.find((property) => Number(property._id || property.id) === Number(unitData.property)),
    [properties, unitData.property],
  );
  const unitDataUnit = useMemo(
    () => unitDataProperty?.units?.find((unit) => Number(unit._id || unit.id) === Number(unitData.id)),
    [unitDataProperty, unitData.id],
  );
  const managerCanSetUnitRate = Boolean(unitDataProperty?.managerUnitPricingAuthorized);

  return (
    <div className="pm-manager" data-active-section={activeSection}>
      <Container>
        <DashboardHeader role="manager" section={activeSection} overviewTitle="Property Manager Dashboard" overviewDescription="Oversee assigned properties, leases, maintenance, and rent records.">
          {activeSection === 'contracts' && <Button variant="light" className="pm-btn-ghost" onClick={() => { void openNewLeaseForm(); }}>New lease</Button>}
        </DashboardHeader>

        {error && (
          <div className="pm-alert pm-alert-error" role="alert">
            <span>{error}</span>
            <button className="pm-alert-close" onClick={() => setError('')} aria-label="Dismiss">×</button>
          </div>
        )}
        {success && (
          <div className="pm-alert pm-alert-success" role="alert">
            <span>{success}</span>
            <button className="pm-alert-close" onClick={() => setSuccess('')} aria-label="Dismiss">×</button>
          </div>
        )}
        {summaryRefreshError && (
          <div className="pm-alert pm-alert-error" role="alert">
            <span>{summaryRefreshError}</span>
            <Button variant="outline-danger" size="sm" onClick={() => { void refreshInvoiceSummaries(); }}>Retry</Button>
            <button className="pm-alert-close" onClick={() => setSummaryRefreshError('')} aria-label="Dismiss">×</button>
          </div>
        )}

        {loading ? (
          <div className="pm-loading">
            <Spinner animation="border" size="sm" className="me-2" />
            Loading assigned property records…
          </div>
        ) : (
          <>
            {/* Metrics Strip */}
            <div className="pm-metrics" data-workspace-section="overview">
              <div className="pm-metric">
                <span className="pm-metric-label">Assigned properties</span>
                <span className="pm-metric-value">{metrics.totalAssigned}</span>
              </div>
              <div className="pm-metric">
                <span className="pm-metric-label">Available units</span>
                <span className="pm-metric-value">{metrics.availableCount}</span>
              </div>
              <div className="pm-metric">
                <span className="pm-metric-label">Occupied units</span>
                <span className="pm-metric-value">{metrics.occupiedCount}</span>
              </div>
            </div>

            <div className="pm-panel mb-4" id="pricing" data-workspace-section="pricing">
              <ManagerRentChangesSection
                requests={rentChangeRequests}
                pageInfo={managerPages.pricing || { count: 0, page: 1, pageCount: 1 }}
                onPageChange={(page) => loadManagerData('pricing', true, page)}
              />
            </div>

            {/* Performance Analytics & Revenue Reports Panel */}
            {activeSection === 'reports' && (
              <div className="pm-panel mb-4" id="reports" data-workspace-section="reports">
                <div className="pm-panel-header">Performance & Revenue Analytics</div>
                <div style={{ padding: '22px' }}>
                  <ManagerReports properties={properties} invoices={invoices} />
                </div>
              </div>
            )}

            {/* Invoicing Ledger Panel */}
            {activeSection === 'billing' && (
              <div className="pm-panel mb-4" id="billing" data-workspace-section="billing">
                <div className="pm-panel-header">Financial Ledger & Rent Collection</div>
                <div style={{ padding: '22px' }}>
                  <ManagerInvoiceTracker onPaymentsUpdated={refreshInvoiceSummaries} />
                </div>
              </div>
            )}

            {/* Maintenance Queue Panel */}
            {activeSection === 'maintenance' && (
              <div className="pm-panel mb-4" id="maintenance" data-workspace-section="maintenance">
                <div className="pm-panel-header">Maintenance & repair requests</div>
                <div style={{ padding: '22px' }}>
                  <AdminMaintenanceManager />
                </div>
              </div>
            )}

            {/* Filter Toolbar */}
            <div className="pm-filterbar" data-workspace-section="properties">
              <Form.Control
                className="pm-input pm-search"
                placeholder="Search by title or location…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Form.Select
                className="pm-input pm-select"
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
              >
                <option value="">All property types</option>
                {PROPERTY_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </Form.Select>
              <Form.Select
                className="pm-input pm-select"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="">All statuses</option>
                {PROPERTY_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </Form.Select>
            </div>

            {/* Property Directory */}
            <div className="pm-panel mb-4" id="properties" data-workspace-section="properties">
              <div className="pm-panel-header">
                Managed properties overview ({filteredProperties.length})
              </div>
              <Table responsive className="pm-table mb-0">
                <thead>
                  <tr>
                    <th>Property title</th>
                    <th>Address</th>
                    <th>Type</th>
                    <th>Monthly rate</th>
                    <th>Occupancy</th>
                    <th className="text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProperties.length > 0 ? (
                    filteredProperties.map((prop) => {
                      const propId = prop._id || prop.id;
                      const totalUnits = prop.totalUnits || prop.units?.length || 1;
                      const occupiedCount = prop.occupiedUnits || (prop.units ? prop.units.filter((u) => u.status === 'Occupied').length : 0);
                      const rateDisplay = prop.monthlyRate !== undefined ? prop.monthlyRate : prop.price || 0;

                      return (
                        <tr key={propId}>
                          <td className="pm-cell-title">{prop.title}</td>
                          <td className="pm-cell-muted">{prop.address}</td>
                          <td>{prop.propertyType}</td>
                          <td className="pm-cell-strong">
                            ₱{Number(rateDisplay).toLocaleString()}{prop.units?.length > 0 ? '/mo up' : ''}
                          </td>
                          <td>
                            <StatusPill status={occupiedCount > 0 ? `${occupiedCount}/${totalUnits} Occupied` : prop.status || 'Available'} />
                          </td>
                          <td className="text-center">
                            {['Apartment', 'Condo'].includes(prop.propertyType) || prop.units?.length > 0 ? (
                              <Button
                                variant="light"
                                size="sm"
                                className="pm-btn-edit-outline"
                                onClick={() =>
                                  setSelectedPropertyId(selectedPropertyId === propId ? null : propId)
                                }
                              >
                                {selectedPropertyId === propId ? 'Hide Units' : `Manage Units (${prop.units?.length || 0})`}
                              </Button>
                            ) : (
                              <span className="text-muted small me-2">No sub-units</span>
                            )}
                            <Button size="sm" variant="outline-primary" className="ms-2" onClick={() => openPropertyEditor(prop)}>Edit</Button>
                            <Button size="sm" variant="outline-danger" className="ms-2" onClick={() => handlePropertyArchive(prop)}>Archive</Button>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan="6" className="pm-empty-row">No matching properties found.</td>
                    </tr>
                  )}
                </tbody>
              </Table>
            </div>

            {/* Interactive Room Matrix Drawer */}
            {selectedPropertyObj && Array.isArray(selectedPropertyObj.units) && (
              <div className="pm-panel mb-4" data-workspace-section="properties" style={{ backgroundColor: '#fcfcfd' }}>
                <div className="pm-panel-header d-flex justify-content-between align-items-center">
                  <span>Unit breakdown — {selectedPropertyObj.title} ({selectedPropertyObj.units.length} Units)</span>
                  <Button size="sm" variant="primary" onClick={() => openUnitEditor(selectedPropertyObj)}>Add unit</Button>
                  <Button
                    variant="link"
                    size="sm"
                    className="text-decoration-none text-muted"
                    onClick={() => setSelectedPropertyId(null)}
                  >
                    Close matrix ✕
                  </Button>
                </div>
                <div style={{ padding: '22px' }}>
                  {selectedPropertyObj.units.length === 0 ? <div className="text-muted py-4 text-center">No units yet. Add the first unit to start managing unit availability and rent.</div> : <Row className="g-3">
                    {selectedPropertyObj.units.map((unit) => {
                      const unitId = unit._id || unit.id;
                      const isOccupied = unit.status === 'Occupied';
                      const isMaintenance = unit.status === 'Maintenance';
                      const isAvailable = unit.status === 'Available';

                      return (
                        <Col key={unitId || unit.unitNumber} xs={6} sm={4} md={3} lg={2.4}>
                          <div
                            className="p-3 rounded border text-center h-100 position-relative"
                            style={{
                              backgroundColor: isOccupied ? '#f0fdf4' : isMaintenance ? '#fffbeb' : '#ffffff',
                              borderColor: isOccupied ? '#bbf7d0' : isMaintenance ? '#fde68a' : '#e5e7eb',
                              cursor: isAvailable ? 'pointer' : 'default',
                            }}
                            onClick={() => isAvailable && handleOpenLeaseForUnit(selectedPropertyObj._id || selectedPropertyObj.id, unit)}
                          >
                            <div className="fw-bold fs-6 text-dark">{unit.unitNumber}</div>
                            <div className="fw-bold text-success my-1">
                              ₱{Number(unit.monthlyRate || 0).toLocaleString()}
                            </div>
                            <Badge
                              bg={isOccupied ? 'success' : isMaintenance ? 'warning' : 'secondary'}
                              className="text-capitalize"
                            >
                              {unit.status}
                            </Badge>
                            <Button size="sm" variant="outline-primary" className="mt-2 d-block mx-auto" onClick={(event) => { event.stopPropagation(); openUnitEditor(selectedPropertyObj, unit); }}>Manage</Button>
                            {isAvailable && (
                              <div className="text-muted text-xs mt-2" style={{ fontSize: '11px' }}>
                                Click to create lease
                              </div>
                            )}
                          </div>
                        </Col>
                      );
                    })}
                  </Row>}
                </div>
              </div>
            )}

            {/* Active Lease Contracts */}
            <div className="pm-panel mb-4" id="contracts" data-workspace-section="contracts">
              <ManagerContractSection
                contracts={contracts}
                onActivate={handleActivateLease}
                onTerminate={openTerminationForm}
                activatingContractId={activatingContractId}
              />
            </div>

            <ManagerProspectsSection
              inquiries={inquiries}
              applications={applications}
              properties={properties}
              contracts={contracts}
              inquiryPageInfo={managerPages.inquiries || { count: 0, page: 1, pageCount: 1 }}
              applicationPageInfo={managerPages.applications || { count: 0, page: 1, pageCount: 1 }}
              onInquiryPageChange={(page) => loadManagerData('inquiries', true, page)}
              onApplicationPageChange={(page) => loadManagerData('applications', true, page)}
              onInquiryStatusChange={handleInquiryStatusChange}
              onOpenLeaseForApplication={openLeaseForApplication}
              onApplicationReview={handleApplicationReview}
              managerReviewNotes={managerReviewNotes}
              onReviewNotesChange={(applicationId, value) => setManagerReviewNotes((current) => ({ ...current, [applicationId]: value }))}
            />
          </>
        )}

        <Modal show={showPropertyEditModal} onHide={() => setShowPropertyEditModal(false)} centered>
          <Modal.Header closeButton><Modal.Title>Edit property</Modal.Title></Modal.Header>
          {editingProperty && <Form onSubmit={handlePropertyEdit}>
            <Modal.Body>
              <Form.Group className="mb-3"><Form.Label>Property title</Form.Label><Form.Control value={editingProperty.title} onChange={(e) => setEditingProperty({ ...editingProperty, title: e.target.value })} required /></Form.Group>
              <Form.Group className="mb-3"><Form.Label>Address</Form.Label><Form.Control value={editingProperty.address} onChange={(e) => setEditingProperty({ ...editingProperty, address: e.target.value })} required /></Form.Group>
              <Form.Group className="mb-3"><Form.Label>Property type</Form.Label><Form.Select value={editingProperty.propertyType} onChange={(e) => setEditingProperty({ ...editingProperty, propertyType: e.target.value })}>{PROPERTY_TYPES.map((type) => <option key={type}>{type}</option>)}</Form.Select></Form.Group>
              <Form.Group className="mb-3"><Form.Label>Status</Form.Label><Form.Select value={editingProperty.status} onChange={(e) => setEditingProperty({ ...editingProperty, status: e.target.value })}>{PROPERTY_STATUSES.map((status) => <option key={status}>{status}</option>)}</Form.Select></Form.Group>
              <Form.Group>
                <Form.Label>Monthly base rate (₱)</Form.Label>
                <Form.Control
                  type="number" min="0.01" step="0.01" value={editingProperty.price}
                  onChange={(e) => setEditingProperty({ ...editingProperty, price: e.target.value })}
                  readOnly={!properties.find((property) => Number(property._id || property.id) === Number(editingProperty.id))?.managerUnitPricingAuthorized}
                  required
                />
                {!properties.find((property) => Number(property._id || property.id) === Number(editingProperty.id))?.managerUnitPricingAuthorized && (
                  <div className="d-flex flex-wrap align-items-center gap-2 mt-2">
                    <Form.Text className="text-muted">The Owner must approve any rent change.</Form.Text>
                    <Button type="button" size="sm" variant="outline-primary" onClick={() => openRentProposal(properties.find((property) => Number(property._id || property.id) === Number(editingProperty.id)), 'Property')}>Propose a different rate</Button>
                  </div>
                )}
              </Form.Group>
            </Modal.Body>
            <Modal.Footer><Button variant="light" onClick={() => setShowPropertyEditModal(false)}>Cancel</Button><Button type="submit">Save changes</Button></Modal.Footer>
          </Form>}
        </Modal>

        <Modal show={showUnitModal} onHide={() => setShowUnitModal(false)} centered>
          <Modal.Header closeButton>
            <Modal.Title>{unitData.id ? 'Manage unit' : 'Add unit'}</Modal.Title>
          </Modal.Header>
          <Form onSubmit={handleUnitSave}>
            <Modal.Body>
              <Form.Group className="mb-3">
                <Form.Label className="pm-form-label">Unit number</Form.Label>
                <Form.Control className="pm-input" value={unitData.unitNumber} onChange={(e) => setUnitData({ ...unitData, unitNumber: e.target.value })} required />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label className="pm-form-label">Monthly rent (₱)</Form.Label>
                <Form.Control className="pm-input" type="number" min="0.01" step="0.01" value={unitData.monthlyRate} onChange={(e) => setUnitData({ ...unitData, monthlyRate: e.target.value })} readOnly={!managerCanSetUnitRate} required />
                {!managerCanSetUnitRate && (
                  <div className="d-flex flex-wrap align-items-center gap-2 mt-2">
                    <Form.Text className="text-muted">
                      {unitData.id ? 'Owner approval is needed to change this unit’s rent.' : 'New units use the Owner-approved base rate. You can propose a different rate after adding the unit.'}
                    </Form.Text>
                    {unitData.id && <Button type="button" size="sm" variant="outline-primary" onClick={() => openRentProposal(unitDataProperty, 'Unit', unitDataUnit)}>Propose rent change</Button>}
                    {!unitData.id && <Button type="button" size="sm" variant="outline-primary" onClick={() => openRentProposal(unitDataProperty, 'Property')}>Propose base-rate change</Button>}
                  </div>
                )}
              </Form.Group>
              <Form.Group>
                <Form.Label className="pm-form-label">Availability</Form.Label>
                <Form.Select className="pm-input" value={unitData.status} onChange={(e) => setUnitData({ ...unitData, status: e.target.value })}>
                  {['Available', 'Occupied', 'Maintenance', 'Reserved'].map((status) => <option key={status}>{status}</option>)}
                </Form.Select>
              </Form.Group>
            </Modal.Body>
            <Modal.Footer className="justify-content-between">
              {unitData.id && <Button variant="outline-danger" onClick={handleUnitDelete}>Remove unit</Button>}
              <div className="ms-auto d-flex gap-2">
                <Button variant="light" onClick={() => setShowUnitModal(false)}>Cancel</Button>
                <Button variant="primary" type="submit">Save unit</Button>
              </div>
            </Modal.Footer>
          </Form>
        </Modal>

        <Modal show={showRentProposalModal} onHide={() => !savingRentProposal && setShowRentProposalModal(false)} centered dialogClassName="pm-modal">
          <Modal.Header closeButton>
            <Modal.Title>Propose a rent change</Modal.Title>
          </Modal.Header>
          <Form onSubmit={handleRentProposalSubmit}>
            <Modal.Body>
              <p className="text-muted">
                {rentProposalTarget?.property?.title} · {rentProposalTarget?.targetKind === 'Unit' ? `Unit ${rentProposalTarget?.unit?.unitNumber}` : 'Property base rate'}
              </p>
              <div className="small text-muted mb-3">
                Current rent: ₱{Number(rentProposalTarget?.currentRate || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} per month. It stays in effect unless the Owner approves this proposal.
              </div>
              <Form.Group className="mb-3">
                <Form.Label>Proposed monthly rent (₱)</Form.Label>
                <Form.Control type="number" min="0.01" step="0.01" value={rentProposalRate} onChange={(event) => setRentProposalRate(event.target.value)} required />
              </Form.Group>
              <Form.Group>
                <Form.Label>Reason for the change</Form.Label>
                <Form.Control as="textarea" rows={4} maxLength={2000} value={rentProposalReason} onChange={(event) => setRentProposalReason(event.target.value)} placeholder="Explain why you recommend this rent amount." required />
                <Form.Text className="text-muted">The Owner will review this explanation with the proposed amount.</Form.Text>
              </Form.Group>
            </Modal.Body>
            <Modal.Footer>
              <Button type="button" variant="outline-secondary" onClick={() => setShowRentProposalModal(false)} disabled={savingRentProposal}>Cancel</Button>
              <Button type="submit" disabled={savingRentProposal}>{savingRentProposal ? 'Sending…' : 'Send to Owner'}</Button>
            </Modal.Footer>
          </Form>
        </Modal>

        {/* Modal: Unit-Aware New Lease Contract */}
        <Modal show={showContractModal} onHide={() => { setShowContractModal(false); setApplicationForLease(null); }} centered dialogClassName="pm-modal">
          <Modal.Header closeButton>
            <Modal.Title>{applicationForLease ? `Create lease · ${applicationForLease.applicantName}` : 'Create lease contract'}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form onSubmit={handleContractSubmit}>
              {applicationForLease && <p className="text-muted small">Prepare the lease for the approved applicant. It will remain pending until everyone signs and an authorized person activates it. The tenant account email must match {applicationForLease.applicantEmail || 'the applicant email'}.</p>}
              {!applicationForLease && <p className="text-muted small">This creates a pending lease record. It becomes active only after all required parties sign and the Owner or an authorized manager records activation.</p>}
              <Form.Group className="mb-3">
                <Form.Label className="pm-form-label">Select property</Form.Label>
                <Form.Select
                  className="pm-input"
                  value={contractData.property}
                  onChange={(e) => handlePropertySelect(e.target.value)}
                  disabled={Boolean(applicationForLease)}
                  required
                >
                  <option value="">-- Choose property --</option>
                  {properties.map((p) => {
                    const propId = p._id || p.id;
                    return (
                      <option key={propId} value={propId}>
                        {p.title} ({p.units?.length > 0 ? `${p.units.length} Units` : 'Standalone House'})
                      </option>
                    );
                  })}
                </Form.Select>
              </Form.Group>

              {(() => {
                const selectedProp = properties.find((p) => (p._id || p.id)?.toString() === contractData.property?.toString());
                const availableUnits = selectedProp?.units?.filter((u) => u.status === 'Available') || [];

                if (selectedProp && selectedProp.units?.length > 0) {
                  return (
                    <Form.Group className="mb-3">
                      <Form.Label className="pm-form-label">Select room / unit</Form.Label>
                      <Form.Select
                        className="pm-input"
                        value={contractData.unitId}
                        onChange={(e) => handleUnitSelect(e.target.value)}
                        disabled={Boolean(applicationForLease)}
                        required
                      >
                        <option value="">-- Choose available unit --</option>
                        {availableUnits.map((u) => {
                          const unitId = u._id || u.id;
                          return (
                            <option key={unitId} value={unitId}>
                              {u.unitNumber} — ₱{Number(u.monthlyRate || 0).toLocaleString()}/mo
                            </option>
                          );
                        })}
                      </Form.Select>
                    </Form.Group>
                  );
                }
                return null;
              })()}

              <Form.Group className="mb-3">
                <Form.Label className="pm-form-label">Select tenant account</Form.Label>
                <Form.Select
                  className="pm-input"
                  value={contractData.tenant}
                  onChange={(e) => setContractData({ ...contractData, tenant: e.target.value })}
                  required
                >
                  <option value="">-- Choose tenant --</option>
                  {userList.map((u) => {
                    const userId = u._id || u.id;
                    return (
                      <option key={userId} value={userId}>
                        {u.name} ({u.email})
                      </option>
                    );
                  })}
                </Form.Select>
              </Form.Group>

              <Row className="mb-3">
                <Col md={6}>
                  <Form.Label className="pm-form-label">Start date</Form.Label>
                  <Form.Control
                    className="pm-input"
                    type="date"
                    value={contractData.startDate}
                    onChange={(e) => setContractData({
                      ...contractData,
                      startDate: e.target.value,
                      endDate: addMonthsToDate(e.target.value, leaseTermMonths),
                    })}
                    required
                  />
                </Col>
                <Col md={6}>
                  <Form.Label className="pm-form-label">End date</Form.Label>
                  <Form.Control
                    className="pm-input"
                    type="date"
                    value={contractData.endDate}
                    onChange={(e) => setContractData({ ...contractData, endDate: e.target.value })}
                    required
                  />
                </Col>
              </Row>

              <Form.Group className="mb-4">
                <Form.Label className="pm-form-label">Rent amount (₱)</Form.Label>
                <Form.Control
                  className="pm-input"
                  type="number"
                  value={contractData.rentAmount}
                  onChange={(e) => setContractData({ ...contractData, rentAmount: e.target.value })}
                  disabled={Boolean(applicationForLease)}
                  required
                />
              </Form.Group>

              <Form.Group className="mb-4">
                <Form.Label className="pm-form-label">Rent due day</Form.Label>
                <Form.Control
                  className="pm-input"
                  type="number"
                  min="1"
                  max="28"
                  step="1"
                  value={contractData.rentDueDay}
                  onChange={(e) => setContractData({ ...contractData, rentDueDay: e.target.value })}
                  required
                />
                <Form.Text className="text-muted">Rent will be due on this day each month (1–28).</Form.Text>
              </Form.Group>

              {!applicationForLease && (
                <div className="border rounded p-3 mb-3 bg-light">
                  <div className="fw-semibold mb-1">Existing or offline lease record</div>
                  <div className="text-muted small mb-3">Enter a reason or a reference to the existing lease. You can prepare this record, but the Owner or an Admin with the Owner’s instruction must activate it.</div>
                  <Form.Group className="mb-3">
                    <Form.Label className="pm-form-label">Reason (optional if a reference is provided)</Form.Label>
                    <Form.Control as="textarea" rows={2} value={contractData.manualLeaseReason} onChange={(e) => setContractData({ ...contractData, manualLeaseReason: e.target.value })} />
                  </Form.Group>
                  <Form.Group>
                    <Form.Label className="pm-form-label">Existing lease reference (optional if a reason is provided)</Form.Label>
                    <Form.Control value={contractData.manualLeaseReference} onChange={(e) => setContractData({ ...contractData, manualLeaseReference: e.target.value })} placeholder="File name, folder, or record ID" />
                  </Form.Group>
                </div>
              )}
              <Button variant="light" className="pm-btn-primary w-100 py-2" type="submit">
                Prepare lease
              </Button>
            </Form>
          </Modal.Body>
        </Modal>

        <Modal show={showManagerActivationModal} onHide={() => !activatingContractId && setShowManagerActivationModal(false)} centered dialogClassName="pm-modal">
          <Modal.Header closeButton><Modal.Title>Record signed lease</Modal.Title></Modal.Header>
          <Form onSubmit={handleManagerActivationSubmit}>
            <Modal.Body>
              <p className="text-muted">This lease came from an approved rental application. Confirm the parties signed and identify where the signed copy is stored.</p>
              <Form.Group className="mb-3">
                <Form.Label>Signed lease copy reference</Form.Label>
                <Form.Control value={signedCopyReference} onChange={(event) => setSignedCopyReference(event.target.value)} placeholder="File name, folder, or record ID" required />
              </Form.Group>
              <Form.Check type="checkbox" id="manager-confirm-lease-signatures" label="I confirm all required parties have signed the lease." required />
            </Modal.Body>
            <Modal.Footer>
              <Button variant="outline-secondary" onClick={() => setShowManagerActivationModal(false)} disabled={Boolean(activatingContractId)}>Cancel</Button>
              <Button variant="primary" type="submit" disabled={Boolean(activatingContractId)}>{activatingContractId ? 'Recording…' : 'Record activation'}</Button>
            </Modal.Footer>
          </Form>
        </Modal>

        <Modal show={showTerminationModal} onHide={() => setShowTerminationModal(false)} centered dialogClassName="pm-modal">
          <Modal.Header closeButton><Modal.Title>{contractForTermination?.status === 'Pending' ? 'Cancel pending lease' : 'End lease'}</Modal.Title></Modal.Header>
          <Form onSubmit={handleTerminateContract}>
            <Modal.Body>
              <p className="text-muted">This action requires authority recorded by the Owner and keeps a history of the lease.</p>
              <Form.Group className="mb-3">
                <Form.Label>Reason</Form.Label>
                <Form.Control as="textarea" rows={2} value={terminationReason} onChange={(event) => setTerminationReason(event.target.value)} required />
              </Form.Group>
              <Form.Group>
                <Form.Label>Effective date</Form.Label>
                <Form.Control type="date" value={terminationEffectiveDate} onChange={(event) => setTerminationEffectiveDate(event.target.value)} required />
              </Form.Group>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="outline-secondary" onClick={() => setShowTerminationModal(false)}>Cancel</Button>
              <Button variant="danger" type="submit">Record lease ending</Button>
            </Modal.Footer>
          </Form>
        </Modal>
      </Container>
    </div>
  );
}
