import { useState } from 'react';
import { Form, Button } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import './Login.css';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await login(email, password);

      if (result.success) {
        const role = result.user?.role?.toLowerCase();
        if (role === 'admin') navigate('/admin');
        else if (role === 'property manager') navigate('/manager');
        else if (role === 'agent') navigate('/agent');
        else if (role === 'tenant') navigate('/tenant');
        else if (role === 'owner') navigate('/owner');
        else navigate('/unauthorized');
      } else {
        setError(result.message || 'Invalid credentials.');
      }
    } catch {
      setError('An unexpected connection error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pm-login-page">
      <section className="pm-login-card">
        <div className="pm-login-overline">WORKSPACE ACCESS</div>
        <h1 className="pm-login-title">Sign in</h1>
        <p className="pm-login-subtitle">Enter your account details to continue.</p>

        {error && (
          <div className="pm-alert" role="alert">
            <span>{error}</span>
            <button className="pm-alert-close" onClick={() => setError('')} aria-label="Dismiss">×</button>
          </div>
        )}

        <Form onSubmit={handleSubmit}>
          <Form.Group className="mb-3" controlId="email">
            <Form.Label className="pm-form-label">Email address</Form.Label>
            <Form.Control
              className="pm-input"
              type="email"
              name="email"
              autoComplete="username"
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Form.Group>

          <Form.Group className="mb-4" controlId="password">
            <Form.Label className="pm-form-label">Password</Form.Label>
            <Form.Control
              className="pm-input"
              type="password"
              name="password"
              autoComplete="current-password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Form.Group>

          <Button variant="light" type="submit" className="pm-btn-primary w-100" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>
        </Form>
      </section>
    </div>
  );
}
