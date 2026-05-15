import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScanBarcode, Receipt, ArrowRight } from 'lucide-react';
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
    <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: '#eef1f8' }}>
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4" style={{ backgroundColor: '#1e2d6b' }}>
            <ScanBarcode className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Cashier Terminal</h1>
          <p className="text-sm text-gray-500 mt-1">Scan or enter an invoice ID to process payment</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <form onSubmit={handleSearch} className="space-y-4">
            <div className="relative">
              <div className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none">
                <Receipt className="w-4 h-4 text-gray-400" />
              </div>
              <input
                id="cashier-barcode-entry"
                type="text"
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                placeholder="Order / Invoice #"
                autoComplete="off"
                className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent"
                style={{ '--tw-ring-color': '#1e2d6b' } as any}
                onFocus={e => { e.target.style.borderColor = '#1e2d6b'; e.target.style.boxShadow = '0 0 0 3px rgba(30,45,107,0.1)'; }}
                onBlur={e => { e.target.style.borderColor = '#e5e7eb'; e.target.style.boxShadow = 'none'; }}
              />
            </div>

            <button
              type="submit"
              disabled={!barcodeInput.trim() || searching}
              className="w-full flex items-center justify-center gap-2 py-3 text-white rounded-xl text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-40"
              style={{ backgroundColor: '#1e2d6b' }}
            >
              {searching ? (
                <span>Locating...</span>
              ) : (
                <>Proceed to Payment <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
