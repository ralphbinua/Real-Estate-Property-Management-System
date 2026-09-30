import { useCallback, useEffect, useState } from 'react';
import { Button, Spinner, Table } from 'react-bootstrap';
import { fetchSystemActivity } from '../services/userService';

export default function AdminActivityLog() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setEvents(await fetchSystemActivity());
      setError('');
    } catch (err) {
      setError('Could not load system activity.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="d-flex justify-content-end mb-2"><Button size="sm" variant="outline-secondary" onClick={load}>Refresh</Button></div>
      {error && <div className="alert alert-danger">{error}</div>}
      {loading ? <div className="py-4 text-center"><Spinner size="sm" className="me-2" />Loading activity…</div> : (
        <Table responsive className="pm-table mb-0">
          <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Record</th><th>Details</th></tr></thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id}>
                <td>{new Date(event.createdAt).toLocaleString()}</td><td>{event.actor}</td><td>{event.action}</td>
                <td>{event.entityType} {event.entityId}</td><td>{event.summary}</td>
              </tr>
            ))}
            {events.length === 0 && <tr><td colSpan="5" className="text-center text-muted py-4">No activity recorded yet.</td></tr>}
          </tbody>
        </Table>
      )}
    </div>
  );
}
