import { useNavigate } from 'react-router-dom';
import { ChefHat, Receipt, MonitorPlay, ShoppingBag } from 'lucide-react';
import { useStationStore } from '../stores/stationStore';

export default function HomePage() {
  const navigate = useNavigate();
  const { setMode } = useStationStore();

  const handleSelect = (mode: 'pos' | 'order-station' | 'cashier-station') => {
    if (mode === 'order-station') {
      setMode('order');
      navigate('/order-station');
    } else if (mode === 'cashier-station') {
      setMode('cashier');
      navigate('/cashier-station');
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
    {
      mode: 'cashier-station' as const,
      icon: Receipt,
      title: 'Cashier Station',
      cta: 'Launch Cashier Console',
    },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center p-8" style={{ backgroundColor: '#eef1f8' }}>
      <div className="w-full max-w-4xl">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-5" style={{ backgroundColor: '#1e2d6b' }}>
            <ShoppingBag className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl font-black tracking-tight mb-2" style={{ color: '#1e2d6b' }}>
            Sultan POS
          </h1>
          <p className="text-sm font-medium text-gray-500">
            Select your work station to begin operations.
          </p>
        </div>

        {/* Station cards */}
        <div className="grid md:grid-cols-3 gap-5">
          {stations.map(({ mode, icon: Icon, title, cta }) => (
            <button
              key={mode}
              onClick={() => handleSelect(mode)}
              className="group flex flex-col text-left p-7 rounded-2xl bg-white border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.98]"
            >
              <div className="p-3 rounded-xl mb-5 w-fit" style={{ backgroundColor: '#eef1f8' }}>
                <Icon className="w-6 h-6" style={{ color: '#1e2d6b' }} />
              </div>
              <h3 className="text-base font-bold text-gray-900 mb-4">{title}</h3>
              <div className="font-semibold text-xs mt-auto" style={{ color: '#1e2d6b' }}>
                {cta} →
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
