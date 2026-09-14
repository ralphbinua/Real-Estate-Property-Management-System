import { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Badge, Spinner } from 'react-bootstrap';
import api from '../services/api';

const API_URL = '/invoices';

export default function ManagerInvoiceTracker() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentData, setPaymentData] = useState({ paymentMethod: 'Bank Transfer', remarks: '' });

  const fetchInvoices = async () => {
    try {
      const res = await api.get(API_URL);
      setInvoices(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Failed to load invoices');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, []);

  const handleGenerateInvoices = async () => {
    setGenerating(true);
    try {
      const res = await api.post(`${API_URL}/generate`);
      alert(res.data.message);
      fetchInvoices();
    } catch (err) {
      alert('Failed to run invoice generation.');
    } finally {
      setGenerating(false);
    }
  };

  const handleOpenPaymentModal = (inv) => {
    setSelectedInvoice(inv);
    // Pre-fill existing tenant payment method & reference remarks if submitted
    setPaymentData({
      paymentMethod: inv.paymentMethod && inv.paymentMethod !== 'N/A' ? inv.paymentMethod : 'Bank Transfer',
      remarks: inv.remarks || '',
    });
    setShowPaymentModal(true);
  };

  const handleMarkAsPaid = async (e) => {
    e.preventDefault();
    try {
      await api.put(`${API_URL}/${selectedInvoice._id}`, {
        status: 'Paid',
        paymentMethod: paymentData.paymentMethod,
        remarks: paymentData.remarks,
      });
      setShowPaymentModal(false);
      fetchInvoices();
    } catch (err) {
      alert('Failed to record payment.');
    }
  };

  if (loading) {
    return (
      <div className="pm-loading">
        <Spinner animation="border" size="sm" className="me-2" />
        Loading financial ledger…
      </div>
    );
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h5 className="mb-0">Monthly Rent Invoices</h5>
        <Button
          variant="light"
          className="pm-btn-primary"
          onClick={handleGenerateInvoices}
          disabled={generating}
        >
          {generating ? 'Generating…' : 'Run monthly billing batch'}
        </Button>
      </div>

      <Table responsive className="pm-table mb-0">
        <thead>
          <tr>
            <th>Property</th>
            <th>Tenant</th>
            <th>Due Date</th>
            <th>Total Due</th>
            <th>Status</th>
            <th className="text-center">Action</th>
          </tr>
        </thead>
        <tbody>
          {invoices.length > 0 ? (
            invoices.map((inv) => (
              <tr key={inv._id}>
                <td className="pm-cell-title">{inv.property?.title || 'N/A'}</td>
                <td>{inv.tenant?.name || 'N/A'}</td>
                <td>{inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : 'N/A'}</td>
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
                  {inv.status !== 'Paid' && (
                    <Button
                      variant="light"
                      size="sm"
                      className="pm-btn-edit-outline"
                      onClick={() => handleOpenPaymentModal(inv)}
                    >
                      {inv.status === 'Pending Verification' ? 'Verify payment' : 'Record payment'}
                    </Button>
                  )}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="6" className="pm-empty-row">No invoice records found.</td>
            </tr>
          )}
        </tbody>
      </Table>

      {/* Payment Modal */}
      {selectedInvoice && (
        <Modal show={showPaymentModal} onHide={() => setShowPaymentModal(false)} centered dialogClassName="pm-modal">
          <Modal.Header closeButton>
            <Modal.Title>Record Rent Payment</Modal.Title>
          </Modal.Header>
          <Form onSubmit={handleMarkAsPaid}>
            <Modal.Body>
              <p className="mb-1"><strong>Property:</strong> {selectedInvoice.property?.title}</p>
              <p className="mb-1"><strong>Tenant:</strong> {selectedInvoice.tenant?.name}</p>
              <p className="mb-3"><strong>Amount Due:</strong> ₱{selectedInvoice.totalDue?.toLocaleString()}</p>

              {selectedInvoice.receiptUrl && (
                <div className="mb-3">
                  <a href={selectedInvoice.receiptUrl} target="_blank" rel="noreferrer" className="small">
                    View uploaded receipt image ↗
                  </a>
                </div>
              )}

              <Form.Group className="mb-3">
                <Form.Label className="pm-form-label">Payment Channel</Form.Label>
                <Form.Select
                  className="pm-input"
                  value={paymentData.paymentMethod}
                  onChange={(e) => setPaymentData({ ...paymentData, paymentMethod: e.target.value })}
                >
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="GCash">GCash</option>
                  <option value="Cash">Cash Handover</option>
                  <option value="Check">Check</option>
                </Form.Select>
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label className="pm-form-label">Reference / Remarks</Form.Label>
                <Form.Control
                  className="pm-input"
                  placeholder="e.g. Ref #12345678"
                  value={paymentData.remarks}
                  onChange={(e) => setPaymentData({ ...paymentData, remarks: e.target.value })}
                />
              </Form.Group>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="light" className="pm-btn-ghost" onClick={() => setShowPaymentModal(false)}>Cancel</Button>
              <Button variant="light" className="pm-btn-primary" type="submit">Confirm payment</Button>
            </Modal.Footer>
          </Form>
        </Modal>
      )}
    </div>
  );
}