import { Button } from 'react-bootstrap';
import Table from '../../components/ResponsiveTable.jsx';
import OwnerStatusPill from './OwnerStatusPill.jsx';

export default function OwnerContractsSection({ contracts, activatingContractId, onActivate, onTerminate }) {
  return (
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
          {contracts.length > 0 ? (
            contracts.map((contract) => {
              const contractId = contract._id || contract.id;
              const propertyTitle = contract.propertyDetails?.title || contract.property?.title || contract.property;
              const tenantName = contract.tenantDetails?.name || contract.tenant?.name || contract.tenant;

              return (
                <tr key={contractId}>
                  <td className="pm-cell-title">
                    {propertyTitle}
                    {(contract.unitDetails?.unitNumber || contract.unitNumber) && (contract.unitDetails?.unitNumber || contract.unitNumber) !== 'Main Unit'
                      ? ` (${contract.unitDetails?.unitNumber || contract.unitNumber})`
                      : ''}
                  </td>
                  <td>{tenantName} {contract.tenantDetails?.email || contract.tenant?.email ? `(${contract.tenantDetails?.email || contract.tenant?.email})` : ''}</td>
                  <td className="pm-cell-strong">
                    ₱{Number(contract.rentAmount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="pm-cell-muted small">
                    {contract.startDate ? new Date(contract.startDate).toLocaleDateString() : '—'} - {contract.endDate ? new Date(contract.endDate).toLocaleDateString() : '—'}
                  </td>
                  <td>
                    <OwnerStatusPill status={contract.status} />
                    {contract.status === 'Pending' && (
                      <div className="pm-contract-next-step">
                        Lease prepared. Waiting for all parties to sign outside the system.
                      </div>
                    )}
                    {contract.activatedAt && <div className="small text-muted mt-1">{contract.activationBasis ? `Authority: ${contract.activationBasis} · ` : ''}{new Date(contract.activatedAt).toLocaleDateString()}</div>}
                    {contract.signedCopyReference && <div className="pm-contract-reference">Signed copy: {contract.signedCopyReference}</div>}
                    {contract.terminationEffectiveDate && <div className="small text-muted mt-1">Ended effective {new Date(contract.terminationEffectiveDate).toLocaleDateString()}</div>}
                    {contract.terminationReason && <div className="small text-muted mt-1">{contract.terminationReason}</div>}
                  </td>
                  <td>
                    {contract.status === 'Pending' ? (
                      <Button size="sm" variant="primary" disabled={activatingContractId === contractId} onClick={() => onActivate(contract)}>
                        Record signatures &amp; activate
                      </Button>
                    ) : contract.activatedAt ? (
                      <span className="small text-muted d-block mb-2">Activated by {contract.activatedBy?.name || contract.activatedBy?.email || 'Owner'}</span>
                    ) : null}
                    {['Pending', 'Active'].includes(contract.status) && (
                      <Button size="sm" variant="outline-danger" onClick={() => onTerminate(contract)}>
                        {contract.status === 'Pending' ? 'Cancel pending lease' : 'End lease'}
                      </Button>
                    )}
                    {!['Pending', 'Active'].includes(contract.status) && '—'}
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
  );
}
