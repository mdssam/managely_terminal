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
      setMode(null); // Standard POS
      navigate('/pos');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-8">
      <div className="w-full max-w-5xl">
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 shadow-xl shadow-blue-500/20 text-white mb-6">
            <ShoppingBag className="w-8 h-8" />
          </div>
          <h1 className="text-4xl font-black tracking-tight text-slate-900 dark:text-white sm:text-5xl mb-4">
            Sultan POS
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-400">Select your work station to begin operations.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
          {/* Terminal 1: POS */}
          <button 
            onClick={() => handleSelect('pos')}
            className="group flex flex-col text-left bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-2xl hover:shadow-slate-200/50 transition-all duration-300 hover:-translate-y-1 active:scale-[0.98]"
          >
            <div className="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 w-fit mb-6 group-hover:scale-110 transition-transform">
              <MonitorPlay className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Retail Desktop</h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed mb-8">
              Full retail point of sale with standard order, fulfillment, and history views.
            </p>
            <div className="mt-auto text-indigo-600 dark:text-indigo-400 font-semibold text-sm inline-flex items-center">
              Launch Workspace &rarr;
            </div>
          </button>

          {/* Terminal 2: Ordering */}
          <button 
            onClick={() => handleSelect('order-station')}
            className="group flex flex-col text-left bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-2xl hover:shadow-slate-200/50 transition-all duration-300 hover:-translate-y-1 active:scale-[0.98]"
          >
            <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 w-fit mb-6 group-hover:scale-110 transition-transform">
              <ChefHat className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Ordering Station</h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed mb-8">
              Optimized UI for standalone order takers. Triggers live kitchen work orders instantly.
            </p>
            <div className="mt-auto text-amber-600 dark:text-amber-400 font-semibold text-sm inline-flex items-center">
              Launch Order Terminal &rarr;
            </div>
          </button>

          {/* Terminal 3: Cashier */}
          <button 
            onClick={() => handleSelect('cashier-station')}
            className="group flex flex-col text-left bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-2xl hover:shadow-slate-200/50 transition-all duration-300 hover:-translate-y-1 active:scale-[0.98]"
          >
            <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 w-fit mb-6 group-hover:scale-110 transition-transform">
              <Receipt className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Cashier Station</h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed mb-8">
              Lightning fast payment-only station. Scan barcode receipts to complete transactions.
            </p>
            <div className="mt-auto text-emerald-600 dark:text-emerald-400 font-semibold text-sm inline-flex items-center">
              Launch Cashier Console &rarr;
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}
