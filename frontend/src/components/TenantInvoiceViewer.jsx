import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Col, Form, Modal, Row, Spinner, Table } from 'react-bootstrap';
import {
  fetchPayments,
  fetchTenantInvoices,
  submitTenantPayment,
} from '../services/invoiceService';

const formatCurrency = (value) => `₱${Number(value || 0).toLocaleString('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

const localDateValue = () => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
};

const formatDate = (value) => value
  ? new Date(`${value}T00:00:00`).toLocaleDateString('en-PH')
  : '—';

const errorMessage = (error, fallback) => {
  const data = error.response?.data;
  if (data?.detail) return data.detail;
  if (data && typeof data === 'object') {
    const messages = Object.values(data).flatMap((value) => Array.isArray(value) ? value : [value]);
    if (messages.length) return messages.join(' ');
  }
  return fallback;
};

const paymentStatusVariant = {
  Verified: 'success',
  'Pending Verification': 'info',
  Rejected: 'danger',
  Reversed: 'secondary',
};

export default function TenantInvoiceViewer({ tenantId }) {
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [showPayModal, setShowPayModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    paymentDate: localDateValue(),
    paymentMethod: 'GCash',
    referenceNumber: '',
    receiptUrl: '',
    remarks: '',
  });

  const loadBilling = async () => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [invoiceResult, paymentResult] = await Promise.allSettled([
      fetchTenantInvoices(tenantId),
      fetchPayments(),
    ]);
    if (invoiceResult.status === 'fulfilled') {
      const value = invoiceResult.value;
      setInvoices(Array.isArray(value) ? value : value.results || []);
      setError('');
    } else {
      setError(errorMessage(invoiceResult.reason, 'Failed to load billing statements.'));
    }
    if (paymentResult.status === 'fulfilled') {
      const value = paymentResult.value;
      setPayments(Array.isArray(value) ? value : value.results || []);
    } else {
      setPayments([]);
      setError((current) => current || 'Payment history could not be loaded. Please refresh the page.');
    }
    setLoading(false);
  };

  useEffect(() => {
    loadBilling();
  }, [tenantId]);

  const handleOpenPayModal = (invoice) => {
    const balance = Number(invoice.balanceDue ?? invoice.totalDue ?? invoice.amount ?? 0);
    setSelectedInvoice(invoice);
    setPaymentForm({
      amount: balance.toFixed(2),
      paymentDate: localDateValue(),
      paymentMethod: 'GCash',
      referenceNumber: '',
      receiptUrl: '',
      remarks: '',
    });
    setError('');
    setShowPayModal(true);
  };

  const handleSubmitPayment = async (event) => {
    event.preventDefault();
    const invoiceId = selectedInvoice?._id || selectedInvoice?.id;
    if (!invoiceId || submitting) return;
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      await submitTenantPayment(invoiceId, {
        amount: paymentForm.amount,
        paymentDate: paymentForm.paymentDate,
        paymentMethod: paymentForm.paymentMethod,
        referenceNumber: paymentForm.referenceNumber.trim(),
        receiptUrl: paymentForm.receiptUrl.trim(),
        remarks: paymentForm.remarks.trim(),
      });
      setShowPayModal(false);
      setSelectedInvoice(null);
      setSuccess('Payment submitted. It will appear as collected rent after the property manager verifies it.');
      await loadBilling();
    } catch (submitError) {
      setError(errorMessage(submitError, 'Could not submit this payment. Check the details and try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="pm-loading">
        <Spinner animation="border" size="sm" className="me-2" />
        Loading billing statement…
      </div>
    );
  }

  return (
    <div>
      {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert variant="success" dismissible onClose={() => setSuccess('')}>{success}</Alert>}

      <div className="mb-4">
        <h5 className="fw-bold mb-1">Rent invoices</h5>
        <p className="text-muted small mb-3">Review your balance and submit a payment for verification.</p>
        <Table responsive className="pm-table mb-0">
          <thead>
            <tr>
              <th>Property</th>
              <th>Due date</th>
              <th>Total due</th>
              <th>Paid</th>
              <th>Balance</th>
              <th>Status</th>
              <th className="text-center">Action</th>
            </tr>
          </thead>
          <tbody>
            {invoices.length ? invoices.map((invoice) => {
              const invoiceId = invoice._id || invoice.id;
              const balance = Number(invoice.balanceDue ?? invoice.totalDue ?? invoice.amount ?? 0);
              const canPay = !invoice.isArchived && invoice.status !== 'Cancelled' && balance > 0;
              return (
                <tr key={invoiceId}>
                  <td className="pm-cell-title">{invoice.propertyDetails?.title || invoice.property?.title || 'Property'}</td>
                  <td>{invoice.dueDate ? new Date(`${invoice.dueDate}T00:00:00`).toLocaleDateString('en-PH') : '—'}</td>
                  <td>{formatCurrency(invoice.totalDue)}</td>
                  <td>{formatCurrency(invoice.amountPaid)}</td>
                  <td className="pm-cell-strong">{formatCurrency(invoice.balanceDue)}</td>
                  <td>
                    <Badge bg={invoice.status === 'Paid' ? 'success' : invoice.status === 'Overdue' ? 'danger' : invoice.status === 'Cancelled' ? 'secondary' : 'primary'}>
                      {invoice.status}
                    </Badge>
                    {invoice.isArchived && <div className="small text-muted mt-1">Archived history</div>}
                    {Number(invoice.pendingPaymentCount) > 0 && (
                      <div className="small text-muted mt-1">{invoice.pendingPaymentCount} awaiting review</div>
                    )}
                  </td>
                  <td className="text-center">
                    {canPay ? (
                      <Button variant="light" size="sm" className="pm-btn-primary" onClick={() => handleOpenPayModal(invoice)}>
                        Submit payment
                      </Button>
                    ) : invoice.status === 'Cancelled' ? '—' : <span className="text-muted small">Paid in full</span>}
                  </td>
                </tr>
              );
            }) : (
              <tr><td colSpan="7" className="pm-empty-row">No rent invoices recorded.</td></tr>
            )}
          </tbody>
        </Table>
      </div>

      <div>
        <h5 className="fw-bold mb-1">Payment history</h5>
        <p className="text-muted small mb-3">Only verified payments reduce your invoice balance.</p>
        <Table responsive className="pm-table mb-0">
          <thead>
            <tr>
              <th>Property</th>
              <th>Payment date</th>
              <th>Amount</th>
              <th>Method</th>
              <th>Reference</th>
              <th>Status</th>
              <th>Review note</th>
            </tr>
          </thead>
          <tbody>
            {payments.length ? payments.map((payment) => (
              <tr key={payment.id}>
                <td>{payment.invoiceDetails?.property || 'Property'}</td>
                <td>{formatDate(payment.paymentDate)}</td>
                <td className="pm-cell-strong">{formatCurrency(payment.amount)}</td>
                <td>{payment.paymentMethod}</td>
                <td>{payment.referenceNumber || '—'}</td>
                <td><Badge bg={paymentStatusVariant[payment.status] || 'secondary'}>{payment.status}</Badge></td>
                <td>{payment.rejectionReason || payment.reversalReason || '—'}</td>
              </tr>
            )) : (
              <tr><td colSpan="7" className="pm-empty-row">No payment submissions yet.</td></tr>
            )}
          </tbody>
        </Table>
      </div>

      <Modal show={showPayModal} onHide={() => !submitting && setShowPayModal(false)} centered dialogClassName="pm-modal">
        <Modal.Header closeButton>
          <Modal.Title>Submit rent payment</Modal.Title>
        </Modal.Header>
        {selectedInvoice && (
          <Form onSubmit={handleSubmitPayment}>
            <Modal.Body>
              <div className="p-3 mb-3 bg-light rounded">
                <Row className="g-2">
                  <Col xs={6}><span className="text-muted">Total due</span><div className="fw-semibold">{formatCurrency(selectedInvoice.totalDue)}</div></Col>
                  <Col xs={6}><span className="text-muted">Paid</span><div className="fw-semibold">{formatCurrency(selectedInvoice.amountPaid)}</div></Col>
                </Row>
                <hr className="my-2" />
                <div className="fw-bold">Remaining balance: {formatCurrency(selectedInvoice.balanceDue)}</div>
              </div>

              <Row className="g-3">
                <Col md={6}>
                  <Form.Group>
                    <Form.Label className="pm-form-label">Payment amount (₱)</Form.Label>
                    <Form.Control
                      className="pm-input"
                      type="number"
                      min="0.01"
                      max={Number(selectedInvoice.balanceDue || 0).toFixed(2)}
                      step="0.01"
                      value={paymentForm.amount}
                      onChange={(event) => setPaymentForm({ ...paymentForm, amount: event.target.value })}
                      required
                    />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group>
                    <Form.Label className="pm-form-label">Payment date</Form.Label>
                    <Form.Control
                      className="pm-input"
                      type="date"
                      value={paymentForm.paymentDate}
                      onChange={(event) => setPaymentForm({ ...paymentForm, paymentDate: event.target.value })}
                      required
                    />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group>
                    <Form.Label className="pm-form-label">Payment method</Form.Label>
                    <Form.Select className="pm-input" value={paymentForm.paymentMethod} onChange={(event) => setPaymentForm({ ...paymentForm, paymentMethod: event.target.value })} required>
                      <option value="GCash">GCash</option>
                      <option value="Bank Transfer">Bank Transfer</option>
                      <option value="Cash">Cash</option>
                      <option value="Check">Check</option>
                    </Form.Select>
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group>
                    <Form.Label className="pm-form-label">Transaction reference</Form.Label>
                    <Form.Control className="pm-input" value={paymentForm.referenceNumber} onChange={(event) => setPaymentForm({ ...paymentForm, referenceNumber: event.target.value })} maxLength={120} required />
                  </Form.Group>
                </Col>
                <Col xs={12}>
                  <Form.Group>
                    <Form.Label className="pm-form-label">Receipt link <span className="text-muted fw-normal">Optional</span></Form.Label>
                    <Form.Control className="pm-input" type="url" placeholder="https://…" value={paymentForm.receiptUrl} onChange={(event) => setPaymentForm({ ...paymentForm, receiptUrl: event.target.value })} />
                  </Form.Group>
                </Col>
                <Col xs={12}>
                  <Form.Group>
                    <Form.Label className="pm-form-label">Note <span className="text-muted fw-normal">Optional</span></Form.Label>
                    <Form.Control as="textarea" rows={2} className="pm-input" value={paymentForm.remarks} onChange={(event) => setPaymentForm({ ...paymentForm, remarks: event.target.value })} />
                  </Form.Group>
                </Col>
              </Row>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="light" className="pm-btn-ghost" onClick={() => setShowPayModal(false)} disabled={submitting}>Cancel</Button>
              <Button variant="light" className="pm-btn-primary" type="submit" disabled={submitting}>
                {submitting ? 'Submitting…' : 'Submit for verification'}
              </Button>
            </Modal.Footer>
          </Form>
        )}
      </Modal>
    </div>
  );
}
