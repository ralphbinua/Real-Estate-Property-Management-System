import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext'; // Import the custom hook

const RoleProtectedRoute = ({ allowedRoles }) => {
  const { user } = useAuth(); // Pull the current user from context

  if (!user) {
    // If no user is logged in, redirect to the login page
    return <Navigate to="/" replace />;
  }

  if (!allowedRoles.includes(user.role)) {
    // If logged in but lacking the right role, redirect to unauthorized
    return <Navigate to="/unauthorized" replace />;
  }

  return <Outlet />;
};

export default RoleProtectedRoute;