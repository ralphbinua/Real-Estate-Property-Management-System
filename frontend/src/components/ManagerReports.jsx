import { useMemo, useState } from 'react';
import { Row, Col, Card, ProgressBar, Badge, Form } from 'react-bootstrap';
import Table from './ResponsiveTable.jsx';
import formatCurrency from '../utils/formatCurrency';

const currentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const monthLabel = (month) => new Date(`${month}-01T00:00:00`).toLocaleDateString('en-PH', {
  month: 'long',
  year: 'numeric',
});

export default function ManagerReports({ properties = [], invoices = [] }) {
  const [selectedMonth, setSelectedMonth] = useState(currentMonth());

  const monthOptions = useMemo(() => {
    const months = new Set(invoices.map((invoice) => invoice.dueDate?.slice(0, 7)).filter(Boolean));
    months.add(currentMonth());
    return [...months].sort((first, second) => second.localeCompare(first));
  }, [invoices]);

  const periodInvoices = useMemo(() => selectedMonth === 'all'
    ? invoices
    : invoices.filter((invoice) => invoice.dueDate?.slice(0, 7) === selectedMonth),
  [invoices, selectedMonth]);

  const reportData = useMemo(() => {
    let totalRooms = 0;
    let occupiedRooms = 0;
    let expectedRevenue = 0;

    properties.forEach((property) => {
      if (Array.isArray(property.units) && property.units.length > 0) {
        totalRooms += property.units.length;
        const occupied = property.units.filter((unit) => unit.status === 'Occupied');
        occupiedRooms += occupied.length;
        expectedRevenue += occupied.reduce((sum, unit) => sum + Number(unit.monthlyRate || 0), 0);
      } else {
        totalRooms += 1;
        if (['occupied', 'rented'].includes(property.status?.toLowerCase())) {
          occupiedRooms += 1;
          expectedRevenue += Number(property.price || 0);
        }
      }
    });

    const invoicedRevenue = periodInvoices
      .filter((invoice) => invoice.status !== 'Cancelled')
      .reduce((sum, invoice) => sum + Number(invoice.totalDue || 0), 0);
    const collectedRevenue = periodInvoices
      .reduce((sum, invoice) => sum + Number(invoice.amountPaid || 0), 0);
    const outstandingRevenue = periodInvoices
      .filter((invoice) => invoice.status !== 'Cancelled')
      .reduce((sum, invoice) => sum + Number(invoice.balanceDue || 0), 0);
    const occupancyRate = totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0;

    return {
      totalRooms,
      occupiedRooms,
      occupancyRate,
      expectedRevenue,
      invoicedRevenue,
      collectedRevenue,
      outstandingRevenue,
    };
  }, [properties, periodInvoices]);

  return (
    <div>
      <div className="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-3">
        <div>
          <div className="small text-muted">Collections include verified payments only.</div>
        </div>
        <Form.Group>
          <Form.Label className="small text-muted mb-1">Invoice month</Form.Label>
          <Form.Select size="sm" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} aria-label="Select invoice month">
            <option value="all">All months</option>
            {monthOptions.map((month) => <option value={month} key={month}>{monthLabel(month)}</option>)}
          </Form.Select>
        </Form.Group>
      </div>

      <Row className="g-3 mb-4">
        <Col md={6} xl={3}>
          <Card className="p-3 border-0 bg-light shadow-sm h-100">
            <span className="text-muted small fw-semibold">Portfolio occupancy</span>
            <h3 className="fw-bold text-dark mt-1">{reportData.occupancyRate}%</h3>
            <ProgressBar now={reportData.occupancyRate} variant={reportData.occupancyRate > 75 ? 'success' : 'warning'} className="mt-2" style={{ height: '6px' }} />
            <span className="text-muted small mt-2">{reportData.occupiedRooms} of {reportData.totalRooms} units occupied</span>
            <span className="text-muted small">Expected monthly rent: {formatCurrency(reportData.expectedRevenue)}</span>
          </Card>
        </Col>
        <Col md={6} xl={3}>
          <Card className="p-3 border-0 bg-light shadow-sm h-100">
            <span className="text-muted small fw-semibold">Rent invoiced</span>
            <h3 className="fw-bold text-dark mt-1">{formatCurrency(reportData.invoicedRevenue)}</h3>
            <span className="text-muted small mt-2">{selectedMonth === 'all' ? 'Across all invoice months' : `Invoices due in ${monthLabel(selectedMonth)}`}</span>
          </Card>
        </Col>
        <Col md={6} xl={3}>
          <Card className="p-3 border-0 bg-light shadow-sm h-100">
            <span className="text-muted small fw-semibold">Verified rent collected</span>
            <h3 className="fw-bold text-success mt-1">{formatCurrency(reportData.collectedRevenue)}</h3>
            <span className="text-muted small mt-2">Pending submissions are not counted</span>
          </Card>
        </Col>
        <Col md={6} xl={3}>
          <Card className="p-3 border-0 bg-light shadow-sm h-100">
            <span className="text-muted small fw-semibold">Balance outstanding</span>
            <h3 className="fw-bold text-danger mt-1">{formatCurrency(reportData.outstandingRevenue)}</h3>
            <span className="text-muted small mt-2">Unpaid balance for the selected invoice period</span>
          </Card>
        </Col>
      </Row>

      <h6 className="fw-bold text-dark mb-3">Property financial and occupancy breakdown</h6>
      <Table responsive className="pm-table mb-0">
        <thead>
          <tr>
            <th>Property</th>
            <th>Type</th>
            <th>Occupancy</th>
            <th>Rent invoiced</th>
            <th>Verified collected</th>
            <th>Balance outstanding</th>
          </tr>
        </thead>
        <tbody>
          {properties.length > 0 ? (
            properties.map((property) => {
              const total = property.units?.length || 1;
              const occupied = property.units
                ? property.units.filter((unit) => unit.status === 'Occupied').length
                : property.status === 'Occupied' ? 1 : 0;
              const rate = total > 0 ? Math.round((occupied / total) * 100) : 0;
              const propertyId = String(property._id || property.id || '');
              const propertyInvoices = periodInvoices.filter((invoice) => String(
                invoice.propertyDetails?._id || invoice.propertyDetails?.id || invoice.property || '',
              ) === propertyId);
              const invoiced = propertyInvoices
                .filter((invoice) => invoice.status !== 'Cancelled')
                .reduce((sum, invoice) => sum + Number(invoice.totalDue || 0), 0);
              const collected = propertyInvoices.reduce((sum, invoice) => sum + Number(invoice.amountPaid || 0), 0);
              const outstanding = propertyInvoices
                .filter((invoice) => invoice.status !== 'Cancelled')
                .reduce((sum, invoice) => sum + Number(invoice.balanceDue || 0), 0);

              return (
                <tr key={property._id || property.id}>
                  <td className="pm-cell-title">{property.title}</td>
                  <td>{property.propertyType}</td>
                  <td>
                    <div className="d-flex align-items-center gap-2">
                      <span className="fw-semibold">{occupied}/{total}</span>
                      <Badge bg={rate === 100 ? 'success' : rate > 0 ? 'info' : 'secondary'}>{rate}%</Badge>
                    </div>
                  </td>
                  <td>{formatCurrency(invoiced)}</td>
                  <td className="pm-cell-strong text-success">{formatCurrency(collected)}</td>
                  <td className="pm-cell-strong">{formatCurrency(outstanding)}</td>
                </tr>
              );
            })
          ) : (
            <tr><td colSpan="6" className="text-center text-muted py-3">No managed property performance records available.</td></tr>
          )}
        </tbody>
      </Table>
    </div>
  );
}
