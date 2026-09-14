import React, { useMemo } from 'react';
import { Row, Col, Card, ProgressBar, Table, Badge } from 'react-bootstrap';

export default function ManagerReports({ properties = [], invoices = [] }) {
  const reportData = useMemo(() => {
    let totalRooms = 0;
    let occupiedRooms = 0;
    let expectedRevenue = 0;

    properties.forEach((p) => {
      if (Array.isArray(p.units) && p.units.length > 0) {
        totalRooms += p.units.length;
        const occupied = p.units.filter((u) => u.status === 'Occupied');
        occupiedRooms += occupied.length;
        expectedRevenue += occupied.reduce((sum, u) => sum + (u.monthlyRate || 0), 0);
      } else {
        totalRooms += 1;
        if (['occupied', 'rented'].includes(p.status?.toLowerCase())) {
          occupiedRooms += 1;
          expectedRevenue += p.price || 0;
        }
      }
    });

    const collectedRevenue = invoices
      .filter((inv) => inv.status === 'Paid')
      .reduce((sum, inv) => sum + (inv.amount || 0), 0);

    const pendingRevenue = invoices
      .filter((inv) => ['Pending', 'Overdue'].includes(inv.status))
      .reduce((sum, inv) => sum + (inv.totalDue || inv.amount || 0), 0);

    const occupancyRate = totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0;

    return {
      totalRooms,
      occupiedRooms,
      occupancyRate,
      expectedRevenue,
      collectedRevenue,
      pendingRevenue,
    };
  }, [properties, invoices]);

  return (
    <div>
      {/* High-Level Financial Metrics */}
      <Row className="g-3 mb-4">
        <Col md={4}>
          <Card className="p-3 border-0 bg-light shadow-sm">
            <span className="text-muted small fw-semibold">Portfolio Occupancy</span>
            <h3 className="fw-bold text-dark mt-1">{reportData.occupancyRate}%</h3>
            <ProgressBar
              now={reportData.occupancyRate}
              variant={reportData.occupancyRate > 75 ? 'success' : 'warning'}
              className="mt-2"
              style={{ height: '6px' }}
            />
            <span className="text-muted text-xs mt-2 d-block" style={{ fontSize: '12px' }}>
              {reportData.occupiedRooms} of {reportData.totalRooms} Units Occupied
            </span>
          </Card>
        </Col>

        <Col md={4}>
          <Card className="p-3 border-0 bg-light shadow-sm">
            <span className="text-muted small fw-semibold">Collected Rent (Paid)</span>
            <h3 className="fw-bold text-success mt-1">
              ₱{reportData.collectedRevenue.toLocaleString()}
            </h3>
            <span className="text-muted text-xs mt-2 d-block" style={{ fontSize: '12px' }}>
              Target Expected: ₱{reportData.expectedRevenue.toLocaleString()}
            </span>
          </Card>
        </Col>

        <Col md={4}>
          <Card className="p-3 border-0 bg-light shadow-sm">
            <span className="text-muted small fw-semibold">Pending / Overdue Balance</span>
            <h3 className="fw-bold text-danger mt-1">
              ₱{reportData.pendingRevenue.toLocaleString()}
            </h3>
            <span className="text-muted text-xs mt-2 d-block" style={{ fontSize: '12px' }}>
              Uncollected monthly ledgers
            </span>
          </Card>
        </Col>
      </Row>

      {/* Breakdown per Managed Property */}
      <h6 className="fw-bold text-dark mb-3">Property Financial & Occupancy Breakdown</h6>
      <Table responsive className="pm-table mb-0">
        <thead>
          <tr>
            <th>Property Title</th>
            <th>Type</th>
            <th>Occupancy Rate</th>
            <th>Monthly Yield</th>
          </tr>
        </thead>
        <tbody>
          {properties.length > 0 ? (
            properties.map((p) => {
              const total = p.units?.length || 1;
              const occ = p.units
                ? p.units.filter((u) => u.status === 'Occupied').length
                : p.status === 'Occupied' ? 1 : 0;
              const rate = total > 0 ? Math.round((occ / total) * 100) : 0;

              const yieldAmt = p.units
                ? p.units
                    .filter((u) => u.status === 'Occupied')
                    .reduce((sum, u) => sum + (u.monthlyRate || 0), 0)
                : p.status === 'Occupied' ? p.price : 0;

              return (
                <tr key={p._id}>
                  <td className="pm-cell-title">{p.title}</td>
                  <td>{p.propertyType}</td>
                  <td>
                    <div className="d-flex align-items-center gap-2">
                      <span className="fw-semibold">{occ}/{total}</span>
                      <Badge bg={rate === 100 ? 'success' : rate > 0 ? 'info' : 'secondary'}>
                        {rate}%
                      </Badge>
                    </div>
                  </td>
                  <td className="pm-cell-strong text-success">
                    ₱{yieldAmt.toLocaleString()}/mo
                  </td>
                </tr>
              );
            })
          ) : (
            <tr>
              <td colSpan="4" className="text-center text-muted py-3">
                No managed property performance records available.
              </td>
            </tr>
          )}
        </tbody>
      </Table>
    </div>
  );
}