import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/useAuth';
import NavigationBar from './components/navigation/Navbar';
import WorkspaceSidebar from './components/navigation/WorkspaceSidebar';
import Login from './pages/auth/Login';

const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const TenantDashboard = lazy(() => import('./pages/tenant/TenantDashboard'));
const ManagerDashboard = lazy(() => import('./pages/manager/ManagerDashboard'));
const AgentDashboard = lazy(() => import('./pages/agent/AgentDashboard'));
const OwnerDashboard = lazy(() => import('./pages/owner/OwnerDashboard'));
const NotificationInbox = lazy(() => import('./components/notifications/NotificationInbox'));
const ProfilePage = lazy(() => import('./pages/profile/ProfilePage'));

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
  const { user, loading } = useAuth();
  const location = useLocation();
  const showWorkspace = Boolean(user && location.pathname !== '/login' && location.pathname !== '/profile');

  if (loading) return <div className="pm-loading" role="status">Loading your workspace…</div>;

  return (
    <>
        <NavigationBar />
        <div className={`workspace-frame${showWorkspace ? '' : ' workspace-frame-public'}`}>
          {showWorkspace && <WorkspaceSidebar />}
          <main className="workspace-main">
            <Suspense fallback={<div className="pm-loading" role="status">Loading your workspace…</div>}>
            <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Navigate to="/login" replace />} />

          <Route path="/profile" element={user ? <ProfilePage /> : <Navigate to="/login" replace />} />

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
          <Route
            path="/notifications"
            element={
              <ProtectedRoute allowedRoles={['Admin', 'Property Manager', 'Agent', 'Owner', 'Tenant']}>
                <NotificationInbox />
              </ProtectedRoute>
            }
          />

          {/* Fallback route */}
          <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
            </Suspense>
          </main>
        </div>
    </>
  );
}
