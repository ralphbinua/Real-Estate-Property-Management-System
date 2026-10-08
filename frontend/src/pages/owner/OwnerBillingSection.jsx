import { Col, Row } from 'react-bootstrap';
import Table from '../../components/ResponsiveTable.jsx';
import CollectionPagination from '../../components/CollectionPagination';
import PaymentAcknowledgmentButton from '../../components/PaymentAcknowledgmentButton';
import OwnerStatusPill from './OwnerStatusPill.jsx';

export default function OwnerBillingSection({
  metrics,
  invoices,
  payments,
  paymentCount,
  paymentPage,
  paymentPageCount,
  onPaymentPageChange,
}) {
  return (
    <div>
      <h6 className="fw-bold mb-3">Portfolio rent summary</h6>
      <Row className="g-3 mb-4">
        <Col sm={6} xl={3}>
          <div className="pm-panel p-3 h-100">
            <div className="small text-muted">Rent invoiced</div>
            <div className="fs-5 fw-bold">₱{metrics.rentInvoiced.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
        </Col>
        <Col sm={6} xl={3}>
          <div className="pm-panel p-3 h-100">
            <div className="small text-muted">Verified rent collected</div>
            <div className="fs-5 fw-bold text-success">₱{metrics.rentCollected.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
        </Col>
        <Col sm={6} xl={3}>
          <div className="pm-panel p-3 h-100">
            <div className="small text-muted">Balance outstanding</div>
            <div className="fs-5 fw-bold text-danger">₱{metrics.outstandingBalance.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
        </Col>
        <Col sm={6} xl={3}>
          <div className="pm-panel p-3 h-100">
            <div className="small text-muted">Payments awaiting review</div>
            <div className="fs-5 fw-bold">{metrics.paymentsAwaitingReview}</div>
          </div>
        </Col>
      </Row>
      <h6 className="fw-bold mb-3">Invoice balances</h6>
      <Table responsive className="pm-table mb-4">
        <thead><tr><th>Property</th><th>Tenant</th><th>Total due</th><th>Paid</th><th>Balance</th><th>Due date</th><th>Status</th><th>Awaiting review</th></tr></thead>
        <tbody>
          {invoices.map((invoice) => (
            <tr key={invoice._id || invoice.id}>
              <td>{invoice.propertyDetails?.title || 'Property'}</td>
              <td>{invoice.tenantDetails?.name || invoice.tenantDetails?.email || 'Tenant'}</td>
              <td>₱{Number(invoice.totalDue || invoice.amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              <td>₱{Number(invoice.amountPaid || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              <td className="fw-semibold">₱{Number(invoice.balanceDue || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              <td>{invoice.dueDate || '—'}</td>
              <td>
                <OwnerStatusPill status={invoice.status} />
                {invoice.isArchived && <div className="small text-muted mt-1">Archived history</div>}
              </td>
              <td>{Number(invoice.pendingPaymentCount || 0)}</td>
            </tr>
          ))}
          {invoices.length === 0 && <tr><td colSpan="8" className="text-center text-muted py-4">No invoices found for your properties.</td></tr>}
        </tbody>
      </Table>

      <h6 className="fw-bold mb-3">Payment history</h6>
      <Table responsive className="pm-table pm-payment-history mb-0">
        <thead><tr><th>Property</th><th>Tenant</th><th>Payment date</th><th>Amount</th><th>Method</th><th>Reference</th><th>Status</th><th>Details</th></tr></thead>
        <tbody>
          {payments.map((payment) => (
            <tr key={payment.id}>
              <td>{payment.invoiceDetails?.property || 'Property'}</td>
              <td>{payment.invoiceDetails?.tenant || 'Tenant'}</td>
              <td>{payment.paymentDate ? new Date(`${payment.paymentDate}T00:00:00`).toLocaleDateString('en-PH') : '—'}</td>
              <td className="fw-semibold">₱{Number(payment.amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              <td>{payment.paymentMethod || '—'}</td>
              <td>{payment.referenceNumber || '—'}</td>
              <td><OwnerStatusPill status={payment.status} /></td>
              <td>{payment.status === 'Verified' ? <PaymentAcknowledgmentButton payment={payment} /> : payment.rejectionReason || payment.reversalReason || '—'}</td>
            </tr>
          ))}
          {payments.length === 0 && <tr><td colSpan="8" className="text-center text-muted py-4">No payment transactions recorded for your properties.</td></tr>}
        </tbody>
      </Table>
      <CollectionPagination
        count={paymentCount}
        page={paymentPage}
        pageCount={paymentPageCount}
        onPageChange={onPaymentPageChange}
      />
    </div>
  );
}
