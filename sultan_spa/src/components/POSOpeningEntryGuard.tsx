import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { usePOSOpeningStatus } from '../hooks/usePOSOpeningEntry';
import POSOpeningModal from './PosOpeningEntryDialog';
import erpnextAPI from '../services/erpnext-api';
import { useI18n } from '../hooks/useI18n';

interface CurrentUser {
  name?: string;
  email?: string;
  full_name: string;
  role: string;
  user_image?: string;
}

interface POSOpeningEntryGuardProps {
  children: React.ReactNode;
  excludePaths?: string[];
}

/**
 * Guard that ensures a POS opening entry exists before allowing access.
 *
 * Cashier role: shows the opening modal when no session is found.
 * Menu User role: shows a "waiting for cashier" message — they can never
 *   open/close shifts and are auto-attached via the backend.
 */
export default function POSOpeningEntryGuard({
  children,
  excludePaths = ['/settings', '/login']
}: POSOpeningEntryGuardProps) {
  const { isRTL } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const [showOpeningModal, setShowOpeningModal] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [userLoading, setUserLoading] = useState(true);
  const [userError, setUserError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [posRole, setPosRole] = useState<string>('Cashier');

  const {
    hasOpenEntry,
    isLoading: statusLoading,
    error: statusError,
    refetch
  } = usePOSOpeningStatus();

  const shouldExclude = () => {
    const currentPath = location.pathname;
    return excludePaths.some(path => currentPath.includes(path));
  };

  // Fetch user + their POS-profile-specific role
  useEffect(() => {
    const fetchCurrentUser = async () => {
      try {
        setUserLoading(true);
        setUserError(null);
        erpnextAPI.initializeSession();

        const userProfile = await erpnextAPI.getCurrentUserProfile();

        if (userProfile) {
          setCurrentUser({
            name: userProfile.name,
            email: userProfile.email || userProfile.name,
            full_name: userProfile.full_name || userProfile.first_name + ' ' + (userProfile.last_name || ''),
            role: userProfile.role_profile_name || 'User',
            user_image: userProfile.user_image
          });
        } else {
          const basicUser = await erpnextAPI.getCurrentUser();
          if (basicUser) {
            setCurrentUser({ name: basicUser as string, email: basicUser as string, full_name: basicUser as string, role: 'User' });
          } else {
            setUserError('No user session found');
          }
        }

        // Fetch POS-profile-specific role from sultan API
        try {
          const roleRes = await fetch('/api/method/sultan.sultan.api.user.get_current_user_info', {
            credentials: 'include',
            headers: { 'Accept': 'application/json' }
          });
          const roleData = await roleRes.json();
          if (roleData?.message?.success && roleData.message.data?.role) {
            setPosRole(roleData.message.data.role);
          }
        } catch {
          // Role fetch failure is non-fatal; default to Cashier
        }
      } catch (error) {
        console.error('Error fetching current user:', error);
        setUserError((error as Error).message || 'Failed to fetch user');
      } finally {
        setUserLoading(false);
      }
    };

    fetchCurrentUser();
  }, []);

  useEffect(() => {
    if (shouldExclude()) return;
    if (hasOpenEntry !== null && isInitialized) refetch();
  }, [location.pathname, refetch, hasOpenEntry, isInitialized]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        const isExcluded = excludePaths.some(path => location.pathname.includes(path));
        if (!isExcluded) refetch();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [refetch, location.pathname, excludePaths]);

  useEffect(() => {
    if (shouldExclude()) { setIsInitialized(true); setShowOpeningModal(false); return; }

    const isInitialCheck = hasOpenEntry === null;
    if (isInitialCheck && (statusLoading || userLoading)) return;
    if (userError) { setIsInitialized(true); setShowOpeningModal(false); return; }

    if (hasOpenEntry !== null) {
      if (hasOpenEntry === true) {
        setShowOpeningModal(false);
        setIsInitialized(true);
      } else {
        // Menu Users never see the opening modal — they wait for a Cashier
        setShowOpeningModal(posRole !== 'Menu User');
        setIsInitialized(true);
      }
    } else if (!statusLoading && statusError) {
      if (typeof window !== 'undefined' && !navigator.onLine) {
        setShowOpeningModal(false);
      } else {
        setShowOpeningModal(posRole !== 'Menu User');
      }
      setIsInitialized(true);
    }
  }, [hasOpenEntry, statusLoading, statusError, userLoading, userError, location.pathname, posRole]);

  const handleOpeningSuccess = () => {
    setShowOpeningModal(false);
    setIsInitialized(true);
    setTimeout(() => {
      refetch();
      if (location.pathname !== '/pos') navigate('/pos');
    }, 500);
  };

  const handleOpeningClose = () => {};

  if (shouldExclude()) return <>{children}</>;

  const shouldShowLoading = hasOpenEntry === null && (statusLoading || userLoading);
  if (shouldShowLoading) {
    return (
      <div className={`min-h-screen bg-gray-50 ${isRTL ? "rtl" : "ltr"} flex items-center justify-center`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ziditech-600 mx-auto mb-4"></div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Initializing POS</h2>
          <p className="text-gray-600">Checking your POS session status...</p>
        </div>
      </div>
    );
  }

  // Menu User with no active session — cannot open a shift; must wait
  if (hasOpenEntry !== true && posRole === 'Menu User') {
    return (
      <div className={`min-h-screen bg-gray-50 ${isRTL ? "rtl" : "ltr"} flex items-center justify-center`}>
        <div className="text-center max-w-sm px-6">
          <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Waiting for Session</h2>
          <p className="text-gray-600 text-sm mb-6">
            No active POS session has been opened for this branch yet.
            Please wait for the Cashier to open a shift.
          </p>
          <button
            onClick={() => refetch()}
            className="px-5 py-2 text-sm font-semibold text-white rounded-lg"
            style={{ backgroundColor: '#1e2d6b' }}
          >
            Check Again
          </button>
        </div>
      </div>
    );
  }

  // No opening entry — show modal for Cashier, block UI
  if (hasOpenEntry !== true) {
    return (
      <>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center pointer-events-none opacity-50">
          {children}
        </div>
        <POSOpeningModal
          isOpen={showOpeningModal}
          onClose={handleOpeningClose}
          onSuccess={handleOpeningSuccess}
          currentUser={currentUser?.name || 'Unknown User'}
        />
      </>
    );
  }

  return <>{children}</>;
}
