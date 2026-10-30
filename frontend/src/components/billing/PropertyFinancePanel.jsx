import { useEffect, useState } from 'react';
import { Alert, Button, Form, Spinner } from 'react-bootstrap';
import Table from '../ui/ResponsiveTable.jsx';
import { useAuth } from '../../context/useAuth';
import { fetchProperties } from '../../services/properties/propertyService';
import { createExpense, decideExpense, exportExpenses, fetchExpenses, fetchOwnerStatement, reviseExpense, reverseExpense, submitExpense } from '../../services/billing/expenseService';
import formatCurrency from '../../utils/formatCurrency';

const emptyForm = { category: 'Repairs', amount: '', incurredOn: new Date().toISOString().slice(0, 10), payee: '', reference: '', description: '' };
const categories = ['Repairs', 'Utilities', 'Insurance', 'Taxes', 'Fees', 'Other'];
const errorMessage = (error) => {
  const data = error.response?.data;
  if (data?.detail) return data.detail;
  const first = data && Object.values(data)[0];
  return Array.isArray(first) ? first[0] : first || 'Could not load or save property finances.';
};

export default function PropertyFinancePanel() {
  const { user } = useAuth();
  const owner = user?.role === 'Owner';
  const staff = ['Admin', 'Property Manager'].includes(user?.role);
  const [properties, setProperties] = useState([]);
  const [propertyId, setPropertyId] = useState('');
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [expenses, setExpenses] = useState([]);
  const [statement, setStatement] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [decisionNote, setDecisionNote] = useState({});
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchProperties().then((data) => {
      const items = Array.isArray(data) ? data : data?.results || [];
      setProperties(items);
      if (items.length) setPropertyId(String(items[0]._id || items[0].id));
    }).catch((err) => setError(errorMessage(err)));
  }, []);

  const refresh = async (selected = propertyId, selectedMonth = month) => {
    if (!selected) return;
    setLoading(true); setError('');
    try {
      const [expenseData, statementData] = await Promise.all([
        fetchExpenses({ propertyId: selected }), fetchOwnerStatement(selected, selectedMonth),
      ]);
      setExpenses(Array.isArray(expenseData) ? expenseData : expenseData?.results || []);
      setStatement(statementData);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (!propertyId) return undefined;
    let cancelled = false;
    Promise.all([fetchExpenses({ propertyId }), fetchOwnerStatement(propertyId, month)])
      .then(([expenseData, statementData]) => {
        if (cancelled) return;
        setExpenses(Array.isArray(expenseData) ? expenseData : expenseData?.results || []);
        setStatement(statementData);
      })
      .catch((err) => { if (!cancelled) setError(errorMessage(err)); });
    return () => { cancelled = true; };
  }, [propertyId, month]);

  const save = async (event) => {
    event.preventDefault(); setError(''); setSuccess('');
    try {
      if (editing) await reviseExpense(editing, form);
      else await createExpense({ ...form, propertyId: Number(propertyId) });
      setEditing(null); setForm(emptyForm);
      setSuccess(editing && expenses.find((item) => item.id === editing)?.status === 'Draft' ? 'Expense draft saved.' : 'Expense submitted for Owner approval.');
      await refresh();
    } catch (err) { setError(errorMessage(err)); }
  };
  const decide = async (id, approved) => {
    setError(''); setSuccess('');
    try {
      await decideExpense(id, approved, decisionNote[id] || '');
      setSuccess(approved ? 'Expense approved.' : 'Expense rejected.');
      await refresh();
    } catch (err) { setError(errorMessage(err)); }
  };
  const reverse = async (id) => {
    setError(''); setSuccess('');
    try {
      await reverseExpense(id, decisionNote[id] || '');
      setSuccess('Expense reversed. Record a new entry if needed.');
      await refresh();
    } catch (err) { setError(errorMessage(err)); }
  };
  const submitDraft = async (id) => {
    setError(''); setSuccess('');
    try {
      await submitExpense(id);
      setSuccess('Expense submitted for Owner approval.');
      await refresh();
    } catch (err) { setError(errorMessage(err)); }
  };
  const exportCsv = async () => {
    if (!propertyId) return;
    setError(''); setExporting(true);
    try {
      const response = await exportExpenses(propertyId);
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `expenses-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setExporting(false);
    }
  };

  return <section className="mt-4" aria-label="Property expenses and Owner statement">
    <h5 className="fw-bold mb-2">Property expenses and Owner statement</h5>
    <p className="small text-muted">Statements show verified rent collected less Owner-approved expenses for the selected month. They do not track tax or payouts.</p>
    {error && <Alert variant="danger">{error}</Alert>}
    {success && <Alert variant="success">{success}</Alert>}
    <div className="d-flex flex-wrap gap-2 mb-3">
      <Form.Group><Form.Label className="small">Property</Form.Label><Form.Select size="sm" value={propertyId} onChange={(e) => setPropertyId(e.target.value)}><option value="">Choose property</option>{properties.map((item) => <option key={item._id || item.id} value={item._id || item.id}>{item.title}</option>)}</Form.Select></Form.Group>
      <Form.Group><Form.Label className="small">Statement month</Form.Label><Form.Control size="sm" type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></Form.Group>
    </div>
    {loading && <p><Spinner size="sm" /> Loading finances…</p>}
    {statement && <div className="mb-3">
      <div className="d-flex flex-wrap gap-3 mb-2"><strong>Verified rent: {formatCurrency(statement.verifiedRentCollected)}</strong><strong>Approved expenses: {formatCurrency(statement.approvedExpenses)}</strong><strong>Net cash: {formatCurrency(statement.netCash)}</strong></div>
      <details><summary>Statement source records</summary>
        <Table responsive size="sm"><thead><tr><th>Type</th><th>Record</th><th>Date</th><th>Amount</th></tr></thead><tbody>
          {statement.incomeItems.map((item) => <tr key={`p${item.paymentId}`}><td>Verified payment</td><td>Payment #{item.paymentId}, invoice #{item.invoiceId}</td><td>{item.date}</td><td>{formatCurrency(item.amount)}</td></tr>)}
          {statement.expenseItems.map((item) => <tr key={`e${item.expenseId}`}><td>{item.category} expense</td><td>Expense #{item.expenseId}</td><td>{item.date}</td><td>{formatCurrency(item.amount)}</td></tr>)}
        </tbody></Table>
      </details>
    </div>}
    {staff && propertyId && <Form onSubmit={save} className="border rounded p-3 mb-3">
      <h6>{editing ? `Revise expense #${editing}` : 'Record property expense'}</h6>
      <div className="row g-2">
        <div className="col-12 col-sm-6 col-lg-3"><Form.Label className="small">Category</Form.Label><Form.Select size="sm" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{categories.map((item) => <option key={item}>{item}</option>)}</Form.Select></div>
        <div className="col-12 col-sm-6 col-lg-3"><Form.Label className="small">Amount</Form.Label><Form.Control size="sm" type="number" min="0.01" step="0.01" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
        <div className="col-12 col-sm-6 col-lg-3"><Form.Label className="small">Incurred date</Form.Label><Form.Control size="sm" type="date" required value={form.incurredOn} onChange={(e) => setForm({ ...form, incurredOn: e.target.value })} /></div>
        <div className="col-12 col-sm-6 col-lg-3"><Form.Label className="small">Payee</Form.Label><Form.Control size="sm" maxLength={160} required value={form.payee} onChange={(e) => setForm({ ...form, payee: e.target.value })} /></div>
        <div className="col-12 col-sm-6"><Form.Label className="small">Receipt or document reference</Form.Label><Form.Control size="sm" maxLength={500} value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></div>
        <div className="col-12 col-sm-6"><Form.Label className="small">Description</Form.Label><Form.Control size="sm" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
      </div>
      <div className="mt-2"><Button size="sm" type="submit">{editing ? (expenses.find((item) => item.id === editing)?.status === 'Draft' ? 'Save draft' : 'Resubmit expense') : 'Submit expense'}</Button>{editing && <Button size="sm" variant="link" onClick={() => { setEditing(null); setForm(emptyForm); }}>Cancel edit</Button>}</div>
    </Form>}
    {propertyId && <><div className="d-flex flex-wrap align-items-center justify-content-between gap-2"><h6 className="mb-0">Expense history</h6><Button size="sm" variant="outline-secondary" disabled={!propertyId || exporting} onClick={exportCsv}>{exporting ? 'Exporting…' : 'Export expenses CSV'}</Button></div><Table responsive className="pm-table mt-2"><thead><tr><th>Date</th><th>Category</th><th>Payee</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead><tbody>
      {expenses.map((item) => <tr key={item.id}><td>{item.incurredOn}</td><td>{item.category}</td><td>{item.payee}{item.reference && <small className="d-block">Reference: {item.reference}</small>}</td><td>{formatCurrency(item.amount)}</td><td>{item.status}{item.decisionNote && <small className="d-block">{item.decisionNote}</small>}</td><td>
        {owner && item.status === 'Pending' && <><Form.Control size="sm" className="mb-1" aria-label={`Decision note for expense ${item.id}`} placeholder="Decision note" value={decisionNote[item.id] || ''} onChange={(e) => setDecisionNote((current) => ({ ...current, [item.id]: e.target.value }))} /><Button size="sm" className="me-1" onClick={() => decide(item.id, true)}>Approve</Button><Button size="sm" variant="outline-danger" onClick={() => decide(item.id, false)}>Reject</Button></>}
        {owner && item.status === 'Approved' && <><Form.Control size="sm" className="mb-1" aria-label={`Reversal reason for expense ${item.id}`} placeholder="Reason for reversal" value={decisionNote[item.id] || ''} onChange={(e) => setDecisionNote((current) => ({ ...current, [item.id]: e.target.value }))} /><Button size="sm" variant="outline-danger" disabled={!decisionNote[item.id]?.trim()} onClick={() => reverse(item.id)}>Reverse</Button></>}
        {staff && ['Draft', 'Pending', 'Rejected'].includes(item.status) && <Button size="sm" variant="outline-secondary" onClick={() => { setEditing(item.id); setForm({ category: item.category, amount: item.amount, incurredOn: item.incurredOn, payee: item.payee, reference: item.reference, description: item.description }); }}>Revise</Button>}
        {staff && item.status === 'Draft' && <Button size="sm" className="ms-1" onClick={() => submitDraft(item.id)}>Submit for Owner approval</Button>}
        <details><summary>History</summary><ul className="ps-3">{item.history?.map((event, index) => <li key={`${event.at}-${index}`}>{event.summary}</li>)}</ul></details>
      </td></tr>)}
      {!expenses.length && <tr><td colSpan="6">No expenses recorded for this property.</td></tr>}
    </tbody></Table></>}
  </section>;
}
