import { useEffect, useState } from 'react';
import { Alert, Button, Form, Spinner } from 'react-bootstrap';
import { fetchSystemSettings, updateSystemSettings } from '../services/systemSettingsService';

export default function AdminSystemSettings() {
  const [settings, setSettings] = useState({ system_name: '', support_email: '', default_lease_term_months: 12 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchSystemSettings().then(setSettings).catch(() => setError('Could not load system settings.')).finally(() => setLoading(false));
  }, []);

  const handleSave = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      setSettings(await updateSystemSettings({
        ...settings,
        default_lease_term_months: Number(settings.default_lease_term_months),
      }));
      window.dispatchEvent(new Event('system-settings-updated'));
      setSaved(true);
    } catch (err) {
      setError(err.response?.data?.default_lease_term_months?.[0] || 'Could not save system settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="py-3"><Spinner size="sm" className="me-2" />Loading settings…</div>;

  return (
    <Form onSubmit={handleSave}>
      {error && <Alert variant="danger">{error}</Alert>}
      {saved && <Alert variant="success">System settings saved.</Alert>}
      <Form.Group className="mb-3"><Form.Label>System name</Form.Label><Form.Control value={settings.system_name} onChange={(e) => setSettings({ ...settings, system_name: e.target.value })} maxLength={120} required /></Form.Group>
      <Form.Group className="mb-3"><Form.Label>Support email</Form.Label><Form.Control type="email" value={settings.support_email} onChange={(e) => setSettings({ ...settings, support_email: e.target.value })} /></Form.Group>
      <Form.Group className="mb-3"><Form.Label>Default lease term (months)</Form.Label><Form.Control type="number" min="1" max="60" value={settings.default_lease_term_months} onChange={(e) => setSettings({ ...settings, default_lease_term_months: e.target.value })} required /></Form.Group>
      <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</Button>
    </Form>
  );
}
