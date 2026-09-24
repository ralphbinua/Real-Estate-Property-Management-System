import { useState, useEffect } from 'react';
import { Table, Button, Spinner, Form, Modal } from 'react-bootstrap';
import { fetchInvoices, recordPayment, triggerMonthlyBilling } from '../services/invoiceService';

const STATUS_PILL_CLASS = {
  pending: 'pm-pill-pending',
  paid: 'pm-pill-available',
  overdue: 'pm-pill-maintenance',
  cancelled: 'pm-pill-terminated',
};

function StatusPill({ status }) {
  if (!status) return null;
  const cls = STATUS_PILL_CLASS[status.toLowerCase()] || 'pm-pill-default';
  return (
    <span className={`pm-pill ${cls}`}>
      <span className="pm-pill-dot" />
      {status}
    </span>
  );
}

export default function ManagerInvoiceTracker() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Payment Recording Modal State
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('GCash');

  const loadInvoices = async () => {
    setLoading(true);
    try {
      const data = await fetchInvoices();
      setInvoices(Array.isArray(data) ? data : []);
      setError('');
    } catch (err) {
      setError('Failed to load invoice ledger.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInvoices();
  }, []);

  const handleRunBilling = async () => {
    if (window.confirm('Run automated monthly billing for all active lease contracts?')) {
      setError('');
      setSuccess('');
      try {
        const res = await triggerMonthlyBilling();
        setSuccess(res?.message || 'Monthly rent invoices generated successfully!');
        loadInvoices();
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to run billing cycle.');
      }
    }
  };

  const handleOpenPaymentModal = (invoiceId) => {
    setSelectedInvoiceId(invoiceId);
    setPaymentMethod('GCash');
    setShowPaymentModal(true);
  };

  const handlePaymentSubmit = async (e) => {
    e.preventDefault();
    if (!selectedInvoiceId) return;

    setError('');
    setSuccess('');
    try {
      await recordPayment(selectedInvoiceId, { paymentMethod });
      setSuccess('Rent payment logged successfully!');
      setShowPaymentModal(false);
      loadInvoices();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to record payment.');
    }
  };

  return (
    <div className="pm-invoice-tracker">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h4 className="fw-bold mb-1">Monthly Rent Invoices</h4>
          <p className="text-muted small mb-0">
            Track rent collection, view due dates, and record manual payments
          </p>
        </div>
        <Button
          variant="light"
          className="pm-btn-primary"
          onClick={handleRunBilling}
        >
          Run monthly billing batch
        </Button>
      </div>

      {error && (
        <div className="pm-alert pm-alert-error mb-3" role="alert">
          <span>{error}</span>
          <button className="pm-alert-close" onClick={() => setError('')} aria-label="Dismiss">×</button>
        </div>
      )}
      {success && (
        <div className="pm-alert pm-alert-success mb-3" role="alert">
          <span>{success}</span>
          <button className="pm-alert-close" onClick={() => setSuccess('')} aria-label="Dismiss">×</button>
        </div>
      )}

      {loading ? (
        <div className="pm-loading py-4">
          <Spinner animation="border" size="sm" className="me-2" />
          Synchronizing billing ledger…
        </div>
      ) : (
        <Table responsive className="pm-table mb-0">
          <thead>
            <tr>
              <th>Property</th>
              <th>Tenant</th>
              <th>Due date</th>
              <th>Total due</th>
              <th>Status</th>
              <th className="text-center">Action</th>
            </tr>
          </thead>
          <tbody>
            {invoices.length > 0 ? (
              invoices.map((inv) => {
                const invoiceId = inv._id || inv.id;

                const propertyTitle =
                  inv.propertyDetails?.title ||
                  inv.contractDetails?.propertyDetails?.title ||
                  inv.property?.title ||
                  inv.propertyTitle ||
                  (typeof inv.property === 'string' ? inv.property : null) ||
                  'N/A';

                const tenantName =
                  inv.tenantDetails?.name ||
                  inv.contractDetails?.tenantDetails?.name ||
                  inv.tenant?.name ||
                  inv.tenantName ||
                  (typeof inv.tenant === 'string' ? inv.tenant : null) ||
                  'N/A';

                const totalDueVal = Number(inv.totalDue || inv.total_due || inv.amount || inv.rentAmount || 0);

                return (
                  <tr key={invoiceId}>
                    <td className="pm-cell-title">{propertyTitle}</td>
                    <td>{tenantName}</td>
                    <td>{inv.dueDate || inv.due_date || '—'}</td>
                    <td className="pm-cell-strong">
                      ₱{totalDueVal.toLocaleString('en-PH', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td>
                      <StatusPill status={inv.status} />
                    </td>
                    <td className="text-center">
                      {inv.status === 'Pending' && (
                        <Button
                          variant="light"
                          size="sm"
                          className="pm-btn-edit-outline"
                          onClick={() => handleOpenPaymentModal(invoiceId)}
                        >
                          Record payment
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan="6" className="pm-empty-row">
                  No rent invoices recorded. Click "Run monthly billing batch" to generate invoices.
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      )}

      {/* Modal: Manual Payment Logger */}
      <Modal show={showPaymentModal} onHide={() => setShowPaymentModal(false)} centered dialogClassName="pm-modal">
        <Modal.Header closeButton>
          <Modal.Title>Record Rent Payment</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handlePaymentSubmit}>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label className="pm-form-label">Select Payment Channel</Form.Label>
              <Form.Select
                className="pm-input"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                required
              >
                <option value="GCash">GCash Transfer</option>
                <option value="Bank Deposit">PSBank / Bank Transfer</option>
                <option value="Cash">Cash / OTC</option>
                <option value="Check">Check Payment</option>
              </Form.Select>
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="light" className="pm-btn-ghost" onClick={() => setShowPaymentModal(false)}>
              Cancel
            </Button>
            <Button variant="light" className="pm-btn-primary" type="submit">
              Confirm & Mark Paid
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </div>
  );
}