import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import AdminDashboard from './pages/AdminDashboard';
import ManagerDashboard from './pages/ManagerDashboard';
import AgentDashboard from './pages/AgentDashboard';
import TenantDashboard from './pages/TenantDashboard';
import OwnerDashboard from './pages/OwnerDashboard';
import NotFound from './pages/NotFound';

// Role-based protection wrapper
const RoleProtectedRoute = ({ children, allowedRoles }) => {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
};

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Login />} />
          
          <Route path="/admin" element={
            <RoleProtectedRoute allowedRoles={['Admin']}>
              <AdminDashboard />
            </RoleProtectedRoute>
          } />

          <Route path="/manager" element={
            <RoleProtectedRoute allowedRoles={['Admin', 'Property Manager']}>
              <ManagerDashboard />
            </RoleProtectedRoute>
          } />

          <Route path="/agent" element={
            <RoleProtectedRoute allowedRoles={['Admin', 'Agent']}>
              <AgentDashboard />
            </RoleProtectedRoute>
          } />

          <Route path="/tenant" element={
            <RoleProtectedRoute allowedRoles={['Tenant']}>
              <TenantDashboard />
            </RoleProtectedRoute>
          } />

          <Route path="/owner" element={
            <RoleProtectedRoute allowedRoles={['Owner']}>
              <OwnerDashboard />
            </RoleProtectedRoute>
          } />

          <Route path="/unauthorized" element={<div className="container mt-5 text-center"><h3>Unauthorized Access</h3></div>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}