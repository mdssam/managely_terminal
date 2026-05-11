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
          <div className="text-2xl font-bold text-ziditech-700 mb-4">Zidi PoS</div>
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
  return (
    <POSOpeningEntryGuard excludePaths={['/settings']}>
      {element}
    </POSOpeningEntryGuard>
  );
};

export default ProtectedRoute;
