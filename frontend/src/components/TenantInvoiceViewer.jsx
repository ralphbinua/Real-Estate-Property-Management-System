import { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Badge, Spinner, Row, Col } from 'react-bootstrap';
import api from '../services/api';

export default function TenantInvoiceViewer({ tenantId }) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [showPayModal, setShowPayModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [paymentForm, setPaymentForm] = useState({
    paymentMethod: 'GCash',
    referenceNumber: '',
    receiptUrl: '',
  });

  const fetchInvoices = async () => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await api.get(`/invoices/tenant/?tenantId=${tenantId}`);
      setInvoices(Array.isArray(res.data) ? res.data : res.data.results || []);
      setError('');
    } catch (err) {
      setError('Failed to load billing statement.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, [tenantId]);

  const handleOpenPayModal = (inv) => {
    setSelectedInvoice(inv);
    setPaymentForm({
      paymentMethod: 'GCash',
      referenceNumber: '',
      receiptUrl: '',
    });
    setShowPayModal(true);
  };

  const handleSubmitPayment = async (e) => {
    e.preventDefault();
    const invId = selectedInvoice?._id || selectedInvoice?.id;
    if (!invId) return;
    setSubmitting(true);
    try {
      await api.patch(`/invoices/${invId}/submit-payment/`, {
        paymentMethod: paymentForm.paymentMethod,
        remarks: `Ref: ${paymentForm.referenceNumber}`,
        receiptUrl: paymentForm.receiptUrl
      });
      setShowPayModal(false);
      fetchInvoices();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to submit payment receipt.');
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
      {error && (
        <div className="pm-alert pm-alert-error mb-3">
          <span>{error}</span>
        </div>
      )}

      <Table responsive className="pm-table mb-0">
        <thead>
          <tr>
            <th>Property</th>
            <th>Due Date</th>
            <th>Rent Amount</th>
            <th>Late Fee</th>
            <th>Total Due</th>
            <th>Status</th>
            <th className="text-center">Action</th>
          </tr>
        </thead>
        <tbody>
          {invoices.length > 0 ? (
            invoices.map((inv) => (
              <tr key={inv._id || inv.id}>
                <td className="pm-cell-title">{inv.property?.title || 'N/A'}</td>
                <td>{inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : 'N/A'}</td>
                <td>₱{inv.amount?.toLocaleString()}</td>
                <td className="text-danger">
                  {inv.lateFee > 0 ? `+₱${inv.lateFee.toLocaleString()}` : '₱0'}
                </td>
                <td className="pm-cell-strong">₱{inv.totalDue?.toLocaleString()}</td>
                <td>
                  <Badge
                    bg={
                      inv.status === 'Paid'
                        ? 'success'
                        : inv.status === 'Pending Verification'
                        ? 'info'
                        : inv.status === 'Overdue'
                        ? 'danger'
                        : 'warning'
                    }
                  >
                    {inv.status}
                  </Badge>
                </td>
                <td className="text-center">
                  {['Pending', 'Overdue'].includes(inv.status) && (
                    <Button
                      variant="light"
                      size="sm"
                      className="pm-btn-primary"
                      onClick={() => handleOpenPayModal(inv)}
                    >
                      Pay rent
                    </Button>
                  )}
                  {inv.status === 'Pending Verification' && (
                    <span className="text-muted small">Under Review</span>
                  )}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="7" className="pm-empty-row">No billing statements recorded.</td>
            </tr>
          )}
        </tbody>
      </Table>

      {/* Pay Rent Modal */}
      <Modal show={showPayModal} onHide={() => setShowPayModal(false)} centered dialogClassName="pm-modal">
        <Modal.Header closeButton>
          <Modal.Title>Submit Rent Payment</Modal.Title>
        </Modal.Header>
        {selectedInvoice && (
          <Form onSubmit={handleSubmitPayment}>
            <Modal.Body>
              <div className="p-3 mb-3 bg-light rounded">
                <Row>
                  <Col><strong>Base Rent:</strong> ₱{selectedInvoice.amount?.toLocaleString()}</Col>
                  {selectedInvoice.lateFee > 0 && (
                    <Col className="text-danger"><strong>Late Fee:</strong> ₱{selectedInvoice.lateFee?.toLocaleString()}</Col>
                  )}
                </Row>
                <hr className="my-2" />
                <div><strong className="fs-5">Total Due: ₱{selectedInvoice.totalDue?.toLocaleString()}</strong></div>
              </div>

              <Form.Group className="mb-3">
                <Form.Label className="pm-form-label">Payment Channel</Form.Label>
                <Form.Select
                  className="pm-input"
                  value={paymentForm.paymentMethod}
                  onChange={(e) => setPaymentForm({ ...paymentForm, paymentMethod: e.target.value })}
                >
                  <option value="GCash">GCash</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Cash">Cash Handover</option>
                  <option value="Check">Check</option>
                </Form.Select>
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label className="pm-form-label">Transaction Reference Number</Form.Label>
                <Form.Control
                  className="pm-input"
                  placeholder="e.g. 1002 8493 0291"
                  value={paymentForm.referenceNumber}
                  onChange={(e) => setPaymentForm({ ...paymentForm, referenceNumber: e.target.value })}
                  required
                />
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label className="pm-form-label">Receipt Image URL (Optional)</Form.Label>
                <Form.Control
                  className="pm-input"
                  placeholder="https://..."
                  value={paymentForm.receiptUrl}
                  onChange={(e) => setPaymentForm({ ...paymentForm, receiptUrl: e.target.value })}
                />
              </Form.Group>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="light" className="pm-btn-ghost" onClick={() => setShowPayModal(false)}>Cancel</Button>
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