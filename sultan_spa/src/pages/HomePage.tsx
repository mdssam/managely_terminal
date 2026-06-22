import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChefHat, Receipt, MonitorPlay, ShoppingBag } from 'lucide-react';
import { useStationStore } from '../stores/stationStore';
import { useAuth } from '../hooks/useAuth';
import { useUserInfo } from '../hooks/useUserInfo';

export default function HomePage() {
  const navigate = useNavigate();
  const { setMode } = useStationStore();
  const { user, loading: authLoading, isAuthenticated } = useAuth();
  const { userInfo, isLoading: userLoading } = useUserInfo();

  const roleLower = user?.role?.toLowerCase() || userInfo?.role?.toLowerCase() || "";
  const isAuditor = roleLower === 'auditor';
  const isBranchManager = roleLower === 'branch manager';
  const isAdmin = user?.is_employee
    ? roleLower === 'administrator'
    : (roleLower === 'administrator' || user?.name === 'Administrator' || userInfo?.is_admin_user);
  const isMenuUser = roleLower === 'menu user';
  const isLoading = authLoading || userLoading;

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) {
        navigate('/login', { replace: true });
      } else if (!user?.is_employee) {
        navigate('/employee-login', { replace: true });
      } else if (isMenuUser) {
        setMode('order');
        navigate('/order-station', { replace: true });
      } else if (isAuditor || isBranchManager) {
        navigate('/sales_dashboard', { replace: true });
      } else if (!isAdmin) {
        setMode(null);
        navigate('/pos', { replace: true });
      }
    }
  }, [isAuthenticated, user, isMenuUser, isAuditor, isBranchManager, isAdmin, isLoading, navigate, setMode]);

  if (isLoading || !user?.is_employee || isMenuUser || isAuditor || isBranchManager || (!isAdmin && !isLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8" style={{ backgroundColor: '#eef1f8' }}>
        <div className="animate-pulse flex flex-col items-center">
          <ChefHat className="w-12 h-12 text-[#1a53d3] mb-4" />
          <p className="text-gray-500 font-medium">
            {isMenuUser ? 'Loading Ordering Station...' : 'Loading...'}
          </p>
        </div>
      </div>
    );
  }

  const handleSelect = (mode: 'pos' | 'order-station') => {
    if (mode === 'order-station') {
      setMode('order');
      navigate('/order-station');
    } else {
      setMode(null);
      navigate('/pos');
    }
  };

  const stations = [
    {
      mode: 'pos' as const,
      icon: MonitorPlay,
      title: 'Retail Desktop',
      cta: 'Launch Workspace',
    },
    {
      mode: 'order-station' as const,
      icon: ChefHat,
      title: 'Ordering Station',
      cta: 'Launch Order Terminal',
    },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center p-8" style={{ backgroundColor: '#eef1f8' }}>
      <div className="w-full max-w-4xl">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-5" style={{ background: 'linear-gradient(135deg, #3a76fc 0%, #1a53d3 100%)' }}>
            <ShoppingBag className="w-8 h-8 text-white" />
          </div>
          {/* Removed text as requested */}
        </div>

        {/* Station cards */}
        <div className="grid md:grid-cols-2 gap-5 max-w-2xl mx-auto">
          {stations.map(({ mode, icon: Icon, title, cta }) => (
            <button
              key={mode}
              onClick={() => handleSelect(mode)}
              className="group flex flex-col text-left p-7 rounded-2xl bg-white border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.98]"
            >
              <div className="p-3 rounded-xl mb-5 w-fit" style={{ backgroundColor: '#eef1f8' }}>
                <Icon className="w-6 h-6" style={{ color: '#111827' }} />
              </div>
              <h3 className="text-base font-bold text-gray-900 mb-4">{title}</h3>
              <div className="font-semibold text-xs mt-auto" style={{ color: '#111827' }}>
                {cta} →
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
