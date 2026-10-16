import { Button } from 'react-bootstrap';
import Table from '../../components/ui/ResponsiveTable.jsx';
import RenewalControls from '../../components/leases/RenewalControls.jsx';
import ExportCsvButton from '../../components/ui/ExportCsvButton.jsx';
import LeaseTurnoverControls from '../../components/leases/LeaseTurnoverControls.jsx';

const STATUS_CLASS = {
  pending: 'pm-pill-pending',
  active: 'pm-pill-active',
  terminated: 'pm-pill-terminated',
  expired: 'pm-pill-default',
};

function StatusPill({ status }) {
  if (!status) return null;
  return <span className={`pm-pill ${STATUS_CLASS[status.toLowerCase()] || 'pm-pill-default'}`}><span className="pm-pill-dot" />{status}</span>;
}

export default function ManagerContractSection({ contracts, onActivate, onTerminate, onRenewalUpdated, activatingContractId }) {
  const expiringCount = contracts.filter((contract) => contract.status === 'Active'
    && (new Date(`${contract.endDate}T00:00:00`) - new Date()) / 86400000 <= 60
    && (new Date(`${contract.endDate}T00:00:00`) - new Date()) / 86400000 >= -1).length;
  return (
    <>
      <div className="pm-panel-header">Lease contracts ({contracts.length})</div>
      <div className="d-flex justify-content-end p-2"><ExportCsvButton resource="contracts" /></div>
      {expiringCount > 0 && <p className="small text-warning mb-3">{expiringCount} lease{expiringCount === 1 ? '' : 's'} approaching the end date. Review renewal or move-out plans.</p>}
      <Table responsive className="pm-table mb-0">
        <thead><tr><th>Property / Unit</th><th>Tenant</th><th>Rent amount</th><th>Status</th><th className="text-center">Action</th></tr></thead>
        <tbody>
          {contracts.length > 0 ? contracts.map((contract) => {
            const id = contract._id || contract.id;
            const propertyTitle = contract.propertyDetails?.title || contract.property?.title || contract.property;
            const tenantName = contract.tenantDetails?.name || contract.tenant?.name || contract.tenant;
            const unitNumber = contract.unitDetails?.unitNumber || contract.unitNumber;
            const unitLabel = unitNumber && unitNumber !== 'Main Unit' ? ` (${unitNumber})` : '';
            return (
              <tr key={id}>
                <td className="pm-cell-title">{propertyTitle}{unitLabel}</td>
                <td>{tenantName}</td>
                <td className="pm-cell-strong">₱{Number(contract.rentAmount || 0).toLocaleString()}</td>
                <td><StatusPill status={contract.status} />{contract.activatedAt && <div className="small text-muted mt-1">{contract.activationBasis} · {new Date(contract.activatedAt).toLocaleDateString()}</div>}<RenewalControls contract={contract} role="manager" onUpdated={onRenewalUpdated} /><LeaseTurnoverControls contract={contract} role="manager" canMoveOut={contract.propertyDetails?.managerLeaseTerminationAuthorized} onUpdated={onRenewalUpdated} /></td>
                <td className="text-center">
                  {contract.status === 'Pending' && contract.sourceApplication && contract.propertyDetails?.managerLeaseSigningAuthorized && <Button variant="primary" size="sm" className="me-2" disabled={activatingContractId === id} onClick={() => onActivate(contract)}>{activatingContractId === id ? 'Recording…' : 'Record signed lease'}</Button>}
                  {contract.status === 'Pending' && !contract.sourceApplication && <span className="small text-muted me-2">Owner/Admin activates manual leases</span>}
                  {contract.status === 'Pending' && contract.sourceApplication && !contract.propertyDetails?.managerLeaseSigningAuthorized && <span className="small text-muted me-2">Owner can activate or grant signing authority</span>}
                  {['Pending', 'Active'].includes(contract.status) && contract.propertyDetails?.managerLeaseTerminationAuthorized && <Button variant="light" size="sm" className="pm-btn-end-lease" onClick={() => onTerminate(contract)}>{contract.status === 'Pending' ? 'Cancel lease' : 'End lease'}</Button>}
                  {['Pending', 'Active'].includes(contract.status) && !contract.propertyDetails?.managerLeaseTerminationAuthorized && <span className="small text-muted">Owner retains lease-ending authority</span>}
                </td>
              </tr>
            );
          }) : <tr><td colSpan="5" className="pm-empty-row">No lease contracts recorded.</td></tr>}
        </tbody>
      </Table>
    </>
  );
}
