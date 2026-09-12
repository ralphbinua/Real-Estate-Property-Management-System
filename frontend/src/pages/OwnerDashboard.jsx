import { useState, useEffect, useMemo } from 'react';
import { Container, Table, Spinner } from 'react-bootstrap';
import { useAuth } from '../context/AuthContext';
import { fetchProperties } from '../services/propertyService';
import { fetchContracts } from '../services/contractService';
import './OwnerDashboard.css';

const PILL_CLASS = {
  available: 'pm-pill-available',
  rented: 'pm-pill-occupied',
  occupied: 'pm-pill-occupied',
  'under maintenance': 'pm-pill-maintenance',
  active: 'pm-pill-active',
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
  const [properties, setProperties] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadOwnerData = async () => {
    setLoading(true);
    try {
      const [propData, contractData] = await Promise.all([
        fetchProperties(),
        fetchContracts(),
      ]);
      setProperties(Array.isArray(propData) ? propData : []);
      setContracts(Array.isArray(contractData) ? contractData : []);
      setError('');
    } catch (err) {
      setError('Failed to fetch portfolio data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOwnerData();
  }, []);

  // Metrics Logic
  const metrics = useMemo(() => {
    const activeContracts = contracts.filter((c) => c.status?.toLowerCase() === 'active');
    return {
      totalOwned: properties.length,
      occupiedUnits: properties.filter((p) =>
        ['occupied', 'rented'].includes(p.status?.toLowerCase())
      ).length,
      totalMonthlyIncome: activeContracts.reduce((acc, curr) => acc + (curr.rentAmount || 0), 0),
    };
  }, [properties, contracts]);

  return (
    <div className="pm-owner">
      <Container>
        {/* Header */}
        <div className="pm-header">
          <div>
            <h1 className="pm-title">Owner Portfolio Overview</h1>
            <p className="pm-subtitle">
              Track asset performance, occupancy rates, and active rental income logs
            </p>
          </div>
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
                <span className="pm-metric-label">Occupied units</span>
                <span className="pm-metric-value">{metrics.occupiedUnits}</span>
              </div>
              <div className="pm-metric">
                <span className="pm-metric-label">Est. monthly revenue</span>
                <span className="pm-metric-value">₱{metrics.totalMonthlyIncome.toLocaleString()}</span>
              </div>
            </div>

            {/* Owned Property Table Panel */}
            <div className="pm-panel">
              <div className="pm-panel-header">
                Property assets directory ({properties.length})
              </div>
              <Table responsive className="pm-table mb-0">
                <thead>
                  <tr>
                    <th>Property title</th>
                    <th>Address</th>
                    <th>Type</th>
                    <th>Rental value</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {properties.length > 0 ? (
                    properties.map((prop) => (
                      <tr key={prop._id}>
                        <td className="pm-cell-title">{prop.title}</td>
                        <td className="pm-cell-muted">{prop.address}</td>
                        <td>{prop.propertyType}</td>
                        <td className="pm-cell-strong">₱{prop.price?.toLocaleString()}</td>
                        <td>
                          <StatusPill status={prop.status} />
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="5" className="pm-empty-row">
                        No property assets linked to your account.
                      </td>
                    </tr>
                  )}
                </tbody>
              </Table>
            </div>

            {/* Active Tenant Leases Panel */}
            <div className="pm-panel">
              <div className="pm-panel-header">Active tenant leases & monthly income</div>
              <Table responsive className="pm-table mb-0">
                <thead>
                  <tr>
                    <th>Property</th>
                    <th>Tenant name</th>
                    <th>Monthly rental</th>
                    <th>Lease status</th>
                  </tr>
                </thead>
                <tbody>
                  {contracts.length > 0 ? (
                    contracts.map((con) => (
                      <tr key={con._id}>
                        <td className="pm-cell-title">{con.property?.title || con.property}</td>
                        <td>{con.tenant?.name || con.tenant}</td>
                        <td className="pm-cell-strong">₱{con.rentAmount?.toLocaleString()}</td>
                        <td>
                          <StatusPill status={con.status} />
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="4" className="pm-empty-row">
                        No active lease contracts found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </Table>
            </div>
          </>
        )}
      </Container>
    </div>
  );
}