import { Button } from 'react-bootstrap';
import Table from '../../components/ResponsiveTable.jsx';

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

export default function ManagerContractSection({ contracts, onActivate, onTerminate, activatingContractId }) {
  return (
    <>
      <div className="pm-panel-header">Lease contracts ({contracts.length})</div>
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
                <td><StatusPill status={contract.status} />{contract.activatedAt && <div className="small text-muted mt-1">{contract.activationBasis} · {new Date(contract.activatedAt).toLocaleDateString()}</div>}</td>
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
