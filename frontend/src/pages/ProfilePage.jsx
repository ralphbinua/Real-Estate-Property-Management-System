import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Form, Spinner } from 'react-bootstrap';
import { useAuth } from '../context/useAuth';
import { ROLE_WORKSPACES } from '../config/workspaceNavigation';
import { fetchMyProfile, updateMyProfile, changeMyPassword, requestEmailChange } from '../services/profileService';
import './ProfilePage.css';

const editableFields = (profile) => ({
  first_name: profile.first_name || '',
  middle_name: profile.middle_name || '',
  last_name: profile.last_name || '',
  phone_number: profile.phone_number || '',
});

function errorMessage(error) {
  const data = error.response?.data;
  if (typeof data?.detail === 'string') return data.detail;
  for (const field of ['first_name', 'middle_name', 'last_name', 'phone_number', 'email', 'new_email', 'current_password', 'new_password', 'confirm_password', 'non_field_errors']) {
    const message = data?.[field];
    if (Array.isArray(message) && message[0]) return String(message[0]);
    if (typeof message === 'string') return message;
  }
  return 'Could not save your profile. Please try again.';
}

export default function ProfilePage() {
  const { user, updateUser } = useAuth();
  const [form, setForm] = useState(() => editableFields(user || {}));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [email, setEmail] = useState(user?.email || '');
  const [passwordForm, setPasswordForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [emailForm, setEmailForm] = useState({ new_email: '', current_password: '' });
  const [securityBusy, setSecurityBusy] = useState(false);
  const [securityMessage, setSecurityMessage] = useState('');
  const [securityError, setSecurityError] = useState('');
  const workspacePath = ROLE_WORKSPACES[user?.role]?.path || '/tenant';

  useEffect(() => {
    let active = true;
    fetchMyProfile()
      .then((profile) => { if (active) { setForm(editableFields(profile)); setEmail(profile.email || ''); } })
      .catch(() => { if (active) setError('Could not load your profile. Please try again.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const handleSave = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const profile = await updateMyProfile(form);
      setForm(editableFields(profile));
      updateUser(profile);
      setSuccess('Your profile was updated.');
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async (event) => {
    event.preventDefault();
    setSecurityBusy(true); setSecurityError(''); setSecurityMessage('');
    try {
      const result = await changeMyPassword(passwordForm);
      setPasswordForm({ current_password: '', new_password: '', confirm_password: '' });
      setSecurityMessage(result.detail);
    } catch (changeError) { setSecurityError(errorMessage(changeError)); }
    finally { setSecurityBusy(false); }
  };

  const handleEmailChange = async (event) => {
    event.preventDefault();
    setSecurityBusy(true); setSecurityError(''); setSecurityMessage('');
    try {
      const result = await requestEmailChange(emailForm);
      setEmail(result.profile.email);
      updateUser(result.profile);
      setEmailForm({ new_email: '', current_password: '' });
      setSecurityMessage(result.detail);
    } catch (changeError) { setSecurityError(errorMessage(changeError)); }
    finally { setSecurityBusy(false); }
  };

  return (
    <div className="pm-profile-page">
      <div className="pm-profile-shell">
        <Link to={workspacePath} className="pm-profile-back">← Back to workspace</Link>
        <div className="pm-profile-heading">
          <span className="pm-profile-overline">ACCOUNT</span>
          <h1>Your profile</h1>
          <p>Keep your personal information up to date.</p>
        </div>
        <section className="pm-profile-card" aria-label="Basic information">
          <div className="pm-profile-card-heading">
            <h2>Basic information</h2>
            <p>Your role is assigned by an administrator.</p>
          </div>
          {error && <div className="pm-alert pm-alert-error" role="alert">{error}</div>}
          {success && <div className="pm-alert pm-alert-success" role="status">{success}</div>}
          {loading ? (
            <div className="pm-profile-loading" role="status"><Spinner size="sm" className="me-2" />Loading profile…</div>
          ) : (
            <Form onSubmit={handleSave} className="pm-profile-form">
              <div className="pm-profile-name-row">
                <Form.Group controlId="profile-first-name">
                  <Form.Label>First name</Form.Label>
                  <Form.Control value={form.first_name} onChange={(event) => setForm({ ...form, first_name: event.target.value })} required maxLength={150} />
                </Form.Group>
                <Form.Group controlId="profile-middle-name">
                  <Form.Label>Middle name (optional)</Form.Label>
                  <Form.Control value={form.middle_name} onChange={(event) => setForm({ ...form, middle_name: event.target.value })} maxLength={150} />
                </Form.Group>
                <Form.Group controlId="profile-last-name">
                  <Form.Label>Last name</Form.Label>
                  <Form.Control value={form.last_name} onChange={(event) => setForm({ ...form, last_name: event.target.value })} maxLength={150} />
                </Form.Group>
              </div>
              <Form.Group controlId="profile-phone-number">
                <Form.Label>Phone number (optional)</Form.Label>
                <Form.Control type="tel" autoComplete="tel" value={form.phone_number} onChange={(event) => setForm({ ...form, phone_number: event.target.value })} maxLength={30} />
              </Form.Group>
              <Form.Group controlId="profile-email">
                <Form.Label>Email</Form.Label>
                <Form.Control type="email" value={email} readOnly aria-readonly="true" />
              </Form.Group>
              <Form.Group controlId="profile-role">
                <Form.Label>Role</Form.Label>
                <Form.Control value={user?.role || ''} readOnly aria-readonly="true" />
              </Form.Group>
              <div className="pm-profile-actions"><Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</Button></div>
            </Form>
          )}
        </section>
        <section className="pm-profile-card" aria-label="Account security">
          <div className="pm-profile-card-heading"><h2>Account security</h2><p>Update your password or email address.</p></div>
          {securityError && <div className="pm-alert pm-alert-error" role="alert">{securityError}</div>}
          {securityMessage && <div className="pm-alert pm-alert-success" role="status">{securityMessage}</div>}
          <Form onSubmit={handlePasswordChange} className="pm-profile-form">
            <h3>Change password</h3>
            <Form.Group controlId="current-password"><Form.Label>Current password</Form.Label><Form.Control type="password" autoComplete="current-password" value={passwordForm.current_password} onChange={(event) => setPasswordForm({ ...passwordForm, current_password: event.target.value })} required /></Form.Group>
            <Form.Group controlId="new-password"><Form.Label>New password</Form.Label><Form.Control type="password" autoComplete="new-password" value={passwordForm.new_password} onChange={(event) => setPasswordForm({ ...passwordForm, new_password: event.target.value })} required /></Form.Group>
            <Form.Group controlId="confirm-password"><Form.Label>Confirm new password</Form.Label><Form.Control type="password" autoComplete="new-password" value={passwordForm.confirm_password} onChange={(event) => setPasswordForm({ ...passwordForm, confirm_password: event.target.value })} required /></Form.Group>
            <div className="pm-profile-actions"><Button type="submit" disabled={securityBusy}>Change password</Button></div>
          </Form>
          <Form onSubmit={handleEmailChange} className="pm-profile-form">
            <h3>Change email</h3>
            <p>Your email changes immediately after you enter your current password. Use the new address the next time you sign in.</p>
            <Form.Group controlId="new-email"><Form.Label>New email address</Form.Label><Form.Control type="email" autoComplete="email" value={emailForm.new_email} onChange={(event) => setEmailForm({ ...emailForm, new_email: event.target.value })} required maxLength={254} /></Form.Group>
            <Form.Group controlId="email-current-password"><Form.Label>Current password</Form.Label><Form.Control type="password" autoComplete="current-password" value={emailForm.current_password} onChange={(event) => setEmailForm({ ...emailForm, current_password: event.target.value })} required /></Form.Group>
            <div className="pm-profile-actions"><Button type="submit" disabled={securityBusy}>Change email</Button></div>
          </Form>
        </section>
      </div>
    </div>
  );
}
