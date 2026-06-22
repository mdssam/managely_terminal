import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import POSOpeningEntryGuard from './POSOpeningEntryGuard';
import { logSecurityIncident } from '../utils/securityIncidents';

const ProtectedRoute = ({ element }: { element: React.ReactElement }) => {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    // Show loading spinner while checking authentication
    return (
      <div className="min-h-screen bg-gradient-to-br from-ziditech-50 to-ziditech-100 flex items-center justify-center">
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900 mb-4">Managely</div>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ziditech-700 mx-auto"></div>
          <p className="text-gray-900 mt-4">Verifying access...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Save the attempted location for redirecting after login
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const { user } = useAuth();
  if (!user?.is_employee) {
    // Save the attempted location for redirecting after employee login
    return <Navigate to="/employee-login" state={{ from: location }} replace />;
  }

  // Wrap the element with POSOpeningEntryGuard to ensure opening entry exists
  const wrappedElement = (
    <POSOpeningEntryGuard excludePaths={['/settings']}>
      {element}
    </POSOpeningEntryGuard>
  );

  // Role-based restriction
  const currentUser = (useAuth() as any).user;
  const roleLower = currentUser?.role?.toLowerCase();
  const isMenuUser = roleLower === "menu user";
  const isAuditor = roleLower === "auditor";
  const isBranchManager = roleLower === "branch manager";
  const isAdmin = currentUser?.is_employee
    ? roleLower === "administrator"
    : (roleLower === "administrator" || currentUser?.name === "Administrator" || currentUser?.is_admin_user || (currentUser as any)?.userInfo?.is_admin_user);
  
  if (location.pathname.startsWith("/security_audit") && !isAdmin) {
    console.warn("Access restricted to Administrator, redirecting to home");
    logSecurityIncident("Unauthorized Access", `Attempted to access restricted page: ${location.pathname}`);
    return <Navigate to="/" replace />;
  }

  if (isMenuUser) {
    const allowedPaths = ["/order-station", "/settings"];
    const isAllowed = allowedPaths.some(path => location.pathname.startsWith(path));
    
    // Enforce the access restriction for Menu User
    if (!isAllowed) {
      console.warn("Access restricted for Menu User, redirecting to order-station");
      logSecurityIncident("Unauthorized Access", `Attempted to access restricted page: ${location.pathname}`);
      return <Navigate to="/order-station" replace />;
    }
  } else if (isAuditor || isBranchManager) {
    // Auditor / Branch Manager pages: invoice, sales_dashboard, settings, cash_transactions_report
    const allowedPaths = ["/invoice", "/sales_dashboard", "/settings", "/cash_transactions_report"];
    const isAllowed = allowedPaths.some(path => location.pathname.startsWith(path));
    if (!isAllowed) {
      console.warn("Access restricted for Auditor/Branch Manager, redirecting to sales_dashboard");
      logSecurityIncident("Unauthorized Access", `Attempted to access restricted page: ${location.pathname}`);
      return <Navigate to="/sales_dashboard" replace />;
    }
  } else if (!isAdmin) {
    // Fallback: Cashier and other non-admin/non-auditor users cannot access sales_dashboard, branch-sessions, closing_shift, or security_audit
    const restrictedPaths = ["/sales_dashboard", "/branch-sessions", "/closing_shift", "/security_audit"];
    const isRestricted = restrictedPaths.some(path => location.pathname.startsWith(path));
    if (isRestricted) {
      console.warn("Access restricted for this role, redirecting to pos");
      logSecurityIncident("Unauthorized Access", `Attempted to access restricted page: ${location.pathname}`);
      return <Navigate to="/pos" replace />;
    }
  }

  return wrappedElement;
};

export default ProtectedRoute;
