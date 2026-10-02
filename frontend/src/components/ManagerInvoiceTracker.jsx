import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Col, Form, Modal, Row, Spinner, Table } from 'react-bootstrap';
import {
  fetchInvoices,
  fetchPayments,
  recordPayment,
  rejectPayment,
  reversePayment,
  triggerMonthlyBilling,
  verifyPayment,
} from '../services/invoiceService';

const formatCurrency = (value) => `₱${Number(value || 0).toLocaleString('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

const localDateValue = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const formatPaymentDate = (value) => value
  ? new Date(`${value}T00:00:00`).toLocaleDateString('en-PH')
  : '—';

const safeReceiptLink = (value) => {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
};

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
  'Pending Verification': 'warning',
  Rejected: 'danger',
  Reversed: 'secondary',
};

export default function ManagerInvoiceTracker({ onPaymentsUpdated }) {
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    paymentDate: localDateValue(),
    paymentMethod: 'GCash',
    referenceNumber: '',
    receiptUrl: '',
    remarks: '',
  });
  const [reasonModal, setReasonModal] = useState({ open: false, payment: null, action: '' });
  const [reason, setReason] = useState('');

  const loadData = async () => {
    setLoading(true);
    const [invoiceResult, paymentResult] = await Promise.allSettled([fetchInvoices(), fetchPayments()]);
    if (invoiceResult.status === 'fulfilled') {
      const data = invoiceResult.value;
      setInvoices(Array.isArray(data) ? data : data.results || []);
    } else {
      setError(errorMessage(invoiceResult.reason, 'Failed to load invoice ledger.'));
    }
    if (paymentResult.status === 'fulfilled') {
      const data = paymentResult.value;
      setPayments(Array.isArray(data) ? data : data.results || []);
    } else {
      setError((current) => current || errorMessage(paymentResult.reason, 'Failed to load payment records.'));
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRunBilling = async () => {
    setError('');
    setSuccess('');
    try {
      const response = await triggerMonthlyBilling();
      setSuccess(response?.message || 'Monthly rent invoices generated.');
      await loadData();
      await onPaymentsUpdated?.();
    } catch (billingError) {
      setError(errorMessage(billingError, 'Failed to run the monthly billing batch.'));
    }
  };

  const openPaymentModal = (invoice) => {
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
    setShowPaymentModal(true);
  };

  const handlePaymentSubmit = async (event) => {
    event.preventDefault();
    const invoiceId = selectedInvoice?._id || selectedInvoice?.id;
    if (!invoiceId || saving) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await recordPayment(invoiceId, {
        amount: paymentForm.amount,
        paymentDate: paymentForm.paymentDate,
        paymentMethod: paymentForm.paymentMethod,
        referenceNumber: paymentForm.referenceNumber.trim(),
        receiptUrl: paymentForm.receiptUrl.trim(),
        remarks: paymentForm.remarks.trim(),
      });
      setShowPaymentModal(false);
      setSelectedInvoice(null);
      setSuccess('Payment recorded as received and verified.');
      await loadData();
      await onPaymentsUpdated?.();
    } catch (recordError) {
      setError(errorMessage(recordError, 'Could not record this payment. Check the details and try again.'));
    } finally {
      setSaving(false);
    }
  };

  const handleVerify = async (payment) => {
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      await verifyPayment(payment.id);
      setSuccess('Payment verified and applied to the invoice balance.');
      await loadData();
      await onPaymentsUpdated?.();
    } catch (verifyError) {
      setError(errorMessage(verifyError, 'Could not verify this payment.'));
    } finally {
      setSaving(false);
    }
  };

  const openReasonModal = (payment, action) => {
    setReasonModal({ open: true, payment, action });
    setReason('');
  };

  const handleReasonSubmit = async (event) => {
    event.preventDefault();
    if (!reasonModal.payment || !reason.trim() || saving) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      if (reasonModal.action === 'reject') {
        await rejectPayment(reasonModal.payment.id, reason.trim());
        setSuccess('Payment rejected. The reason has been saved with the record.');
      } else {
        await reversePayment(reasonModal.payment.id, reason.trim());
        setSuccess('Payment reversed. The invoice balance has been recalculated.');
      }
      setReasonModal({ open: false, payment: null, action: '' });
      await loadData();
      await onPaymentsUpdated?.();
    } catch (actionError) {
      setError(errorMessage(actionError, 'Could not update this payment.'));
    } finally {
      setSaving(false);
    }
  };

  const invoiceLabel = (payment) => {
    const details = payment.invoiceDetails || {};
    const id = payment.invoice;
    return `${details.property || 'Property'} · ${details.tenant || 'Tenant'} · #${id}`;
  };

  return (
    <div className="pm-invoice-tracker">
      <div className="d-flex justify-content-between align-items-start gap-3 mb-4">
        <div>
          <h4 className="fw-bold mb-1">Rent invoices and payments</h4>
          <p className="text-muted small mb-0">Review tenant submissions or record rent already received.</p>
        </div>
        <Button variant="light" className="pm-btn-primary" onClick={handleRunBilling} disabled={loading || saving}>
          Run monthly billing batch
        </Button>
      </div>

      {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert variant="success" dismissible onClose={() => setSuccess('')}>{success}</Alert>}

      {loading ? (
        <div className="pm-loading py-4"><Spinner animation="border" size="sm" className="me-2" />Loading billing records…</div>
      ) : (
        <>
          <h5 className="fw-bold mb-3">Invoice balances</h5>
          <Table responsive className="pm-table mb-4">
            <thead>
              <tr>
                <th>Property</th>
                <th>Tenant</th>
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
                const details = invoice.propertyDetails || {};
                const tenant = invoice.tenantDetails || {};
                const balance = Number(invoice.balanceDue ?? invoice.totalDue ?? invoice.amount ?? 0);
                const statusName = invoice.status || 'Pending';
                const canRecord = !invoice.isArchived && statusName !== 'Cancelled' && balance > 0;
                return (
                  <tr key={invoiceId}>
                    <td className="pm-cell-title">{details.title || invoice.property?.title || 'Property'}</td>
                    <td>{tenant.name || tenant.email || invoice.tenantName || 'Tenant'}</td>
                    <td>{invoice.dueDate || '—'}</td>
                    <td>{formatCurrency(invoice.totalDue)}</td>
                    <td>{formatCurrency(invoice.amountPaid)}</td>
                    <td className="pm-cell-strong">{formatCurrency(invoice.balanceDue)}</td>
                    <td>
                      <Badge bg={statusName === 'Paid' ? 'success' : statusName === 'Overdue' ? 'danger' : statusName === 'Cancelled' ? 'secondary' : 'primary'}>{statusName}</Badge>
                      {invoice.isArchived && <div className="small text-muted mt-1">Archived history</div>}
                      {Number(invoice.pendingPaymentCount) > 0 && <div className="small text-muted mt-1">{invoice.pendingPaymentCount} awaiting review</div>}
                    </td>
                    <td className="text-center">
                      {canRecord ? <Button variant="outline-primary" size="sm" onClick={() => openPaymentModal(invoice)}>Record received payment</Button> : '—'}
                    </td>
                  </tr>
                );
              }) : (
                <tr><td colSpan="8" className="pm-empty-row">No rent invoices recorded. Run the billing batch to create invoices for active leases.</td></tr>
              )}
            </tbody>
          </Table>

          <h5 className="fw-bold mb-1">Payment records</h5>
          <p className="text-muted small mb-3">Tenant submissions remain pending until verified. Rejected and reversed entries stay in the audit history.</p>
          <Table responsive className="pm-table mb-0">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Payment date</th>
                <th>Amount</th>
                <th>Method / reference</th>
                <th>Entered by</th>
                <th>Status</th>
                <th className="text-center">Review action</th>
              </tr>
            </thead>
            <tbody>
              {payments.length ? payments.map((payment) => (
                <tr key={payment.id}>
                  <td>{invoiceLabel(payment)}</td>
                  <td>{formatPaymentDate(payment.paymentDate)}</td>
                  <td className="pm-cell-strong">{formatCurrency(payment.amount)}</td>
                  <td>
                    <div>{payment.paymentMethod}</div>
                    <small className="text-muted">{payment.referenceNumber || 'No reference'}</small>
                    {safeReceiptLink(payment.receiptUrl) && <div><a href={safeReceiptLink(payment.receiptUrl)} target="_blank" rel="noreferrer">Receipt link</a></div>}
                  </td>
                  <td>{payment.createdBy?.name || (payment.legacyImport ? 'Historical record' : '—')}</td>
                  <td>
                    <Badge bg={paymentStatusVariant[payment.status] || 'secondary'}>{payment.status}</Badge>
                    {payment.rejectionReason && <div className="small text-danger mt-1">{payment.rejectionReason}</div>}
                    {payment.reversalReason && <div className="small text-muted mt-1">{payment.reversalReason}</div>}
                    {payment.status === 'Pending Verification' && (payment.invoiceDetails?.status === 'Cancelled' || payment.invoiceDetails?.isArchived) && (
                      <div className="small text-muted mt-1">
                        {payment.invoiceDetails?.isArchived ? 'Invoice archived; reject this submission with a reason.' : 'Invoice cancelled; reject this submission with a reason.'}
                      </div>
                    )}
                  </td>
                  <td className="text-center">
                    {payment.status === 'Pending Verification' && (
                      <div className="d-flex flex-wrap justify-content-center gap-2">
                        {payment.invoiceDetails?.status !== 'Cancelled' && !payment.invoiceDetails?.isArchived && (
                          <Button size="sm" variant="success" disabled={saving} onClick={() => handleVerify(payment)}>Verify</Button>
                        )}
                        <Button size="sm" variant="outline-danger" disabled={saving} onClick={() => openReasonModal(payment, 'reject')}>Reject</Button>
                      </div>
                    )}
                    {payment.status === 'Verified' && (
                      <Button size="sm" variant="outline-secondary" disabled={saving} onClick={() => openReasonModal(payment, 'reverse')}>Reverse</Button>
                    )}
                    {!['Pending Verification', 'Verified'].includes(payment.status) && '—'}
                  </td>
                </tr>
              )) : (
                <tr><td colSpan="7" className="pm-empty-row">No payment records yet.</td></tr>
              )}
            </tbody>
          </Table>
        </>
      )}

      <Modal show={showPaymentModal} onHide={() => !saving && setShowPaymentModal(false)} centered dialogClassName="pm-modal">
        <Modal.Header closeButton><Modal.Title>Record rent received</Modal.Title></Modal.Header>
        {selectedInvoice && (
          <Form onSubmit={handlePaymentSubmit}>
            <Modal.Body>
              <div className="p-3 mb-3 bg-light rounded">
                <div className="small text-muted">Remaining invoice balance</div>
                <div className="fs-5 fw-bold">{formatCurrency(selectedInvoice.balanceDue)}</div>
              </div>
              <Row className="g-3">
                <Col md={6}>
                  <Form.Group><Form.Label className="pm-form-label">Amount received (₱)</Form.Label>
                    <Form.Control className="pm-input" type="number" min="0.01" max={Number(selectedInvoice.balanceDue || 0).toFixed(2)} step="0.01" value={paymentForm.amount} onChange={(event) => setPaymentForm({ ...paymentForm, amount: event.target.value })} required />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group><Form.Label className="pm-form-label">Date received</Form.Label>
                    <Form.Control className="pm-input" type="date" value={paymentForm.paymentDate} onChange={(event) => setPaymentForm({ ...paymentForm, paymentDate: event.target.value })} required />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group><Form.Label className="pm-form-label">Payment method</Form.Label>
                    <Form.Select className="pm-input" value={paymentForm.paymentMethod} onChange={(event) => setPaymentForm({ ...paymentForm, paymentMethod: event.target.value })} required>
                      <option value="GCash">GCash</option><option value="Bank Transfer">Bank Transfer</option><option value="Cash">Cash</option><option value="Check">Check</option>
                    </Form.Select>
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group><Form.Label className="pm-form-label">Reference <span className="text-muted fw-normal">Optional for cash</span></Form.Label>
                    <Form.Control className="pm-input" maxLength={120} value={paymentForm.referenceNumber} onChange={(event) => setPaymentForm({ ...paymentForm, referenceNumber: event.target.value })} />
                  </Form.Group>
                </Col>
                <Col xs={12}>
                  <Form.Group><Form.Label className="pm-form-label">Receipt link <span className="text-muted fw-normal">Optional</span></Form.Label>
                    <Form.Control className="pm-input" type="url" placeholder="https://…" value={paymentForm.receiptUrl} onChange={(event) => setPaymentForm({ ...paymentForm, receiptUrl: event.target.value })} />
                  </Form.Group>
                </Col>
                <Col xs={12}>
                  <Form.Group><Form.Label className="pm-form-label">Notes <span className="text-muted fw-normal">Optional</span></Form.Label>
                    <Form.Control as="textarea" rows={2} className="pm-input" value={paymentForm.remarks} onChange={(event) => setPaymentForm({ ...paymentForm, remarks: event.target.value })} />
                  </Form.Group>
                </Col>
              </Row>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="outline-secondary" onClick={() => setShowPaymentModal(false)} disabled={saving}>Cancel</Button>
              <Button variant="primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save verified payment'}</Button>
            </Modal.Footer>
          </Form>
        )}
      </Modal>

      <Modal show={reasonModal.open} onHide={() => !saving && setReasonModal({ open: false, payment: null, action: '' })} centered dialogClassName="pm-modal">
        <Modal.Header closeButton>
          <Modal.Title>{reasonModal.action === 'reject' ? 'Reject payment' : 'Reverse verified payment'}</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleReasonSubmit}>
          <Modal.Body>
            <p className="text-muted">{reasonModal.action === 'reject' ? 'Add a short reason so the Tenant knows why this submission was not accepted.' : 'Explain why this verified payment is being corrected. The original record will remain in history.'}</p>
            <Form.Group>
              <Form.Label className="pm-form-label">Reason</Form.Label>
              <Form.Control as="textarea" rows={3} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={2000} required />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline-secondary" onClick={() => setReasonModal({ open: false, payment: null, action: '' })} disabled={saving}>Cancel</Button>
            <Button variant={reasonModal.action === 'reject' ? 'danger' : 'secondary'} type="submit" disabled={saving || !reason.trim()}>{saving ? 'Saving…' : reasonModal.action === 'reject' ? 'Reject payment' : 'Reverse payment'}</Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </div>
  );
}
