import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScanBarcode, Search, Receipt, CreditCard, ArrowRight } from 'lucide-react';
import { toast } from 'react-toastify';

export default function CashierStationPage() {
  const [barcodeInput, setBarcodeInput] = useState('');
  const [searching, setSearching] = useState(false);
  const navigate = useNavigate();

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanId = barcodeInput.trim();
    if (!cleanId) return;
    setSearching(true);
    try {
      toast.info(`Retrieving order ${cleanId}...`);
      navigate(`/payment/${cleanId}`);
    } catch {
      toast.error("Could not navigate to invoice");
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    const el = document.getElementById('cashier-barcode-entry');
    if (el) el.focus();
  }, []);

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ backgroundColor: '#0D0033' }}
    >
      {/* Glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-ziditech-600/15 rounded-full blur-[100px]" />
      </div>

      <div
        className="relative z-10 w-full max-w-md rounded-3xl overflow-hidden shadow-2xl"
        style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        {/* Terminal header */}
        <div className="bg-ziditech-600 p-8 flex flex-col items-center text-white text-center">
          <div className="bg-white/20 p-4 rounded-2xl backdrop-blur-sm mb-4">
            <ScanBarcode className="w-10 h-10" />
          </div>
          <h1 className="text-2xl font-black tracking-tight">Cashier Terminal</h1>
          <p className="mt-1 text-sm opacity-80">Scan receipt or type order ID to start payment</p>
        </div>

        {/* Body */}
        <div className="p-8">
          <form onSubmit={handleSearch} className="space-y-5">
            <div className="relative">
              <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none" style={{ color: '#9a88ff' }}>
                <Receipt className="w-5 h-5" />
              </div>
              <input
                id="cashier-barcode-entry"
                type="text"
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                placeholder="Enter Order / Invoice #"
                autoComplete="off"
                style={{
                  width: '100%',
                  paddingLeft: '3rem',
                  paddingRight: '1rem',
                  paddingTop: '1rem',
                  paddingBottom: '1rem',
                  backgroundColor: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: '1rem',
                  fontSize: '1.1rem',
                  fontWeight: '600',
                  color: '#f0eeff',
                  outline: 'none',
                }}
                onFocus={e => { e.target.style.borderColor = '#7c60f5'; e.target.style.boxShadow = '0 0 0 3px rgba(124,96,245,0.15)'; }}
                onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.12)'; e.target.style.boxShadow = 'none'; }}
              />
            </div>

            <button
              type="submit"
              disabled={!barcodeInput.trim() || searching}
              className="w-full flex items-center justify-center gap-2 py-4 bg-ziditech-600 hover:bg-ziditech-500 text-white rounded-2xl text-lg font-black shadow-xl shadow-ziditech-600/20 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {searching ? (
                <span className="animate-pulse">Locating...</span>
              ) : (
                <>Proceed to Payment <ArrowRight className="w-5 h-5" /></>
              )}
            </button>
          </form>

          {/* Feature chips */}
          <div
            className="mt-8 grid grid-cols-2 gap-4 pt-8"
            style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}
          >
            {[
              { icon: CreditCard, label: 'Supports Cards' },
              { icon: Search, label: 'Fuzzy Search' },
            ].map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex flex-col items-center p-4 rounded-xl"
                style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
              >
                <Icon className="w-6 h-6 mb-2" style={{ color: '#7c60f5' }} />
                <span className="text-xs font-black uppercase tracking-widest" style={{ color: '#8878c8' }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
