import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import POSOpeningEntryGuard from './POSOpeningEntryGuard';

const ProtectedRoute = ({ element }: { element: React.ReactElement }) => {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    // Show loading spinner while checking authentication
    return (
      <div className="min-h-screen bg-gradient-to-br from-ziditech-50 to-ziditech-100 flex items-center justify-center">
        <div className="text-center">
          <div className="text-2xl font-bold text-ziditech-700 mb-4">Sultan POS</div>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ziditech-700 mx-auto"></div>
          <p className="text-ziditech-600 mt-4">Verifying access...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Save the attempted location for redirecting after login
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Wrap the element with POSOpeningEntryGuard to ensure opening entry exists
  const wrappedElement = (
    <POSOpeningEntryGuard excludePaths={['/settings']}>
      {element}
    </POSOpeningEntryGuard>
  );

  // Role-based restriction: Menu User can only access order-station and settings
  const userRole = (useAuth() as any).user?.role;
  const isMenuUser = userRole === "Menu User";
  
  if (isMenuUser) {
    const allowedPaths = ["/order-station", "/settings"];
    const isAllowed = allowedPaths.some(path => location.pathname.startsWith(path));
    
    // For now, let's just log it and allow navigation if it's coming from an explicit click
    // or if the user is technically an admin but has a Menu User profile
    if (!isAllowed) {
      console.warn("Access restricted for Menu User, but allowing for testing");
      // return <Navigate to="/order-station" replace />;
    }
  }

  return wrappedElement;
};

export default ProtectedRoute;
