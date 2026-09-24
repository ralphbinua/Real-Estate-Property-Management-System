import { useState, useEffect, useMemo } from 'react';
import { Container, Table, Spinner, Badge, Tab, Tabs } from 'react-bootstrap';
import { useAuth } from '../context/AuthContext';
import { fetchOwnerPortfolio } from '../services/ownerService';
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
  const [portfolio, setPortfolio] = useState({ properties: [], contracts: [], maintenanceRequests: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadOwnerData = async () => {
    setLoading(true);
    try {
      const data = await fetchOwnerPortfolio();
      setPortfolio({
        properties: Array.isArray(data.properties) ? data.properties : [],
        contracts: Array.isArray(data.contracts) ? data.contracts : [],
        maintenanceRequests: Array.isArray(data.maintenanceRequests) ? data.maintenanceRequests : [],
      });
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch portfolio data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOwnerData();
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
    <div className="pm-owner">
      <Container>
        {/* Header */}
        <div className="pm-header">
          <div>
            <h1 className="pm-title">Owner Portfolio Overview</h1>
            <p className="pm-subtitle">
              Read-only asset tracking, unit occupancy rates, and active rental income logs
            </p>
          </div>
          <Badge bg="dark" className="px-3 py-2 fs-6">
            Owner Mode
          </Badge>
        </div>

        {error && (
          <div className="pm-alert pm-alert-error" role="alert">
            <span>{error}</span>
            <button className="pm-alert-close" onClick={() => setError('')} aria-label="Dismiss">×</button>
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
            <div className="pm-panel mb-4">
              <div className="pm-panel-header">Portfolio Details</div>
              <div style={{ padding: '20px' }}>
                <Tabs defaultActiveKey="properties" id="owner-tabs" className="mb-3">
                  
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
                          <th>Priority</th>
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
                                  <Badge bg={m.priority === 'High' ? 'danger' : 'info'}>
                                    {m.priority || 'Normal'}
                                  </Badge>
                                </td>
                                <td>
                                  <StatusPill status={m.status} />
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan="4" className="pm-empty-row">
                              No maintenance requests on record for your properties.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </Table>
                  </Tab>

                </Tabs>
              </div>
            </div>
          </>
        )}
      </Container>
    </div>
  );
}