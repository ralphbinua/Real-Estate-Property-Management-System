import { useState } from 'react';
import { Button } from 'react-bootstrap';
import api from '../../services/core/api';

export default function ExportCsvButton({ resource, label = 'Export CSV' }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const download = async () => {
    setBusy(true); setError('');
    try {
      const response = await api.get(`/${resource}/export/`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${resource}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      if (response.headers['x-export-truncated'] === 'true') setError('Export limited to 10,000 rows. Narrow the list filters for the rest.');
    } catch {
      setError('Export failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  return <span className="d-inline-flex align-items-center gap-2"><Button size="sm" variant="outline-secondary" disabled={busy} onClick={download}>{busy ? 'Exporting…' : label}</Button>{error && <span role="alert" className="small text-danger">{error}</span>}</span>;
}
