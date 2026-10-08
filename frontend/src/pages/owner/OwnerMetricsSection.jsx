export default function OwnerMetricsSection({ metrics }) {
  return (
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
        <span className="pm-metric-label">Monthly lease rent</span>
        <span className="pm-metric-value">
          {metrics.totalMonthlyIncome === null ? 'Unavailable' : `₱${metrics.totalMonthlyIncome.toLocaleString('en-PH', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`}
        </span>
      </div>
      <div className="pm-metric">
        <span className="pm-metric-label">Active leases</span>
        <span className="pm-metric-value">{metrics.activeLeasesCount}</span>
      </div>
    </div>
  );
}
