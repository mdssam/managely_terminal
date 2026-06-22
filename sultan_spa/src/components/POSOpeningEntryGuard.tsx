import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { usePOSOpeningStatus } from '../hooks/usePOSOpeningEntry';
import POSOpeningModal from './PosOpeningEntryDialog';
import erpnextAPI from '../services/erpnext-api';
import { useI18n } from '../hooks/useI18n';
import { preloadOfflineDatabase } from '../utils/preloader';
import type { PreloadProgress } from '../utils/preloader';
import { secureDbGet, APP_CACHE_STORE } from '../services/offlineDB';



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
  const [preloadStatus, setPreloadStatus] = useState<PreloadProgress>({
    status: 'idle',
    step: '',
    percentage: 0
  });
  const [verificationError, setVerificationError] = useState<string | null>(null);


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
          let finalRole = roleData?.message?.data?.role;
          
          try {
            const { dbGet, AUTH_STORE } = await import("../services/offlineDB");
            const userData = await dbGet<any>(AUTH_STORE, "user_data");
            if (userData && userData.is_employee && userData.role) {
              finalRole = userData.role;
            }
          } catch (e) {
            console.error("Failed to read user_data from DB in guard:", e);
          }

          if (finalRole) {
            setPosRole(finalRole);
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

  const verifyOfflineCaches = async (): Promise<boolean> => {
    try {
      await secureDbGet(APP_CACHE_STORE, "cached_user_info");
      await secureDbGet(APP_CACHE_STORE, "cached_pos_details");
      await secureDbGet(APP_CACHE_STORE, "cached_sales_tax_charges");
      await secureDbGet(APP_CACHE_STORE, "sultan_products_cache");
      return true;
    } catch (e) {
      console.error("Cache tampering check failed:", e);
      return false;
    }
  };

  useEffect(() => {
    if (shouldExclude() || hasOpenEntry !== true || !isInitialized) return;

    let active = true;

    const startOfflineSyncChecks = async () => {
      if (navigator.onLine) {
        if (sessionStorage.getItem('pos_db_preloaded') === 'true') {
          setPreloadStatus({ status: 'success', step: 'Database initialized', percentage: 100 });
          return;
        }

        setPreloadStatus({ status: 'loading', step: 'Initializing POS Offline Database...', percentage: 0 });
        try {
          await preloadOfflineDatabase((p) => {
            if (active) setPreloadStatus(p);
          });
          sessionStorage.setItem('pos_db_preloaded', 'true');
          if (active) setPreloadStatus({ status: 'success', step: 'Ready', percentage: 100 });
        } catch (err: any) {
          console.error("Preload database error in guard:", err);
          if (active) {
            setPreloadStatus({
              status: 'error',
              step: 'Synchronization failed',
              percentage: 100,
              errorMessage: err.message || 'Verification or Network error'
            });
          }
        }
      } else {
        setPreloadStatus({ status: 'loading', step: 'Verifying database signature...', percentage: 50 });
        const isTamperFree = await verifyOfflineCaches();
        if (isTamperFree) {
          if (active) setPreloadStatus({ status: 'success', step: 'Verified secure cache', percentage: 100 });
        } else {
          if (active) {
            setVerificationError("Security signature mismatch. Local databases might have been tampered with. Shift locked.");
            setPreloadStatus({ status: 'error', step: 'Security check failed', percentage: 100 });
          }
        }
      }
    };

    startOfflineSyncChecks();

    return () => {
      active = false;
    };
  }, [hasOpenEntry, isInitialized]);

  if (shouldExclude()) return <>{children}</>;


  const shouldShowLoading = hasOpenEntry === null || statusLoading || userLoading;
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

  if (preloadStatus.status === 'loading') {
    return (
      <div className={`min-h-screen bg-[#0D0033] ${isRTL ? "rtl" : "ltr"} flex items-center justify-center relative overflow-hidden`}>
        <div className="absolute inset-0 bg-grid-pattern opacity-5 pointer-events-none"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-ziditech-600/10 rounded-full blur-[120px]" />
        
        <div className="relative z-10 text-center max-w-sm w-full px-6">
          <div className="flex justify-center mb-6">
            <div className="p-1 bg-gradient-to-tr from-ziditech-600 to-ziditech-400 rounded-3xl shadow-2xl animate-pulse">
              <img src="/assets/sultan/sultan_spa/managelyLogo.webp" alt="Managely" className="w-20 h-20 rounded-[22px] object-cover" />
            </div>
          </div>
          
          <h2 className="text-lg font-black text-white mb-2 tracking-wide uppercase">Securing POS Database</h2>
          <p className="text-gray-400 text-xs mb-6">{preloadStatus.step}</p>
          
          <div className="w-full bg-white/5 rounded-full h-2 mb-4 overflow-hidden border border-white/10 p-0.5">
            <div 
              className="bg-gradient-to-r from-[#1e59db] to-blue-400 h-full rounded-full transition-all duration-300 shadow-[0_0_12px_rgba(30,89,219,0.5)]"
              style={{ width: `${preloadStatus.percentage}%` }}
            ></div>
          </div>
          <div className="text-right text-[10px] font-black text-gray-500 uppercase tracking-widest">
            {preloadStatus.percentage}% Completed
          </div>
        </div>
      </div>
    );
  }

  if (preloadStatus.status === 'error' || verificationError) {
    return (
      <div className={`min-h-screen bg-[#0D0033] ${isRTL ? "rtl" : "ltr"} flex items-center justify-center relative overflow-hidden`}>
        <div className="absolute inset-0 bg-grid-pattern opacity-5 pointer-events-none"></div>
        <div className="relative z-10 text-center max-w-md w-full px-6">
          <div className="w-16 h-16 rounded-full bg-red-950/50 border border-red-500/30 flex items-center justify-center mx-auto mb-4 animate-bounce">
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          
          <h2 className="text-xl font-black text-white mb-2 uppercase tracking-wider">Security Violation</h2>
          <p className="text-red-400 text-sm mb-6">
            {verificationError || preloadStatus.errorMessage || "Shift entry locked due to security validation failure."}
          </p>
          
          <div className="flex gap-3">
            <button
              onClick={() => window.location.reload()}
              className="flex-1 px-5 py-3 text-xs font-black text-white bg-red-600 rounded-xl hover:bg-red-700 uppercase tracking-widest transition-colors shadow-lg shadow-red-600/20"
            >
              Retry
            </button>
            <button
              onClick={() => {
                sessionStorage.clear();
                localStorage.clear();
                window.location.href = '/login';
              }}
              className="flex-1 px-5 py-3 text-xs font-black text-gray-400 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 uppercase tracking-widest transition-colors"
            >
              Logout Cashier
            </button>
          </div>
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
