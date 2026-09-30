import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import NavigationBar from './components/Navbar';
import WorkspaceSidebar from './components/WorkspaceSidebar';
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
      <Router>
        <AppLayout />
      </Router>
  );
}

function AppLayout() {
  const { user } = useAuth();
  const location = useLocation();
  const showWorkspace = Boolean(user && location.pathname !== '/login');

  return (
    <>
        <NavigationBar />
        <div className={`workspace-frame${showWorkspace ? '' : ' workspace-frame-public'}`}>
          {showWorkspace && <WorkspaceSidebar />}
          <main className="workspace-main">
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
          </main>
        </div>
    </>
  );
}
