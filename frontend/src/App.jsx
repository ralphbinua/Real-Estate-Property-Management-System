import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import NavigationBar from './components/Navbar';
import Login from './pages/Login';
import AdminDashboard from './pages/AdminDashboard';
import TenantDashboard from './pages/TenantDashboard';
import ManagerDashboard from './pages/ManagerDashboard';
import AgentDashboard from './pages/AgentDashboard';
import OwnerDashboard from './pages/OwnerDashboard';

// ProtectedRoute component handling authentication and case-insensitive role checks
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user } = useAuth();
  
  if (!user) return <Navigate to="/login" replace />;
  
  const userRole = user.role?.toLowerCase();
  const hasAccess = allowedRoles.some(role => role.toLowerCase() === userRole);

  if (!hasAccess) return <h2 className="text-center mt-5">Unauthorized Access</h2>;
  
  return children;
};

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <NavigationBar />
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Navigate to="/login" replace />} />

          {/* Protected Dashboard Routes */}
          <Route 
            path="/admin" 
            element={
              <ProtectedRoute allowedRoles={['Admin']}>
                <AdminDashboard />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/tenant" 
            element={
              <ProtectedRoute allowedRoles={['Tenant']}>
                <TenantDashboard />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/manager" 
            element={
              <ProtectedRoute allowedRoles={['Property Manager', 'Admin']}>
                <ManagerDashboard />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/agent" 
            element={
              <ProtectedRoute allowedRoles={['Agent', 'Admin']}>
                <AgentDashboard />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/owner" 
            element={
              <ProtectedRoute allowedRoles={['Owner', 'Admin']}>
                <OwnerDashboard />
              </ProtectedRoute>
            } 
          />

          {/* Fallback route */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}