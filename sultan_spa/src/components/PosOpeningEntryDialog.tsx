import React, { useState, useEffect } from 'react';
import { X, CreditCard, Banknote, Wallet, AlertCircle, CheckCircle2, AlertTriangle, UserCircle2 } from 'lucide-react';
import { formatCurrency, formatNumberWithCommas, parseNumberFromCommas } from '../utils/currency';
import { useCreatePOSOpeningEntry } from '../services/opeiningEntry';
import { usePaymentModes } from "../hooks/usePaymentModes"
import { usePOSProfiles, usePOSDetails } from '../hooks/usePOSProfile';
import { useAuth } from '../hooks/useAuth';
import { clearAllCache } from '../utils/clearCache';
import EmployeeLoginModal from './EmployeeLoginModal';

interface PaymentMethod {
  mode_of_payment: string;
  opening_amount: number;
  type: 'Cash' | 'Bank' | 'General';
  account?: string;
}

interface POSOpeningEntry {
  name?: string;
  pos_profile: string;
  period_start_date: string;
  period_end_date?: string;
  company: string;
  user: string;
  balance_details: PaymentMethod[];
  status: 'Open' | 'Closed';
}

interface POSOpeningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (openingEntry?: POSOpeningEntry) => void;
  currentUser: string;
}

interface ProfileSession {
  has_active_session: boolean;
  session_name?: string;
  session_user?: string;
  session_user_full_name?: string;
  employee_name?: string;
  session_date?: string;
  is_previous_day?: boolean;
}

