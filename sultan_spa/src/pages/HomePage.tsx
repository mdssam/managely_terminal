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
      subtitle: 'Full POS workspace with product grid, cart, and payments.',
      cta: 'Launch Workspace',
    },
    {
      mode: 'order-station' as const,
      icon: ChefHat,
      title: 'Ordering Station',
      subtitle: 'Kitchen-facing order terminal for quick order entry.',
      cta: 'Launch Order Terminal',
    },
    {
      mode: 'cashier-station' as const,
      icon: Receipt,
      title: 'Cashier Station',
      subtitle: 'Scan receipts or enter invoice IDs to process payment.',
      cta: 'Launch Cashier Console',
    },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center p-8" style={{ backgroundColor: '#0D0033' }}>
      {/* Glow background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-ziditech-600/10 rounded-full blur-[120px]" />
      </div>

      <div className="w-full max-w-5xl relative z-10">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-ziditech-600 shadow-2xl shadow-ziditech-600/30 text-white mb-6">
            <ShoppingBag className="w-10 h-10" />
          </div>
          <h1 className="text-5xl font-black tracking-tight text-white mb-3">
            Sultan POS
          </h1>
          <p className="text-lg font-medium" style={{ color: '#9a88ff' }}>
            Select your work station to begin operations.
          </p>
        </div>

        {/* Station cards */}
        <div className="grid md:grid-cols-3 gap-6">
          {stations.map(({ mode, icon: Icon, title, subtitle, cta }) => (
            <button
              key={mode}
              onClick={() => handleSelect(mode)}
              className="group flex flex-col text-left p-8 rounded-3xl border transition-all duration-300 hover:-translate-y-1 active:scale-[0.97]"
              style={{
                backgroundColor: 'rgba(255,255,255,0.04)',
                borderColor: 'rgba(255,255,255,0.08)',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(76,40,204,0.15)';
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(124,96,245,0.4)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(255,255,255,0.04)';
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.08)';
              }}
            >
              <div className="p-4 rounded-2xl mb-6 w-fit transition-transform group-hover:scale-110"
                style={{ backgroundColor: 'rgba(76,40,204,0.25)', color: '#9a88ff' }}>
                <Icon className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-black text-white mb-2">{title}</h3>
              <p className="text-sm mb-6 flex-1" style={{ color: '#8878c8' }}>{subtitle}</p>
              <div className="font-black text-sm inline-flex items-center gap-1" style={{ color: '#7c60f5' }}>
                {cta} →
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
