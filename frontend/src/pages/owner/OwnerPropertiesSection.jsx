import { Button, Form } from 'react-bootstrap';
import Table from '../../components/ResponsiveTable.jsx';
import OwnerStatusPill from './OwnerStatusPill.jsx';
import { getOwnerPropertyMetrics } from './ownerDashboardPresentation.js';

export default function OwnerPropertiesSection({
  properties,
  contracts,
  approvalModeDrafts,
  savingApprovalPropertyId,
  onApprovalModeChange,
  onApprovalPolicySave,
  onLeaseAuthorityClick,
}) {
  return (
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
            {properties.length > 0 ? (
              properties.map((property) => {
                const propertyId = property._id || property.id;
                const { totalUnits, occupiedCount, yieldAmt } = getOwnerPropertyMetrics(property, contracts);
                const savedApprovalMode = property.applicationApprovalMode || 'Owner';
                const selectedApprovalMode = approvalModeDrafts[propertyId] || savedApprovalMode;
                const approvalRuleUnchanged = selectedApprovalMode === savedApprovalMode;

                return (
                  <tr key={propertyId}>
                    <td data-label="Property">
                      <div className="pm-owner-property-title">{property.title}</div>
                      <div className="pm-owner-property-meta">
                        <span>{property.address}</span>
                        <span className="pm-owner-property-type">{property.propertyType}</span>
                      </div>
                    </td>
                    <td data-label="Occupancy &amp; yield">
                      <div className="pm-owner-property-metrics">
                        <div className="pm-owner-property-metric">
                          <span className="pm-owner-control-label">Occupied</span>
                          <OwnerStatusPill status={`${occupiedCount}/${totalUnits} occupied`} />
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
                          id={`approval-rule-${propertyId}`}
                          size="sm"
                          aria-label={`Application approval rule for ${property.title}`}
                          value={selectedApprovalMode}
                          onChange={(event) => onApprovalModeChange(propertyId, event.target.value)}
                        >
                          <option value="Owner">Owner reviews applications</option>
                          <option value="Manager" disabled={!property.managerDetails}>Manager reviews applications</option>
                        </Form.Select>
                        {savingApprovalPropertyId === propertyId ? (
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
                            onClick={() => onApprovalPolicySave(property)}
                          >
                            Save changes
                          </Button>
                        )}
                      </div>
                    </td>
                    <td data-label="Manager authority">
                      {property.managerDetails ? (
                        <div className="pm-owner-authority-control">
                          <div className="pm-owner-manager-name">{property.managerDetails.name || property.managerDetails.email}</div>
                          <div className="pm-owner-authority-row">
                            <span className="pm-owner-authority-label">Sign leases</span>
                            <span className={`pm-owner-authority-state ${property.managerLeaseSigningAuthorized ? 'is-authorized' : ''}`}>
                              {property.managerLeaseSigningAuthorized ? 'Authorized' : 'Not authorized'}
                            </span>
                            <Button
                              size="sm"
                              variant={property.managerLeaseSigningAuthorized ? 'outline-danger' : 'outline-primary'}
                              aria-label={`${property.managerLeaseSigningAuthorized ? 'Revoke' : 'Grant'} lease signing authority for ${property.managerDetails.name || property.managerDetails.email}`}
                              onClick={() => onLeaseAuthorityClick(property, 'signing')}
                            >
                              {property.managerLeaseSigningAuthorized ? 'Revoke' : 'Grant'}
                            </Button>
                          </div>
                          <div className="pm-owner-authority-row">
                            <span className="pm-owner-authority-label">End leases</span>
                            <span className={`pm-owner-authority-state ${property.managerLeaseTerminationAuthorized ? 'is-authorized' : ''}`}>
                              {property.managerLeaseTerminationAuthorized ? 'Authorized' : 'Not authorized'}
                            </span>
                            <Button
                              size="sm"
                              variant={property.managerLeaseTerminationAuthorized ? 'outline-danger' : 'outline-primary'}
                              aria-label={`${property.managerLeaseTerminationAuthorized ? 'Revoke' : 'Grant'} lease termination authority for ${property.managerDetails.name || property.managerDetails.email}`}
                              onClick={() => onLeaseAuthorityClick(property, 'termination')}
                            >
                              {property.managerLeaseTerminationAuthorized ? 'Revoke' : 'Grant'}
                            </Button>
                          </div>
                          <div className="pm-owner-authority-row">
                            <span className="pm-owner-authority-label">Set rent prices</span>
                            <span className={`pm-owner-authority-state ${property.managerUnitPricingAuthorized ? 'is-authorized' : ''}`}>
                              {property.managerUnitPricingAuthorized ? 'Authorized' : 'Owner approval'}
                            </span>
                            <Button
                              size="sm"
                              variant={property.managerUnitPricingAuthorized ? 'outline-danger' : 'outline-primary'}
                              aria-label={`${property.managerUnitPricingAuthorized ? 'Revoke' : 'Grant'} rent pricing authority for ${property.managerDetails.name || property.managerDetails.email}`}
                              onClick={() => onLeaseAuthorityClick(property, 'pricing')}
                            >
                              {property.managerUnitPricingAuthorized ? 'Revoke' : 'Grant'}
                            </Button>
                          </div>
                          {(property.leaseSigningAgreementReference || property.leaseTerminationAgreementReference || property.unitPricingAgreementReference) && (
                            <div className="pm-owner-authority-reference">
                              {property.leaseSigningAgreementReference && <div>Lease signing: {property.leaseSigningAgreementReference}</div>}
                              {property.leaseTerminationAgreementReference && <div>Lease ending: {property.leaseTerminationAgreementReference}</div>}
                              {property.unitPricingAgreementReference && <div>Rent pricing: {property.unitPricingAgreementReference}</div>}
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
  );
}
