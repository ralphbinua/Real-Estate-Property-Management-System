import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Container, Form, Row, Col, Modal, Spinner, Button, Badge } from 'react-bootstrap';
import Table from '../components/ResponsiveTable.jsx';
import { fetchProperties, updateProperty, deleteProperty, setApplicationApprovalPolicy } from '../services/propertyService';
import { fetchContractsPage, createContract, terminateContract, activateContract } from '../services/contractService';
import { fetchUsers } from '../services/userService';
import { fetchInvoices } from '../services/invoiceService';
import { fetchOwnerPortfolio } from '../services/ownerService';
import PropertyForm from '../components/PropertyForm';
import UserManagement from '../components/UserManagement';
import AdminMaintenanceManager from '../components/AdminMaintenanceManager';
import ManagerInvoiceTracker from '../components/ManagerInvoiceTracker';
import ManagerReports from '../components/ManagerReports';
import AdminActivityLog from '../components/AdminActivityLog';
import AdminSystemSettings from '../components/AdminSystemSettings';
import { fetchSystemSettings } from '../services/systemSettingsService';
import { addMonthsToDate } from '../utils/dateUtils';
import { createUnit, deleteUnit, updateUnit } from '../services/unitService';
import CollectionPagination from '../components/CollectionPagination';
import useNotificationDeepLink from '../hooks/useNotificationDeepLink';
import DashboardHeader from '../components/DashboardHeader';
import './AdminDashboard.css';

const PROPERTY_TYPES = ['Condo', 'House', 'Apartment', 'Commercial'];
const PROPERTY_STATUSES = ['Available', 'Occupied', 'Pending', 'Under Maintenance'];

