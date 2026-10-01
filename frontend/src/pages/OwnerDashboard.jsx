import { useState, useEffect, useMemo } from 'react';
import { Container, Table, Spinner, Badge, Tab, Tabs, Button, Form, Modal, Row, Col } from 'react-bootstrap';
import { useAuth } from '../context/AuthContext';
import { fetchOwnerPortfolio } from '../services/ownerService';
import { fetchApplications, reviewApplication } from '../services/applicationService';
import { createProperty } from '../services/propertyService';
import './OwnerDashboard.css';

const PILL_CLASS = {
  available: 'pm-pill-available',
  rented: 'pm-pill-occupied',
  occupied: 'pm-pill-occupied',
  'under maintenance': 'pm-pill-maintenance',
  active: 'pm-pill-active',
  terminated: 'pm-pill-terminated',
  pending: 'pm-pill-occupied',
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
  const [portfolio, setPortfolio] = useState({ properties: [], contracts: [], maintenanceRequests: [], invoices: [] });
  const [ownerApprovals, setOwnerApprovals] = useState([]);
  const [ownerReviewNotes, setOwnerReviewNotes] = useState({});
  const [savingOwnerDecisionId, setSavingOwnerDecisionId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activePortfolioTab, setActivePortfolioTab] = useState('properties');
  const [showPropertyModal, setShowPropertyModal] = useState(false);
  const [savingProperty, setSavingProperty] = useState(false);
  const [propertyDraft, setPropertyDraft] = useState({
    title: '',
    address: '',
    propertyType: 'Apartment',
    price: '',
    units: [{ unitNumber: '101', monthlyRate: '' }],
  });

  const loadOwnerData = async () => {
    setLoading(true);
    try {
      const [portfolioResult, approvalsResult] = await Promise.allSettled([fetchOwnerPortfolio(), fetchApplications()]);
      if (portfolioResult.status === 'rejected') throw portfolioResult.reason;
      const data = portfolioResult.value;
      setPortfolio({
        properties: Array.isArray(data.properties) ? data.properties : [],
        contracts: Array.isArray(data.contracts) ? data.contracts : [],
        maintenanceRequests: Array.isArray(data.maintenanceRequests) ? data.maintenanceRequests : [],
        invoices: Array.isArray(data.invoices) ? data.invoices : [],
      });
      if (approvalsResult.status === 'fulfilled') {
        setOwnerApprovals(Array.isArray(approvalsResult.value) ? approvalsResult.value : []);
        setError('');
      } else {
        setOwnerApprovals([]);
        setError('Your portfolio loaded, but application approvals could not be fetched. Please refresh or contact an administrator.');
      }
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
        price: Number(propertyDraft.price || (hasUnits ? propertyDraft.units[0]?.monthlyRate : 0) || 0),
        units,
      });
      setPropertyDraft({ title: '', address: '', propertyType: 'Apartment', price: '', units: [{ unitNumber: '101', monthlyRate: '' }] });
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

    return {
      totalOwned: properties.length,
      totalUnits,
      occupiedUnits,
      occupancyRate,
      totalMonthlyIncome,
      activeLeasesCount: activeContracts.length,
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
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan="5" className="pm-empty-row">
                              No property assets linked to your owner account.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </Table>
                  </Tab>

                  <Tab eventKey="approvals" title={`Application approvals (${ownerApprovals.length})`}>
                    <Table responsive className="pm-table mb-0">
                      <thead>
                        <tr>
                          <th>Applicant</th>
                          <th>Property / unit</th>
                          <th>Employment</th>
                          <th>Monthly income</th>
                          <th>Requested move-in</th>
                          <th>Manager review</th>
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
                            <td style={{ minWidth: 240 }}>
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
                            </td>
                          </tr>
                        ))}
                        {ownerApprovals.length === 0 && (
                          <tr><td colSpan="7" className="pm-empty-row">No applications are waiting for your decision.</td></tr>
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
                                  {con.unitNumber && con.unitNumber !== 'Main Unit' ? ` (${con.unitNumber})` : ''}
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
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan="5" className="pm-empty-row">
                              No active lease contracts found.
                            </td>
                          </tr>
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
                    <Table responsive className="pm-table mb-0">
                      <thead><tr><th>Property</th><th>Tenant</th><th>Amount due</th><th>Due date</th><th>Status</th><th>Paid</th></tr></thead>
                      <tbody>
                        {portfolio.invoices.map((invoice) => (
                          <tr key={invoice._id}>
                            <td>{invoice.propertyDetails?.title || 'Property'}</td>
                            <td>{invoice.tenantDetails?.name || 'Tenant'}</td>
                            <td>₱{Number(invoice.totalDue || invoice.amount || 0).toLocaleString()}</td>
                            <td>{invoice.dueDate}</td>
                            <td><StatusPill status={invoice.status} /></td>
                            <td>{invoice.paidAt ? new Date(invoice.paidAt).toLocaleDateString() : '—'}</td>
                          </tr>
                        ))}
                        {portfolio.invoices.length === 0 && <tr><td colSpan="6" className="text-center text-muted py-4">No payment records found for your properties.</td></tr>}
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
    </div>
  );
}
