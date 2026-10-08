import Table from '../../components/ResponsiveTable.jsx';
import OwnerStatusPill from './OwnerStatusPill.jsx';

export default function OwnerMaintenanceSection({ requests }) {
  return (
    <div>
      <Table responsive className="pm-table mb-0">
        <thead>
          <tr>
            <th>Property</th>
            <th>Issue Description</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {requests.length > 0 ? (
            requests.map((request) => {
              const requestId = request._id || request.id;
              const propertyTitle = request.propertyDetails?.title
                || request.property?.title
                || request.property
                || 'Property Asset';

              return (
                <tr key={requestId}>
                  <td className="pm-cell-title">{propertyTitle}</td>
                  <td>{request.title || request.issueDescription}</td>
                  <td><OwnerStatusPill status={request.status} /></td>
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
    </div>
  );
}
