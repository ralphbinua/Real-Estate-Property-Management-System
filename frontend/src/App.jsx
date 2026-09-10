import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';

// Import Pages
import Login from './pages/Login';
import AdminDashboard from './pages/AdminDashboard';
import ManagerDashboard from './pages/ManagerDashboard';
import AgentDashboard from './pages/AgentDashboard';
import TenantDashboard from './pages/TenantDashboard';
import OwnerDashboard from './pages/OwnerDashboard';
import NotFound from './pages/NotFound';

// Import the Protected Route Wrapper
import RoleProtectedRoute from './components/RoleProtectedRoute';

function App() {
  return (
    <Router>
      <Routes>
        {/* Public Route */}
        <Route path="/" element={<Login />} />
        
        {/* Protected Routes by Role */}
        <Route element={<RoleProtectedRoute allowedRoles={['Admin']} />}>
          <Route path="/admin" element={<AdminDashboard />} />
        </Route>

        <Route element={<RoleProtectedRoute allowedRoles={['Admin', 'Property Manager']} />}>
          <Route path="/manager" element={<ManagerDashboard />} />
        </Route>

        <Route element={<RoleProtectedRoute allowedRoles={['Admin', 'Property Manager', 'Agent']} />}>
          <Route path="/agent" element={<AgentDashboard />} />
        </Route>

        <Route element={<RoleProtectedRoute allowedRoles={['Tenant']} />}>
          <Route path="/tenant" element={<TenantDashboard />} />
        </Route>

        <Route element={<RoleProtectedRoute allowedRoles={['Owner']} />}>
          <Route path="/owner" element={<OwnerDashboard />} />
        </Route>

        {/* Catch-all Routes */}
        <Route path="/unauthorized" element={<h2>Unauthorized Access</h2>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Router>
  );
}

export default App;