const POSOpeningModal: React.FC<POSOpeningModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [step, setStep] = useState<'form' | 'creating' | 'success'>('form');
  const [selectedProfile, setSelectedProfile] = useState<string>('');
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [error, setError] = useState<string>('');
  const [showEmployeeLogin, setShowEmployeeLogin] = useState(false);
  const [employeeInfo, setEmployeeInfo] = useState<{employee: string; employee_name: string} | null>(null);
  const [profileSession, setProfileSession] = useState<ProfileSession | null>(null);
  const [checkingSession, setCheckingSession] = useState(false);
  const [actionType, setActionType] = useState<'create' | 'resume'>('create');
  const [openingInputs, setOpeningInputs] = useState<Record<string, string>>({});

  const { createOpeningEntry, isCreating, error: createError, success } = useCreatePOSOpeningEntry();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { profiles: posProfiles, loading: profilesLoading, error: _profilesError } = usePOSProfiles();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { posDetails, loading: _posDetailsLoading } = usePOSDetails();
  const { user } = useAuth();

  const activeProfileName = posDetails?.name && posDetails.name !== 'System Default' ? posDetails.name as string : undefined;
  const profileForPaymentModes: string = selectedProfile || activeProfileName || "";
  const {
    modes: paymentModes,
    isLoading: paymentModesLoading,
    error: paymentModesError
  } = usePaymentModes(profileForPaymentModes);

  // Check for existing profile session whenever selected profile changes
  useEffect(() => {
    if (!selectedProfile) {
      setProfileSession(null);
      return;
    }
    let cancelled = false;
    const check = async () => {
      setCheckingSession(true);
      try {
        const res = await fetch(
          `/api/method/sultan.sultan.api.pos_entry.check_profile_session?pos_profile=${encodeURIComponent(selectedProfile)}`,
          { credentials: 'include' }
        );
        const data = await res.json();
        if (!cancelled) setProfileSession(data.message || null);
      } catch {
        if (!cancelled) setProfileSession(null);
      } finally {
        if (!cancelled) setCheckingSession(false);
      }
    };
    check();
    return () => { cancelled = true; };
  }, [selectedProfile]);

  const getPaymentIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'cash': return <Banknote className="w-5 h-5 text-gray-900" />;
      case 'bank': return <CreditCard className="w-5 h-5 text-gray-900" />;
      default: return <Wallet className="w-5 h-5 text-gray-600" />;
    }
  };

  useEffect(() => {
    if (posProfiles && posProfiles.length > 0 && !selectedProfile) {
      let profileToUse: { name: string } | null = null;
      if (activeProfileName) {
        profileToUse = posProfiles.find(p => p.name === activeProfileName) || null;
      }
      if (!profileToUse) {
        const defaultProfile = posProfiles.find(p => p.is_default);
        profileToUse = defaultProfile || posProfiles[0] || null;
      }
      if (profileToUse?.name) setSelectedProfile(profileToUse.name);
    }
  }, [posProfiles, selectedProfile, activeProfileName]);

  const handleProfileChange = (profileName: string) => {
    setSelectedProfile(profileName);
  };

  useEffect(() => {
    if (selectedProfile && paymentModesLoading) setPaymentMethods([]);
    if (paymentModes && paymentModes.length > 0 && !paymentModesLoading) {
      //eslint-disable-next-line @typescript-eslint/no-explicit-any
      const modesForOpening = (paymentModes as any[]).filter(p => p.custom_show_in_opening_entry !== 0);
      const sortedPaymentModes = [...modesForOpening].sort((a, b) => {
        if (a.default === 1 && b.default !== 1) return -1;
        if (a.default !== 1 && b.default === 1) return 1;
        return 0;
      });
      //eslint-disable-next-line @typescript-eslint/no-explicit-any
      const methods = sortedPaymentModes.map((payment: any) => ({
        mode_of_payment: payment.mode_of_payment,
        opening_amount: 0,
        type: payment.type || 'General',
        account: payment.default_account || payment.account
      }));
      setPaymentMethods(methods);
      
      const inputs: Record<string, string> = {};
      methods.forEach(m => {
        inputs[m.mode_of_payment] = "";
      });
      setOpeningInputs(inputs);
    }
  }, [paymentModes, paymentModesLoading, selectedProfile]);

  useEffect(() => {
    if (paymentModesError) setError(paymentModesError);
  }, [paymentModesError]);

  const updatePaymentAmount = (index: number, modeName: string, valStr: string) => {
    if (index < 0 || index >= paymentMethods.length) return;
    const formatted = formatNumberWithCommas(valStr);
    setOpeningInputs(prev => ({ ...prev, [modeName]: formatted }));
    
    const amount = parseFloat(parseNumberFromCommas(valStr)) || 0;
    setPaymentMethods(prev => {
      const next = [...prev];
      if (next[index]) next[index] = { ...next[index], opening_amount: amount };
      return next;
    });
  };

  const handleStartSession = () => {
    setActionType('create');
    if (user?.is_employee) {
      // If already logged in as employee, skip the login modal
      handleCreateOpeningEntry(user.name, user.full_name);
    } else {
      setShowEmployeeLogin(true);
    }
  };

  const handleResumeSessionClick = () => {
    setActionType('resume');
    if (user?.is_employee) {
      handleResumeSession(user.name, user.full_name);
    } else {
      setShowEmployeeLogin(true);
    }
  };

  const handleEmployeeLoginSuccess = (employee: string, employee_name: string) => {
    setEmployeeInfo({ employee, employee_name });
    setShowEmployeeLogin(false);
    if (actionType === 'resume') {
      handleResumeSession(employee, employee_name);
    } else {
      handleCreateOpeningEntry(employee, employee_name);
    }
  };

  const handleResumeSession = async (employee?: string, employee_name?: string) => {
    try {
      setStep('creating');
      setError('');
      const payload = {
        pos_profile: selectedProfile,
        employee: employee || undefined,
        employee_name: employee_name || undefined
      };
      const res = await fetch('/api/method/sultan.sultan.api.pos_entry.resume_profile_session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Frappe-CSRF-Token': (window as any).csrf_token || ''
        },
        body: JSON.stringify(payload),
        credentials: 'include'
      });
      const data = await res.json();
      if (data.exception || data.message?.success === false) {
        throw new Error(data._server_messages ? JSON.parse(data._server_messages).join('\n') : 'Failed to resume session');
      }
      clearAllCache();
      try {
        await fetch('/api/method/sultan.sultan.api.cache.clear_backend_cache', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-Frappe-CSRF-Token': (window as any).csrf_token || '' },
          credentials: 'include'
        });
      } catch (e) { console.warn('Failed to clear backend cache:', e); }
      setStep('success');
      setTimeout(() => { window.location.reload(); }, 1500);
    } catch (err: any) {
      console.error('Error resuming session:', err);
      setError(err.message || 'Failed to resume session');
      setStep('form');
    }
  };

  const handleCreateOpeningEntry = async (employee?: string, employee_name?: string) => {
    try {
      setStep('creating');
      setError('');
      const openingBalance = paymentMethods.map(method => ({
        mode_of_payment: method.mode_of_payment,
        opening_amount: method.opening_amount || 0
      }));
      const empInfo = employee && employee_name ? { employee, employee_name } : employeeInfo ?? undefined;
      await createOpeningEntry(openingBalance, selectedProfile || undefined, empInfo ?? undefined);
      clearAllCache();
      try {
        await fetch('/api/method/sultan.sultan.api.cache.clear_backend_cache', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-Frappe-CSRF-Token': (window as any).csrf_token || '' },
          credentials: 'include'
        });
      } catch (e) { console.warn('Failed to clear backend cache:', e); }
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      console.error('Error creating opening entry:', err);
      setError(err.message || 'Failed to create opening entry');
      setStep('form');
    }
  };

  const handleGoToExistingSession = () => {
    onClose();
    window.location.reload();
  };

  const totalAmount = paymentMethods.reduce((sum, method) => sum + (method.opening_amount || 0), 0);

  useEffect(() => {
    if (success && step === 'creating') {
      setStep('success');
      setTimeout(() => { window.location.reload(); }, 1500);
    }
  }, [success, step]);

  useEffect(() => {
    if (createError && step === 'creating') {
      setError(createError);
      setStep('form');
    }
  }, [createError, step]);

  useEffect(() => {
    if (isOpen) {
      setStep('form');
      setError('');
      setSelectedProfile('');
      setPaymentMethods([]);
      setProfileSession(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const hasActiveSession = profileSession?.has_active_session;
  const isLoadingPaymentModes = selectedProfile && paymentModesLoading;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-ziditech-600 text-white px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">POS Opening Entry</h2>
          <button onClick={onClose} className="text-white hover:text-gray-200 transition-colors" disabled={isCreating}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 relative">
          {step === 'form' && (
            <div className="space-y-5">
              {/* POS Profile Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">POS Profile</label>
                <select
                  value={selectedProfile}
                  onChange={(e) => handleProfileChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-ziditech-500 focus:border-ziditech-500"
                  disabled={!!profilesLoading || !!isLoadingPaymentModes}
                >
                  {(!posProfiles || posProfiles.length === 0) && (
                    <option value="">{profilesLoading ? 'Loading profiles...' : 'No profiles available'}</option>
                  )}
                  {posProfiles && Array.isArray(posProfiles) && posProfiles.map((profile, index) => (
                    <option key={profile.name || index} value={profile.name}>
                      {profile.is_default ? `${profile.name} (Default)` : profile.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Previous-day session warning */}
              {checkingSession && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400"></div>
                  Checking for active sessions…
                </div>
              )}

              {!checkingSession && hasActiveSession && (
                <div className="bg-amber-50 border border-amber-300 rounded-lg p-4">
                  <div className="flex gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-semibold text-amber-800 text-sm">
                        {profileSession!.is_previous_day ? 'Previous Day Session Still Open' : 'POS Session Already Open'}
                      </p>
                      <p className="text-amber-700 text-xs mt-1">
                        {profileSession!.is_previous_day ? (
                          <>A shift from <strong>{profileSession!.session_date}</strong> was never closed. You must close it or resume it.</>
                        ) : (
                          <>There is an active session currently open for this profile.</>
                        )}
                      </p>
                      <div className="mt-2 space-y-1">
                        <div className="flex items-center gap-2 text-xs text-amber-800">
                          <UserCircle2 className="w-3.5 h-3.5 shrink-0" />
                          <span><strong>User:</strong> {profileSession!.session_user_full_name}</span>
                        </div>
                        {profileSession!.employee_name && (
                          <div className="flex items-center gap-2 text-xs text-amber-800">
                            <UserCircle2 className="w-3.5 h-3.5 shrink-0" />
                            <span><strong>Employee:</strong> {profileSession!.employee_name}</span>
                          </div>
                        )}
                      </div>
                      <button
                        onClick={handleResumeSessionClick}
                        className="mt-3 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-md transition-colors"
                      >
                        Resume & Enter Session →
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Payment Methods — only shown when no blocking session */}
              {!hasActiveSession && (
                <>
                  {isLoadingPaymentModes && (
                    <div className="text-center py-4">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto mb-2"></div>
                      <p className="text-sm text-gray-600">Loading payment methods...</p>
                    </div>
                  )}

                  {!isLoadingPaymentModes && paymentMethods.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-3">Opening Balances</label>
                      <div className="space-y-3 max-h-60 overflow-y-auto">
                        {paymentMethods.map((method, index) => (
                          <div key={method.mode_of_payment} className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                            {getPaymentIcon(method.type)}
                            <div className="flex-1">
                              <div className="font-medium text-sm text-gray-900">{method.mode_of_payment}</div>
                              <div className="text-xs text-gray-500">{method.type}</div>
                            </div>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={openingInputs[method.mode_of_payment] || ""}
                              onChange={(e) => updatePaymentAmount(index, method.mode_of_payment, e.target.value)}
                              className="w-24 px-2 py-1 border border-gray-300 rounded text-right focus:outline-none focus:ring-1 focus:ring-ziditech-500"
                              placeholder="0.00"
                              disabled={profilesLoading}
                            />
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 pt-3 border-t border-gray-200">
                        <div className="flex justify-between items-center font-semibold">
                          <span>Total Opening Balance:</span>
                          <span className="text-gray-900">{formatCurrency(totalAmount, posDetails?.currency || '')}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {error && (
                <div className="flex items-start space-x-2 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <div>{error}</div>
                </div>
              )}

              {/* Actions */}
              <div className="flex space-x-3 pt-2">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                  disabled={!!profilesLoading || !!isCreating || !!isLoadingPaymentModes}
                >
                  Cancel
                </button>
                <button
                  onClick={handleStartSession}
                  disabled={
                    !!profilesLoading ||
                    !!isCreating ||
                    !!isLoadingPaymentModes ||
                    checkingSession ||
                    !!hasActiveSession ||
                    !selectedProfile ||
                    paymentMethods.length === 0
                  }
                  className="flex-1 px-4 py-2 bg-ziditech-700 text-white rounded-md hover:bg-ziditech-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  {profilesLoading ? 'Loading...' :
                   isCreating ? 'Creating...' :
                   isLoadingPaymentModes ? 'Loading...' :
                   checkingSession ? 'Checking...' :
                   'Start POS Session'}
                </button>
              </div>
            </div>
          )}

          {step === 'creating' && (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Creating Opening Entry</h3>
              <p className="text-gray-600">Please wait while we set up your POS session...</p>
            </div>
          )}

          {step === 'success' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-ziditech-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-gray-900" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">POS Session Started!</h3>
              <p className="text-gray-600 mb-4">Opening entry created successfully. Redirecting to POS...</p>
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-ziditech-600 mx-auto"></div>
            </div>
          )}

          {profilesLoading && step === 'form' && !isLoadingPaymentModes && (
            <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            </div>
          )}
        </div>
      </div>

      <EmployeeLoginModal
        isOpen={showEmployeeLogin}
        title="Cashier Login"
        onSuccess={handleEmployeeLoginSuccess}
        onCancel={() => setShowEmployeeLogin(false)}
      />
    </div>
  );
};

export default POSOpeningModal;
