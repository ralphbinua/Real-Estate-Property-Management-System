import { useState } from 'react';
import { Alert, Button, Form, Modal } from 'react-bootstrap';
import { decideLeaseRenewal, prepareLeaseRenewal, proposeLeaseRenewal } from '../../services/contracts/contractService';

const messageFor = (error) => error.response?.data?.detail || error.response?.data?.endDate?.[0]
  || error.response?.data?.rentAmount?.[0] || 'Could not update this renewal.';

export default function RenewalControls({ contract, role, onUpdated }) {
  const [showProposal, setShowProposal] = useState(false);
  const [endDate, setEndDate] = useState('');
  const [rentAmount, setRentAmount] = useState(contract.rentAmount || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const id = contract._id || contract.id;
  const renewal = contract.renewal;
  const daysLeft = contract.status === 'Active'
    ? Math.ceil((new Date(`${contract.endDate}T00:00:00`) - new Date()) / 86400000)
    : null;

  const perform = async (operation) => {
    setBusy(true);
    setError('');
    try {
      await operation();
      setShowProposal(false);
      await onUpdated?.();
    } catch (failure) {
      setError(messageFor(failure));
    } finally {
      setBusy(false);
    }
  };

  return <div className="mt-2">
    {daysLeft !== null && daysLeft >= 0 && daysLeft <= 60 && <div className="small text-warning">Ends in {daysLeft} day{daysLeft === 1 ? '' : 's'}</div>}
    {renewal && <div className="small text-muted">Renewal: {renewal.status} · {renewal.startDate}–{renewal.endDate}</div>}
    {contract.renewalHistory?.length > 1 && <details className="small mt-1">
      <summary>Renewal proposal history ({contract.renewalHistory.length})</summary>
      <ol className="mb-1 mt-1">
        {contract.renewalHistory.map((item) => <li key={item.id}>
          Version {item.version}: {item.status} · {item.startDate}–{item.endDate} · {item.rentAmount}/month
          {item.decisionNote && <div className="text-muted">Decision note: {item.decisionNote}</div>}
        </li>)}
      </ol>
    </details>}
    {error && <Alert variant="danger" className="small py-1 my-2">{error}</Alert>}
    {contract.status === 'Active' && !renewal && daysLeft >= 0 && <Button size="sm" variant="outline-primary" disabled={busy} onClick={() => setShowProposal(true)}>Propose renewal</Button>}
    {role === 'owner' && renewal?.status === 'Proposed' && <div className="d-flex gap-2 mt-1">
      <Button size="sm" disabled={busy} onClick={() => perform(() => decideLeaseRenewal(id, true))}>Approve renewal</Button>
      <Button size="sm" variant="outline-danger" disabled={busy} onClick={() => perform(() => decideLeaseRenewal(id, false))}>Decline</Button>
    </div>}
    {(role === 'manager' || role === 'owner') && renewal?.status === 'Declined' && contract.status === 'Active' && daysLeft >= 0 && <Button size="sm" variant="outline-primary" disabled={busy} onClick={() => setShowProposal(true)}>Propose revised renewal</Button>}
    {renewal?.status === 'Approved' && daysLeft < 0 && <Button size="sm" variant="outline-primary" disabled={busy} onClick={() => perform(() => prepareLeaseRenewal(id))}>Prepare next lease</Button>}
    {renewal?.status === 'Prepared' && <div className="small text-muted">Next lease #{renewal.successorId} is waiting for external signatures and authorized activation.</div>}

    <Modal show={showProposal} onHide={() => !busy && setShowProposal(false)} centered>
      <Form onSubmit={(event) => { event.preventDefault(); void perform(() => proposeLeaseRenewal(id, { endDate, rentAmount })); }}>
        <Modal.Header closeButton><Modal.Title>Propose lease renewal</Modal.Title></Modal.Header>
        <Modal.Body>
          <p className="small text-muted">The next term starts the day after {contract.endDate}. The current lease stays active until it ends. Signatures are recorded outside the app.</p>
          {error && <Alert variant="danger">{error}</Alert>}
          <Form.Group className="mb-3"><Form.Label>New end date</Form.Label><Form.Control type="date" required min={contract.endDate} value={endDate} onChange={(event) => setEndDate(event.target.value)} /></Form.Group>
          <Form.Group><Form.Label>Monthly rent</Form.Label><Form.Control type="number" required min="0.01" step="0.01" value={rentAmount} onChange={(event) => setRentAmount(event.target.value)} /></Form.Group>
          {role === 'manager' && <p className="small text-muted mt-3 mb-0">The Owner must approve this proposal before a new lease can be prepared.</p>}
        </Modal.Body>
        <Modal.Footer><Button variant="outline-secondary" onClick={() => setShowProposal(false)} disabled={busy}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save proposal'}</Button></Modal.Footer>
      </Form>
    </Modal>
  </div>;
}
