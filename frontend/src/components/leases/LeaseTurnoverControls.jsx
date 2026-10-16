import { useState } from 'react';
import { Alert, Button, Form } from 'react-bootstrap';
import {
  moveOutLease, fetchLeaseInspections, recordLeaseInspection,
  acknowledgeLeaseInspection, fetchDepositSettlement, requestDepositSettlement,
  decideDepositSettlement, completeLeaseTurnover,
} from '../../services/contracts/contractService';

const messageFor = (error) => {
  const data = error.response?.data;
  if (data?.detail) return data.detail;
  const first = data && Object.values(data)[0];
  return Array.isArray(first) ? first[0] : first || 'Could not update the move-out record.';
};

export default function LeaseTurnoverControls({ contract, role, onUpdated, canMoveOut = true }) {
  const id = contract._id || contract.id;
  const staff = role === 'manager' || role === 'admin';
  const owner = role === 'owner';
  const tenant = role === 'tenant';
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [inspections, setInspections] = useState([]);
  const [settlement, setSettlement] = useState(null);
  const [moveForm, setMoveForm] = useState({ reason: '', effectiveDate: new Date().toISOString().slice(0, 10), instructionNote: '', instructionReference: '' });
  const [inspectionForm, setInspectionForm] = useState({ kind: 'Move Out', inspectedOn: new Date().toISOString().slice(0, 10), walls: '', floors: '', fixtures: '', cleanliness: '', notes: '', evidenceReference: '' });
  const [settlementForm, setSettlementForm] = useState({ deductions: '0.00', reason: '', evidenceReference: '' });
  const [decisionNote, setDecisionNote] = useState('');

  const reload = async () => {
    const [history, deposit] = await Promise.all([fetchLeaseInspections(id), fetchDepositSettlement(id)]);
    setInspections(history);
    setSettlement(deposit);
  };
  const run = async (work) => {
    setBusy(true); setError('');
    try {
      await work();
      await reload();
      await onUpdated?.();
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  };
  const toggle = () => {
    if (!open) void run(async () => {});
    setOpen(!open);
  };
  const submitInspection = () => {
    const { kind, inspectedOn, walls, floors, fixtures, cleanliness, notes, evidenceReference } = inspectionForm;
    const checklist = Object.fromEntries(Object.entries({ walls, floors, fixtures, cleanliness }).filter(([, value]) => value.trim()));
    void run(() => recordLeaseInspection(id, { kind, inspectedOn, checklist, notes, evidenceReference }));
  };
  if (!['Active', 'Terminated'].includes(contract.status)) return null;
  return <div className="mt-2">
    <Button size="sm" variant="link" className="p-0" aria-expanded={open} onClick={toggle}>{open ? 'Hide inspections and move-out' : 'Inspections and move-out'}</Button>
    {open && <div className="border rounded p-2 mt-2 small text-start">
      {error && <Alert variant="danger" className="py-2">{error}</Alert>}
      {contract.turnoverCompletedAt ? <p>Turnover completed {new Date(contract.turnoverCompletedAt).toLocaleDateString()}.</p> : contract.turnoverPending && <p>Turnover in progress. The unit remains unavailable until completion.</p>}
      {(owner || staff) && canMoveOut && contract.status === 'Active' && <div className="mb-3">
        <strong>Start move-out</strong>
        <Form.Control size="sm" className="my-1" type="date" aria-label="Move-out date" value={moveForm.effectiveDate} onChange={(e) => setMoveForm({ ...moveForm, effectiveDate: e.target.value })} />
        <Form.Control size="sm" className="my-1" aria-label="Move-out reason" placeholder="Reason for ending lease" value={moveForm.reason} onChange={(e) => setMoveForm({ ...moveForm, reason: e.target.value })} />
        {role === 'admin' && <><Form.Control size="sm" className="my-1" aria-label="Owner instruction" placeholder="Owner instruction" value={moveForm.instructionNote} onChange={(e) => setMoveForm({ ...moveForm, instructionNote: e.target.value })} /><Form.Control size="sm" className="my-1" aria-label="Owner instruction reference" placeholder="Instruction reference" value={moveForm.instructionReference} onChange={(e) => setMoveForm({ ...moveForm, instructionReference: e.target.value })} /></>}
        <Button size="sm" disabled={busy || !moveForm.reason.trim()} onClick={() => void run(() => moveOutLease(id, moveForm))}>Start move-out</Button>
      </div>}
      <strong>Inspections</strong>
      {inspections.length ? <ul className="ps-3 mt-1">{inspections.map((item) => <li key={item.id}>
        {item.kind} v{item.version} · {item.inspectedOn} · {Object.entries(item.checklist).map(([key, value]) => `${key}: ${value}`).join(', ')}
        {item.notes && <div>{item.notes}</div>}
        {item.evidenceReference && <div>Evidence: {item.evidenceReference}</div>}
        {item.tenantAcknowledgedAt ? <div>Tenant acknowledged {new Date(item.tenantAcknowledgedAt).toLocaleDateString()}</div> : tenant && <Button size="sm" variant="outline-secondary" disabled={busy} onClick={() => void run(() => acknowledgeLeaseInspection(id, item.id))}>Acknowledge receipt</Button>}
      </li>)}</ul> : <p className="text-muted">No inspections recorded.</p>}
      {staff && (contract.status === 'Active' || contract.turnoverPending) && <div className="mb-3">
        <strong>Record inspection</strong>
        <Form.Select size="sm" className="my-1" aria-label="Inspection type" value={inspectionForm.kind} onChange={(e) => setInspectionForm({ ...inspectionForm, kind: e.target.value })}><option>Move In</option><option>Move Out</option></Form.Select>
        <Form.Control size="sm" className="my-1" type="date" aria-label="Inspection date" value={inspectionForm.inspectedOn} onChange={(e) => setInspectionForm({ ...inspectionForm, inspectedOn: e.target.value })} />
        {['walls', 'floors', 'fixtures', 'cleanliness'].map((part) => <Form.Select key={part} size="sm" className="my-1" aria-label={`${part} condition`} value={inspectionForm[part]} onChange={(e) => setInspectionForm({ ...inspectionForm, [part]: e.target.value })}><option value="">{part} condition</option><option>Good</option><option>Fair</option><option>Damaged</option></Form.Select>)}
        <Form.Control size="sm" className="my-1" placeholder="Notes" aria-label="Inspection notes" value={inspectionForm.notes} onChange={(e) => setInspectionForm({ ...inspectionForm, notes: e.target.value })} />
        <Form.Control size="sm" className="my-1" placeholder="Photo or document reference" aria-label="Inspection evidence reference" value={inspectionForm.evidenceReference} onChange={(e) => setInspectionForm({ ...inspectionForm, evidenceReference: e.target.value })} />
        <Button size="sm" disabled={busy} onClick={submitInspection}>Save inspection version</Button>
      </div>}
      {contract.turnoverPending && <div className="mb-2"><strong>Deposit settlement</strong>
        {settlement ? <p>Decision: {settlement.status}. Deductions: {settlement.deductions}. Return amount: {settlement.returnAmount}. {settlement.reason}</p> : <p>No settlement requested.</p>}
        {staff && (!settlement || settlement.status === 'Rejected') && <div>
          <Form.Control size="sm" className="my-1" type="number" min="0" step="0.01" aria-label="Deposit deductions" value={settlementForm.deductions} onChange={(e) => setSettlementForm({ ...settlementForm, deductions: e.target.value })} />
          <Form.Control size="sm" className="my-1" aria-label="Deduction reason" placeholder="Reason for deductions" value={settlementForm.reason} onChange={(e) => setSettlementForm({ ...settlementForm, reason: e.target.value })} />
          <Form.Control size="sm" className="my-1" aria-label="Settlement evidence reference" placeholder="Evidence reference" value={settlementForm.evidenceReference} onChange={(e) => setSettlementForm({ ...settlementForm, evidenceReference: e.target.value })} />
          <Button size="sm" disabled={busy} onClick={() => void run(() => requestDepositSettlement(id, settlementForm))}>Request Owner approval</Button>
        </div>}
        {owner && settlement?.status === 'Pending' && <div>
          <Form.Control size="sm" className="my-1" aria-label="Settlement decision note" placeholder="Decision note" value={decisionNote} onChange={(e) => setDecisionNote(e.target.value)} />
          <Button size="sm" className="me-2" disabled={busy} onClick={() => void run(() => decideDepositSettlement(id, true, decisionNote))}>Approve</Button>
          <Button size="sm" variant="outline-danger" disabled={busy} onClick={() => void run(() => decideDepositSettlement(id, false, decisionNote))}>Reject</Button>
        </div>}
        {staff && settlement?.status === 'Approved' && <Button size="sm" disabled={busy} onClick={() => void run(() => completeLeaseTurnover(id))}>Complete turnover</Button>}
      </div>}
    </div>}
  </div>;
}