const PILL_CLASS = {
  available: 'pm-pill-available',
  rented: 'pm-pill-occupied',
  occupied: 'pm-pill-occupied',
  'under maintenance': 'pm-pill-maintenance',
  pending: 'pm-pill-pending',
  active: 'pm-pill-active',
  terminated: 'pm-pill-terminated',
  completed: 'pm-pill-terminated',
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

export default function AdminDashboard() {
  const [activeSection, setActiveSection] = useState('overview');
  const [properties, setProperties] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [contractPageInfo, setContractPageInfo] = useState({ count: 0, page: 1, pageCount: 1 });
  const [userList, setUserList] = useState([]);
  const [userChoicesLoaded, setUserChoicesLoaded] = useState(false);
  const [invoices, setInvoices] = useState([]);
  const [financialSummary, setFinancialSummary] = useState(null);
  const reportInvoicesLoaded = useRef(false);
  const [leaseTermMonths, setLeaseTermMonths] = useState(12);
  const [showUnitModal, setShowUnitModal] = useState(false);
  const [unitData, setUnitData] = useState({ id: null, property: '', unitNumber: '', monthlyRate: '', status: 'Available' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Selected property for viewing units
  const [selectedPropertyId, setSelectedPropertyId] = useState(null);

  // Search & Filter State
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Visibility & Modal Toggles
  const [showPropertyModal, setShowPropertyModal] = useState(false);
  const [showContractModal, setShowContractModal] = useState(false);
  const [showActivationModal, setShowActivationModal] = useState(false);
  const [contractForActivation, setContractForActivation] = useState(null);
  const [ownerInstruction, setOwnerInstruction] = useState('');
  const [ownerInstructionReference, setOwnerInstructionReference] = useState('');
  const [signedCopyReference, setSignedCopyReference] = useState('');
  const [manualLeaseReason, setManualLeaseReason] = useState('');
  const [manualLeaseReference, setManualLeaseReference] = useState('');
  const [activatingContract, setActivatingContract] = useState(false);
  const [showTerminationModal, setShowTerminationModal] = useState(false);
  const [contractForTermination, setContractForTermination] = useState(null);
  const [terminationReason, setTerminationReason] = useState('');
  const [terminationEffectiveDate, setTerminationEffectiveDate] = useState('');
  const [terminationInstruction, setTerminationInstruction] = useState('');
  const [terminationInstructionReference, setTerminationInstructionReference] = useState('');
  const [showApprovalPolicyModal, setShowApprovalPolicyModal] = useState(false);
  const [approvalPolicyProperty, setApprovalPolicyProperty] = useState(null);
  const [approvalPolicyMode, setApprovalPolicyMode] = useState('Owner');
  const [approvalPolicyInstruction, setApprovalPolicyInstruction] = useState('');
  const [approvalPolicyInstructionReference, setApprovalPolicyInstructionReference] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);

  // Form States
  const [editingProperty, setEditingProperty] = useState(null);
  const [contractData, setContractData] = useState({
    property: '',
    unit: '',
    tenant: '',
    startDate: '',
    endDate: '',
    rentAmount: '',
    rentDueDay: 1,
    manualLeaseReason: '',
    manualLeaseReference: '',
  });

  const loadData = useCallback(async () => {
    try {
      const [propData, contractsPage, summaryData] = await Promise.all([
        fetchProperties(),
        fetchContractsPage({ page: 1 }),
        fetchOwnerPortfolio('overview'),
      ]);
      setProperties(Array.isArray(propData) ? propData : []);
      setContracts(contractsPage.results);
      setContractPageInfo({
        count: contractsPage.count,
        page: 1,
        pageCount: Math.max(1, Math.ceil(contractsPage.count / 50)),
      });
      setFinancialSummary(summaryData.summary || null);
      setError('');
    } catch {
      setError('Failed to fetch dashboard data.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadReportInvoices = useCallback(async () => {
    if (reportInvoicesLoaded.current) return;
    try {
      const data = await fetchInvoices();
      setInvoices(Array.isArray(data) ? data : data.results || []);
      reportInvoicesLoaded.current = true;
    } catch {
      setError('Unable to load financial reports. Please try again.');
    }
  }, []);

  const loadUserChoices = async () => {
    if (userChoicesLoaded) return;
    try {
      const users = await fetchUsers();
      setUserList(Array.isArray(users) ? users : []);
      setUserChoicesLoaded(true);
    } catch {
      setError('Unable to load account choices. Please try again.');
    }
  };

  const openNewLeaseForm = async () => {
    await loadUserChoices();
    setContractData((current) => ({ ...current, rentDueDay: 1, manualLeaseReason: '', manualLeaseReference: '' }));
    setShowContractModal(true);
  };

  const refreshInvoiceSummaries = async () => {
    try {
      const summaryData = await fetchOwnerPortfolio('overview');
      setFinancialSummary(summaryData.summary || null);
      if (reportInvoicesLoaded.current) {
        const data = await fetchInvoices();
        setInvoices(Array.isArray(data) ? data : data.results || []);
      }
    } catch {
      // The ledger keeps its own refreshed data; the dashboard can refresh on next navigation.
    }
  };

  useEffect(() => {
    void Promise.resolve().then(loadData);
    fetchSystemSettings().then((settings) => setLeaseTermMonths(settings.default_lease_term_months || 12)).catch(() => {});
  }, [loadData]);

  useEffect(() => {
    const handleWorkspaceNavigation = (event) => {
      setActiveSection(event.detail);
      if (event.detail === 'reports') void loadReportInvoices();
    };
    window.addEventListener('workspace:navigate', handleWorkspaceNavigation);
    return () => window.removeEventListener('workspace:navigate', handleWorkspaceNavigation);
  }, [loadReportInvoices]);
  useNotificationDeepLink('admin');

  const handleDeleteProperty = async (id) => {
    setError('');
    setSuccess('');

    if (window.confirm('Are you sure you want to archive this property?')) {
      try {
        await deleteProperty(id);
        setSuccess('Property archived successfully!');
        loadData();
      } catch (err) {
        setError(err.response?.data?.detail || 'Failed to archive property.');
      }
    }
  };

  const handleEditClick = async (prop) => {
    await loadUserChoices();
    setEditingProperty({
      ...prop,
      _id: prop._id || prop.id,
      owner: prop.owner || prop.ownerDetails?._id || prop.ownerDetails?.id || '',
      manager: prop.manager || prop.managerDetails?._id || prop.managerDetails?.id || '',
      assignedAgents: prop.assignedAgents || [],
    });
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const payload = {
        title: editingProperty.title,
        address: editingProperty.address,
        propertyType: editingProperty.propertyType,
        status: editingProperty.status,
        owner: editingProperty.owner ? Number(editingProperty.owner) : null,
        manager: editingProperty.manager ? Number(editingProperty.manager) : null,
        assignedAgents: editingProperty.assignedAgents.map(Number),
      };

      await updateProperty(editingProperty._id || editingProperty.id, payload);
      setSuccess('Property updated successfully!');
      setShowEditModal(false);
      loadData();
    } catch {
      setError('Failed to update property details.');
    }
  };

  const handlePropertySelect = (propertyId) => {
    const selectedProp = properties.find((p) => (p._id || p.id)?.toString() === propertyId?.toString());
    const propId = selectedProp ? (selectedProp._id || selectedProp.id) : propertyId;
    setContractData({
      ...contractData,
      property: propId,
      unit: '',
      rentAmount: selectedProp ? selectedProp.monthlyRate || selectedProp.price || '' : ''
    });
  };

  const openUnitEditor = (property, unit = null) => {
    setUnitData({ id: unit?._id || null, property: property._id || property.id, unitNumber: unit?.unitNumber || '', monthlyRate: unit?.monthlyRate || '', status: unit?.status || 'Available' });
    setShowUnitModal(true);
  };

  const handleUnitSave = async (e) => {
    e.preventDefault();
    const payload = { property: Number(unitData.property), unitNumber: unitData.unitNumber, monthlyRate: Number(unitData.monthlyRate), status: unitData.status };
    try {
      if (unitData.id) await updateUnit(unitData.id, payload);
      else await createUnit(payload);
      setShowUnitModal(false);
      setSuccess(unitData.id ? 'Unit updated.' : 'Unit added.');
      await loadData();
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
      await loadData();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to remove unit.');
    }
  };

  const handleContractSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (new Date(contractData.endDate) <= new Date(contractData.startDate)) {
      setError('End Date must be strictly after Start Date.');
      return;
    }
    if (!contractData.manualLeaseReason.trim() && !contractData.manualLeaseReference.trim()) {
      setError('For an existing or offline tenancy, enter a reason or a reference to its current lease record.');
      return;
    }

    try {
      await createContract({
        ...contractData,
        unit: contractData.unit ? Number(contractData.unit) : null,
        rentAmount: Number(contractData.rentAmount),
        rentDueDay: Number(contractData.rentDueDay),
        manualLeaseReason: contractData.manualLeaseReason.trim(),
        manualLeaseReference: contractData.manualLeaseReference.trim(),
      });
      setSuccess('Lease prepared as pending. It becomes active only after signatures are confirmed and activation is recorded.');
      setContractData({ property: '', unit: '', tenant: '', startDate: '', endDate: '', rentAmount: '', rentDueDay: 1, manualLeaseReason: '', manualLeaseReference: '' });
      setShowContractModal(false);
      loadData();
    } catch (err) {
                  const details = err.response?.data || {};
                  setError(details.detail || details.manualLeaseReason?.[0] || details.tenant?.[0] || details.unit?.[0] || details.message || 'Failed to create contract.');
    }
  };

  const openTerminationForm = (contract) => {
    setContractForTermination(contract);
    setTerminationReason('');
    setTerminationEffectiveDate(new Date().toISOString().slice(0, 10));
    setTerminationInstruction('');
    setTerminationInstructionReference('');
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
        instructionNote: terminationInstruction.trim(),
        instructionReference: terminationInstructionReference.trim(),
      });
      setShowTerminationModal(false);
      setContractForTermination(null);
      setSuccess('Lease ended. Its contract history has been preserved.');
      await loadData();
    } catch (err) {
      const details = err.response?.data || {};
      setError(details.reason?.[0] || details.effectiveDate?.[0] || details.instructionNote?.[0] || details.instructionReference?.[0] || details.detail || 'Unable to end this lease.');
    }
  };

  const openActivationForm = (contract) => {
    setContractForActivation(contract);
    setOwnerInstruction('');
    setOwnerInstructionReference('');
    setSignedCopyReference('');
    setManualLeaseReason('');
    setManualLeaseReference('');
    setShowActivationModal(true);
  };

  const handleAdminActivateLease = async (event) => {
    event.preventDefault();
    if (!contractForActivation) return;
    setError('');
    setSuccess('');
    setActivatingContract(true);
    try {
      await activateContract(contractForActivation._id || contractForActivation.id, {
        signaturesComplete: true,
        signedCopyReference: signedCopyReference.trim(),
        manualLeaseReason: manualLeaseReason.trim(),
        manualLeaseReference: manualLeaseReference.trim(),
        instructionNote: ownerInstruction.trim(),
        instructionReference: ownerInstructionReference.trim(),
      });
      setShowActivationModal(false);
      setContractForActivation(null);
      setSuccess('Lease activation recorded under the Owner instruction.');
      await loadData();
    } catch (err) {
      const details = err.response?.data || {};
      setError(details.instructionNote?.[0] || details.instructionReference?.[0] || details.signedCopyReference?.[0] || details.manualLeaseReason?.[0] || details.detail || 'Unable to record this lease activation.');
    } finally {
      setActivatingContract(false);
    }
  };

  const openApprovalPolicyForm = (property) => {
    setApprovalPolicyProperty(property);
    setApprovalPolicyMode(property.applicationApprovalMode || 'Owner');
    setApprovalPolicyInstruction('');
    setApprovalPolicyInstructionReference('');
    setShowApprovalPolicyModal(true);
  };

  const handleApprovalPolicySubmit = async (event) => {
    event.preventDefault();
    if (!approvalPolicyProperty) return;
    setError('');
    setSuccess('');
    try {
      const propertyId = approvalPolicyProperty._id || approvalPolicyProperty.id;
      await setApplicationApprovalPolicy(propertyId, {
        applicationApprovalMode: approvalPolicyMode,
        instructionNote: approvalPolicyInstruction.trim(),
        instructionReference: approvalPolicyInstructionReference.trim(),
      });
      setShowApprovalPolicyModal(false);
      setApprovalPolicyProperty(null);
      setSuccess(`Application-approval rule updated for ${approvalPolicyProperty.title}.`);
      await loadData();
    } catch (err) {
      const details = err.response?.data || {};
      setError(details.instructionNote?.[0] || details.instructionReference?.[0] || details.applicationApprovalMode?.[0] || details.detail || 'Unable to update the application-approval rule.');
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
    let totalOccupiedUnits = 0;
    let totalUnits = 0;

    properties.forEach((p) => {
      if (Array.isArray(p.units) && p.units.length > 0) {
        totalUnits += p.units.length;
        totalOccupiedUnits += p.units.filter((u) => u.status === 'Occupied').length;
      } else {
        totalUnits += 1;
        if (['occupied', 'rented'].includes(p.status?.toLowerCase())) totalOccupiedUnits += 1;
      }
    });

    return {
      totalProperties: properties.length,
      occupiedCount: totalOccupiedUnits,
      totalUnits,
      vacantUnits: Math.max(0, totalUnits - totalOccupiedUnits),
      occupancyRate: totalUnits ? Math.round((totalOccupiedUnits / totalUnits) * 100) : 0,
      activeContracts: Number(financialSummary?.activeLeasesCount || 0),
      totalRevenue: Number(financialSummary?.activeLeasesRent || 0),
      pendingInvoices: Number(financialSummary?.pendingInvoices || 0),
      pendingPaymentReviews: Number(financialSummary?.paymentsAwaitingReview || 0),
    };
  }, [properties, financialSummary]);

  const selectedPropertyObj = useMemo(
    () => properties.find((p) => (p._id || p.id)?.toString() === selectedPropertyId?.toString()),
    [properties, selectedPropertyId]
  );

  const tenantUsers = useMemo(
    () => userList.filter((u) => u.isActive && u.role?.toLowerCase() === 'tenant'),
    [userList]
  );

  const ownerUsers = useMemo(
    () => userList.filter((u) => u.isActive && u.role?.toLowerCase() === 'owner'),
    [userList]
  );

  const managerUsers = useMemo(
    () => userList.filter((u) => u.isActive && u.role?.toLowerCase() === 'property manager'),
    [userList]
  );
  const agentUsers = useMemo(
    () => userList.filter((u) => u.isActive && u.role?.toLowerCase() === 'agent'),
    [userList]
  );

  return (
    <div className="pm-admin" data-active-section={activeSection}>
      <Container>
        <DashboardHeader role="admin" section={activeSection} overviewTitle="Admin Portal" overviewDescription="Review the portfolio, accounts, rent records, and maintenance.">
          {activeSection === 'contracts' && <Button variant="light" className="pm-btn-outline" onClick={() => { void openNewLeaseForm(); }}>New lease</Button>}
          {(activeSection === 'overview' || activeSection === 'properties') && <Button variant="light" className="pm-btn-primary" onClick={() => setShowPropertyModal(true)}>Add property</Button>}
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

        {loading ? (
          <div className="pm-loading">
            <Spinner animation="border" size="sm" className="me-2" />
            Synchronizing dashboard records…
          </div>
        ) : (
          <>
            {/* Metrics Strip */}
            <div className="pm-metrics" data-workspace-section="overview">
              <div className="pm-metric">
                <span className="pm-metric-label">Total properties</span>
                <span className="pm-metric-value">{metrics.totalProperties}</span>
              </div>
              <div className="pm-metric">
                <span className="pm-metric-label">Occupied units</span>
                <span className="pm-metric-value">{metrics.occupiedCount}</span>
              </div>
              <div className="pm-metric">
                <span className="pm-metric-label">Active contracts</span>
                <span className="pm-metric-value">{metrics.activeContracts}</span>
              </div>
              <div className="pm-metric">
                <span className="pm-metric-label">Monthly revenue</span>
                <span className="pm-metric-value">
                  ₱{Number(metrics.totalRevenue || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <section className="pm-panel pm-admin-overview-summary mb-4" data-workspace-section="overview" aria-label="Admin dashboard summary">
              <div className="pm-panel-header">Portfolio and operations summary</div>
              <div className="pm-admin-summary-grid">
                <div className="pm-admin-summary-item">
                  <span>Portfolio occupancy</span>
                  <strong>{metrics.occupancyRate}%</strong>
                  <small>{metrics.occupiedCount} of {metrics.totalUnits} units occupied</small>
                </div>
                <div className="pm-admin-summary-item">
                  <span>Vacant units</span>
                  <strong>{metrics.vacantUnits}</strong>
                  <small>Across {metrics.totalProperties} properties</small>
                </div>
                <div className="pm-admin-summary-item">
                  <span>Active accounts</span>
                  <strong>{userChoicesLoaded ? userList.filter((account) => account.isActive).length : '—'}</strong>
                  <small>{userChoicesLoaded ? `${tenantUsers.length} tenants · ${ownerUsers.length} owners · ${managerUsers.length} managers · ${agentUsers.length} agents` : 'Open User accounts to manage roles and access'}</small>
                </div>
                <div className="pm-admin-summary-item">
                  <span>Invoices with balance</span>
                  <strong>{metrics.pendingInvoices}</strong>
                  <small>{metrics.pendingPaymentReviews} payment submissions awaiting review</small>
                </div>
              </div>
            </section>

            {/* User Management Panel */}
            {activeSection === 'users' && (
              <div className="pm-panel" id="users" data-workspace-section="users">
                <div style={{ padding: '22px' }}>
                  <UserManagement />
                </div>
              </div>
            )}

            {/* Toolbar */}
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
                Property directory ({filteredProperties.length})
              </div>
              <Table responsive className="pm-table pm-properties-table mb-0">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Address</th>
                    <th>Type</th>
                    <th>Rent rate</th>
                    <th>Occupancy</th>
                    <th className="text-center">Actions</th>
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
                          <td className="pm-cell-strong pm-property-rate">
                            ₱{Number(rateDisplay).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            {prop.units?.length > 0 && <span className="pm-property-rate-note">per month and up</span>}
                          </td>
                          <td>
                            <StatusPill status={occupiedCount > 0 ? `${occupiedCount}/${totalUnits} Occupied` : prop.status || 'Available'} />
                          </td>
                          <td className="text-center">
                            <div className="pm-property-actions">
                              {(['Apartment', 'Condo'].includes(prop.propertyType) || prop.units?.length > 0) && (
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
                              )}
                              <Button
                                variant="light"
                                size="sm"
                                className="pm-btn-edit-outline"
                                onClick={() => handleEditClick(prop)}
                              >
                                Edit
                              </Button>
                              <Button variant="outline-secondary" size="sm" className="pm-btn-edit-outline" onClick={() => openApprovalPolicyForm(prop)}>
                                Approval rule
                              </Button>
                              <Button
                                variant="light"
                                size="sm"
                                className="pm-btn-danger-outline"
                                onClick={() => handleDeleteProperty(propId)}
                              >
                                Archive
                              </Button>
                            </div>
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

                      return (
                        <Col key={unitId || unit.unitNumber} xs={6} sm={4} md={3} lg={2.4}>
                          <div
                            className="p-3 rounded border text-center h-100"
                            style={{
                              backgroundColor: isOccupied ? '#f0fdf4' : isMaintenance ? '#fffbeb' : '#ffffff',
                              borderColor: isOccupied ? '#bbf7d0' : isMaintenance ? '#fde68a' : '#e5e7eb',
                            }}
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
                            <Button size="sm" variant="outline-primary" className="mt-2 d-block mx-auto" onClick={() => openUnitEditor(selectedPropertyObj, unit)}>Manage</Button>
                          </div>
                        </Col>
                      );
                    })}
                  </Row>}
                </div>
              </div>
            )}

            {/* Active Contracts */}
            <div className="pm-panel mb-4" id="reports" data-workspace-section="reports">
              <div className="pm-panel-header">System-wide property and financial reports</div>
              {activeSection === 'reports' && <div style={{ padding: '22px' }}><ManagerReports properties={properties} invoices={invoices} /></div>}
            </div>

            <div className="pm-panel mb-4" id="billing" data-workspace-section="billing">
              <div className="pm-panel-header">System-wide rent payments</div>
              {activeSection === 'billing' && <div style={{ padding: '22px' }}><ManagerInvoiceTracker onPaymentsUpdated={refreshInvoiceSummaries} /></div>}
            </div>

            <div className="pm-panel mb-4" id="activity" data-workspace-section="activity">
              <div className="pm-panel-header">System activity</div>
              {activeSection === 'activity' && <div style={{ padding: '22px' }}><AdminActivityLog /></div>}
            </div>

            <div className="pm-panel mb-4" id="settings" data-workspace-section="settings">
              <div className="pm-panel-header">System settings</div>
              {activeSection === 'settings' && <div style={{ padding: '22px', maxWidth: 640 }}><AdminSystemSettings /></div>}
            </div>

            {/* Active Contracts */}
            <div className="pm-panel mb-4" id="contracts" data-workspace-section="contracts">
              <div className="pm-panel-header">Lease contracts ({contractPageInfo.count})</div>
              <Table responsive className="pm-table mb-0">
                <thead>
                  <tr>
                    <th>Property / unit</th>
                    <th>Tenant</th>
                    <th>Rent amount</th>
                    <th>Status</th>
                    <th className="text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {contracts.length > 0 ? (
                    contracts.map((con) => {
                      const contractId = con._id || con.id;
                      const propertyTitle = con.propertyDetails?.title || con.property?.title || con.property;
                      const tenantName = con.tenantDetails?.name || con.tenant?.name || con.tenant;

                      return (
                        <tr key={contractId}>
                          <td className="pm-cell-title">
                            {propertyTitle}
                            {con.unitDetails?.unitNumber && con.unitDetails.unitNumber !== 'Main Unit' && ` · ${con.unitDetails.unitNumber}`}
                          </td>
                          <td>{tenantName}</td>
                          <td className="pm-cell-strong">₱{Number(con.rentAmount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td>
                            <StatusPill status={con.status} />
                            {con.activatedAt && (
                              <div className="small text-muted mt-1" title={con.activationNote || undefined}>
                                {con.activationBasis} · {con.activatedBy?.name || con.activatedBy?.email || 'recorded user'}
                              </div>
                            )}
                          </td>
                          <td className="text-center">
                            {con.status === 'Pending' && <Button variant="outline-primary" size="sm" className="me-2" onClick={() => openActivationForm(con)}>Record signed lease</Button>}
                            {['Pending', 'Active'].includes(con.status) && <Button variant="light" size="sm" className="pm-btn-end-lease" onClick={() => openTerminationForm(con)}>End lease</Button>}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan="5" className="pm-empty-row">No lease contracts recorded.</td>
                    </tr>
                  )}
                </tbody>
              </Table>
              <CollectionPagination
                count={contractPageInfo.count}
                page={contractPageInfo.page}
                pageCount={contractPageInfo.pageCount}
                onPageChange={async (page) => {
                  try {
                    const response = await fetchContractsPage({ page });
                    setContracts(response.results);
                    setContractPageInfo({ count: response.count, page, pageCount: Math.max(1, Math.ceil(response.count / 50)) });
                  } catch {
                    setError('Unable to load this page of leases. Please try again.');
                  }
                }}
              />
            </div>

            {/* Maintenance Manager */}
            <div className="pm-panel" id="maintenance" data-workspace-section="maintenance">
              <div className="pm-panel-header">Maintenance queue</div>
              <div style={{ padding: '22px' }}>
                {activeSection === 'maintenance' && <AdminMaintenanceManager />}
              </div>
            </div>
          </>
        )}

        {/* Modal: Add Property */}
        <Modal show={showPropertyModal} onHide={() => setShowPropertyModal(false)} size="lg" centered dialogClassName="pm-modal">
          <Modal.Header closeButton>
            <Modal.Title>Add new property</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <PropertyForm onPropertyCreated={() => { loadData(); setShowPropertyModal(false); }} />
          </Modal.Body>
        </Modal>

        {/* Modal: Edit Property */}
        {editingProperty && (
          <Modal show={showEditModal} onHide={() => setShowEditModal(false)} centered dialogClassName="pm-modal">
            <Modal.Header closeButton>
              <Modal.Title>Edit property details</Modal.Title>
            </Modal.Header>
            <Form onSubmit={handleEditSubmit}>
              <Modal.Body>
                <Form.Group className="mb-3">
                  <Form.Label className="pm-form-label">Title</Form.Label>
                  <Form.Control
                    className="pm-input"
                    value={editingProperty.title}
                    onChange={(e) => setEditingProperty({ ...editingProperty, title: e.target.value })}
                    required
                  />
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label className="pm-form-label">Address</Form.Label>
                  <Form.Control
                    className="pm-input"
                    value={editingProperty.address}
                    onChange={(e) => setEditingProperty({ ...editingProperty, address: e.target.value })}
                    required
                  />
                </Form.Group>
                <Row className="mb-3">
                  <Col md={6}>
                    <Form.Label className="pm-form-label">Property type</Form.Label>
                    <Form.Select
                      className="pm-input"
                      value={editingProperty.propertyType}
                      onChange={(e) => setEditingProperty({ ...editingProperty, propertyType: e.target.value })}
                    >
                      {PROPERTY_TYPES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </Form.Select>
                  </Col>
                  <Col md={6}>
                    <Form.Label className="pm-form-label">Status</Form.Label>
                    <Form.Select
                      className="pm-input"
                      value={editingProperty.status}
                      onChange={(e) => setEditingProperty({ ...editingProperty, status: e.target.value })}
                    >
                      {PROPERTY_STATUSES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </Form.Select>
                  </Col>
                </Row>
                <Row className="mb-3">
                  <Col md={6}>
                    <Form.Label className="pm-form-label">Assign Owner</Form.Label>
                    <Form.Select
                      className="pm-input"
                      value={editingProperty.owner || ''}
                      onChange={(e) => setEditingProperty({ ...editingProperty, owner: e.target.value })}
                    >
                      <option value="">-- Optional Owner --</option>
                      {ownerUsers.map((u) => {
                        const userId = u._id || u.id;
                        return (
                          <option key={userId} value={userId}>
                            {u.name} ({u.email})
                          </option>
                        );
                      })}
                    </Form.Select>
                  </Col>
                  <Col md={6}>
                    <Form.Label className="pm-form-label">Assign Manager</Form.Label>
                    <Form.Select
                      className="pm-input"
                      value={editingProperty.manager || ''}
                      onChange={(e) => setEditingProperty({ ...editingProperty, manager: e.target.value })}
                    >
                      <option value="">-- Optional Manager --</option>
                      {managerUsers.map((u) => {
                        const userId = u._id || u.id;
                        return (
                          <option key={userId} value={userId}>
                            {u.name} ({u.email})
                          </option>
                        );
                      })}
                    </Form.Select>
                  </Col>
                </Row>
                <Form.Group className="mb-3">
                  <Form.Label className="pm-form-label">Assign Agents</Form.Label>
                  <Form.Select
                    className="pm-input"
                    multiple
                    value={(editingProperty.assignedAgents || []).map(String)}
                    onChange={(e) => setEditingProperty({
                      ...editingProperty,
                      assignedAgents: Array.from(e.target.selectedOptions, (option) => Number(option.value)),
                    })}
                  >
                    {agentUsers.map((u) => {
                      const userId = u._id || u.id;
                      return <option key={userId} value={userId}>{u.name} ({u.email})</option>;
                    })}
                  </Form.Select>
                  <Form.Text className="text-muted">Hold Ctrl (Windows) or Command (Mac) to select multiple agents.</Form.Text>
                </Form.Group>
              </Modal.Body>
              <Modal.Footer>
                <Button variant="light" className="pm-btn-ghost" onClick={() => setShowEditModal(false)}>Cancel</Button>
                <Button variant="light" className="pm-btn-primary" type="submit">Save changes</Button>
              </Modal.Footer>
            </Form>
          </Modal>
        )}

        <Modal show={showUnitModal} onHide={() => setShowUnitModal(false)} centered>
          <Modal.Header closeButton><Modal.Title>{unitData.id ? 'Manage unit' : 'Add unit'}</Modal.Title></Modal.Header>
          <Form onSubmit={handleUnitSave}>
            <Modal.Body>
              <Form.Group className="mb-3"><Form.Label>Unit number</Form.Label><Form.Control value={unitData.unitNumber} onChange={(e) => setUnitData({ ...unitData, unitNumber: e.target.value })} required /></Form.Group>
              <Form.Group className="mb-3"><Form.Label>Monthly rent (₱)</Form.Label><Form.Control type="number" min="0" step="0.01" value={unitData.monthlyRate} onChange={(e) => setUnitData({ ...unitData, monthlyRate: e.target.value })} required /></Form.Group>
              <Form.Group><Form.Label>Status</Form.Label><Form.Select value={unitData.status} onChange={(e) => setUnitData({ ...unitData, status: e.target.value })}>{['Available', 'Occupied', 'Maintenance', 'Reserved'].map((status) => <option key={status}>{status}</option>)}</Form.Select></Form.Group>
            </Modal.Body>
            <Modal.Footer className="justify-content-between">
              {unitData.id && <Button variant="outline-danger" onClick={handleUnitDelete}>Remove unit</Button>}
              <div className="ms-auto d-flex gap-2"><Button variant="light" onClick={() => setShowUnitModal(false)}>Cancel</Button><Button type="submit">Save unit</Button></div>
            </Modal.Footer>
          </Form>
        </Modal>

        {/* Modal: New Lease Contract */}
          <Modal show={showContractModal} onHide={() => setShowContractModal(false)} centered dialogClassName="pm-modal">
          <Modal.Header closeButton>
            <Modal.Title>Prepare lease contract</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form onSubmit={handleContractSubmit}>
              <p className="text-muted small">This creates a pending lease record and reserves the selected unit. It does not sign or activate the lease.</p>
              <Form.Group className="mb-3">
                <Form.Label className="pm-form-label">Select property</Form.Label>
                <Form.Select
                  className="pm-input"
                  value={contractData.property}
                  onChange={(e) => handlePropertySelect(e.target.value)}
                  required
                >
                  <option value="">-- Choose property --</option>
                  {properties.map((p) => {
                    const propId = p._id || p.id;
                    return (
                      <option key={propId} value={propId}>
                        {p.title} (₱{Number(p.monthlyRate || p.price || 0).toLocaleString()}/mo)
                      </option>
                    );
                  })}
                </Form.Select>
              </Form.Group>
              {properties.find((property) => String(property._id || property.id) === String(contractData.property))?.units?.length > 1 && (
                <Form.Group className="mb-3">
                  <Form.Label className="pm-form-label">Select available unit</Form.Label>
                  <Form.Select className="pm-input" value={contractData.unit} onChange={(e) => {
                    const property = properties.find((item) => String(item._id || item.id) === String(contractData.property));
                    const unit = property?.units?.find((item) => String(item._id) === e.target.value);
                    setContractData({ ...contractData, unit: e.target.value, rentAmount: unit?.monthlyRate || contractData.rentAmount });
                  }} required>
                    <option value="">-- Choose available unit --</option>
                    {properties.find((property) => String(property._id || property.id) === String(contractData.property))?.units?.filter((unit) => unit.status === 'Available').map((unit) => (
                      <option key={unit._id} value={unit._id}>{unit.unitNumber} — ₱{Number(unit.monthlyRate || 0).toLocaleString()}/mo</option>
                    ))}
                  </Form.Select>
                </Form.Group>
              )}
              <Form.Group className="mb-3">
                <Form.Label className="pm-form-label">Select tenant account</Form.Label>
                <Form.Select
                  className="pm-input"
                  value={contractData.tenant}
                  onChange={(e) => setContractData({ ...contractData, tenant: e.target.value })}
                  required
                >
                  <option value="">-- Choose tenant --</option>
                  {tenantUsers.map((u) => {
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
              <div className="border rounded p-3 mb-3 bg-light">
                <div className="fw-semibold mb-1">Existing or offline lease record</div>
                <div className="text-muted small mb-3">Provide a short reason or a reference to the existing signed lease. The Owner or an Admin with the Owner’s written instruction must activate it.</div>
                <Form.Group className="mb-3">
                  <Form.Label className="pm-form-label">Reason (optional if a reference is provided)</Form.Label>
                  <Form.Control as="textarea" rows={2} value={contractData.manualLeaseReason} onChange={(e) => setContractData({ ...contractData, manualLeaseReason: e.target.value })} />
                </Form.Group>
                <Form.Group>
                  <Form.Label className="pm-form-label">Existing lease reference (optional if a reason is provided)</Form.Label>
                  <Form.Control value={contractData.manualLeaseReference} onChange={(e) => setContractData({ ...contractData, manualLeaseReference: e.target.value })} placeholder="File name, folder, or record ID" />
                </Form.Group>
              </div>
              <Button variant="light" className="pm-btn-primary w-100 py-2" type="submit">
                Prepare lease
              </Button>
            </Form>
          </Modal.Body>
        </Modal>

        <Modal
          show={showActivationModal}
          onHide={() => !activatingContract && setShowActivationModal(false)}
          centered
          dialogClassName="pm-modal"
        >
          <Modal.Header closeButton>
            <Modal.Title>Record signed lease</Modal.Title>
          </Modal.Header>
          <Form onSubmit={handleAdminActivateLease}>
            <Modal.Body>
              <p>
                This is an administrative override for <strong>{contractForActivation?.propertyDetails?.title || 'this property'}</strong>.
                The Admin records the activation but does not sign the lease or replace the Owner's authority.
              </p>
              <Form.Group className="mb-3">
                <Form.Label>Signed lease copy reference</Form.Label>
                <Form.Control value={signedCopyReference} onChange={(event) => setSignedCopyReference(event.target.value)} placeholder="File name, folder, or record ID" required />
              </Form.Group>
              {!contractForActivation?.sourceApplication && (
                <div className="border rounded p-3 mb-3 bg-light">
                  <div className="fw-semibold mb-2">Existing or offline lease record</div>
                  <Form.Group className="mb-3">
                    <Form.Label>Reason (optional if a reference is provided)</Form.Label>
                    <Form.Control as="textarea" rows={2} value={manualLeaseReason} onChange={(event) => setManualLeaseReason(event.target.value)} />
                  </Form.Group>
                  <Form.Group>
                    <Form.Label>Existing lease reference (optional if a reason is provided)</Form.Label>
                    <Form.Control value={manualLeaseReference} onChange={(event) => setManualLeaseReference(event.target.value)} />
                  </Form.Group>
                </div>
              )}
              <Form.Group className="mb-3">
                <Form.Label>Owner instruction</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={3}
                  value={ownerInstruction}
                  onChange={(event) => setOwnerInstruction(event.target.value)}
                  placeholder="Describe the Owner's instruction to record this lease"
                  required
                />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Instruction reference</Form.Label>
                <Form.Control
                  value={ownerInstructionReference}
                  onChange={(event) => setOwnerInstructionReference(event.target.value)}
                  placeholder="Email, letter, or other record reference"
                  required
                />
              </Form.Group>
              <Form.Check
                type="checkbox"
                id="admin-confirm-signatures-complete"
                label="I confirm all required parties have signed the lease."
                required
              />
            </Modal.Body>
            <Modal.Footer>
              <Button variant="outline-secondary" onClick={() => setShowActivationModal(false)} disabled={activatingContract}>Cancel</Button>
              <Button variant="primary" type="submit" disabled={activatingContract}>
                {activatingContract ? 'Recording…' : 'Record activation'}
              </Button>
            </Modal.Footer>
          </Form>
        </Modal>

        <Modal show={showApprovalPolicyModal} onHide={() => setShowApprovalPolicyModal(false)} centered dialogClassName="pm-modal">
          <Modal.Header closeButton>
            <Modal.Title>Application approval rule</Modal.Title>
          </Modal.Header>
          <Form onSubmit={handleApprovalPolicySubmit}>
            <Modal.Body>
              <p className="text-muted">{approvalPolicyProperty?.title}: choose who reviews and decides rental applications.</p>
              <Form.Group className="mb-3">
                <Form.Label>Decision authority</Form.Label>
                <Form.Select value={approvalPolicyMode} onChange={(event) => setApprovalPolicyMode(event.target.value)}>
                  <option value="Owner">Manager reviews; Owner makes the final decision</option>
                  <option value="Manager">Assigned Manager reviews and decides under Owner delegation</option>
                </Form.Select>
              </Form.Group>
              {approvalPolicyMode !== (approvalPolicyProperty?.applicationApprovalMode || 'Owner') && (
                <>
                  <Form.Group className="mb-3">
                    <Form.Label>Owner instruction</Form.Label>
                    <Form.Control as="textarea" rows={3} value={approvalPolicyInstruction} onChange={(event) => setApprovalPolicyInstruction(event.target.value)} placeholder="Describe the Owner’s instruction for this rule change" required />
                  </Form.Group>
                  <Form.Group>
                    <Form.Label>Instruction reference</Form.Label>
                    <Form.Control value={approvalPolicyInstructionReference} onChange={(event) => setApprovalPolicyInstructionReference(event.target.value)} placeholder="Email, letter, or agreement reference" required />
                  </Form.Group>
                </>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button variant="outline-secondary" onClick={() => setShowApprovalPolicyModal(false)}>Cancel</Button>
              <Button variant="primary" type="submit">Save rule</Button>
            </Modal.Footer>
          </Form>
        </Modal>

        <Modal show={showTerminationModal} onHide={() => setShowTerminationModal(false)} centered dialogClassName="pm-modal">
          <Modal.Header closeButton><Modal.Title>End lease</Modal.Title></Modal.Header>
          <Form onSubmit={handleTerminateContract}>
            <Modal.Body>
              <p className="text-muted">This keeps the lease record and records why and when it ended. Confirm the Owner’s instruction before continuing.</p>
              <Form.Group className="mb-3">
                <Form.Label>Reason</Form.Label>
                <Form.Control as="textarea" rows={2} value={terminationReason} onChange={(event) => setTerminationReason(event.target.value)} required />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Effective date</Form.Label>
                <Form.Control type="date" value={terminationEffectiveDate} onChange={(event) => setTerminationEffectiveDate(event.target.value)} required />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Owner instruction</Form.Label>
                <Form.Control as="textarea" rows={2} value={terminationInstruction} onChange={(event) => setTerminationInstruction(event.target.value)} required />
              </Form.Group>
              <Form.Group>
                <Form.Label>Instruction reference</Form.Label>
                <Form.Control value={terminationInstructionReference} onChange={(event) => setTerminationInstructionReference(event.target.value)} placeholder="Email, letter, or other record reference" required />
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
