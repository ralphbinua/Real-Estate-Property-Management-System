import { Button } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import './NotFound.css';

export default function NotFound() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user'));

  const handleReturnHome = () => {
    if (!user) {
      navigate('/login');
      return;
    }

    const role = user.role?.toLowerCase();
    if (role === 'admin') navigate('/admin');
    else if (role === 'property manager') navigate('/manager');
    else if (role === 'agent') navigate('/agent');
    else if (role === 'tenant') navigate('/tenant');
    else if (role === 'owner') navigate('/owner');
    else navigate('/login');
  };

  return (
    <div className="pm-notfound-page">
      <div className="pm-notfound-card">
        <div className="pm-notfound-code">404</div>
        <h1 className="pm-notfound-title">Page not found</h1>
        <p className="pm-notfound-subtitle">
          The page or resource you are looking for doesn't exist or has been relocated within the portal system.
        </p>

        <Button
          variant="light"
          className="pm-btn-primary"
          onClick={handleReturnHome}
        >
          Return to dashboard
        </Button>
      </div>
    </div>
  );
}