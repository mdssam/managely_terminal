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
    // Verify existence or directly navigate to payment if standard flow supports it
    // In most flow, we navigate directly to the payment route for the invoice ID.
    
    try {
      // Attempt to fetch if it exists first? Or just navigate.
      // Usually redirecting to /payment/{invoiceID} handles loading status.
      
      toast.info(`Retrieving order ${cleanId}...`);
      navigate(`/payment/${cleanId}`);
    } catch (err) {
      toast.error("Could not navigate to invoice");
    } finally {
      setSearching(false);
    }
  };

  // Auto-focus the input for direct scanning
  useEffect(() => {
    const el = document.getElementById('cashier-barcode-entry');
    if (el) el.focus();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl shadow-slate-200/50 overflow-hidden border border-white">
        
        <div className="bg-blue-600 p-8 flex flex-col items-center text-white text-center">
          <div className="bg-white/20 p-4 rounded-2xl backdrop-blur-sm mb-4">
            <ScanBarcode className="w-10 h-10" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Cashier Terminal</h1>
          <p className="text-blue-100 mt-1 text-sm opacity-90">Scan receipt or type order ID to start payment</p>
        </div>

        <div className="p-8">
          <form onSubmit={handleSearch} className="space-y-6">
            <div className="relative">
              <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-slate-400">
                <Receipt className="w-5 h-5" />
              </div>
              <input
                id="cashier-barcode-entry"
                type="text"
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                placeholder="Enter Order / Invoice #"
                className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-lg font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-inner"
                style={{ color: '#0f172a' }}
                autoComplete="off"
              />
            </div>

            <button
              type="submit"
              disabled={!barcodeInput.trim() || searching}
              className="w-full flex items-center justify-center gap-2 py-4 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-lg font-semibold shadow-lg shadow-slate-900/20 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {searching ? (
                <span className="animate-pulse">Locating...</span>
              ) : (
                <>
                  Proceed to Payment
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 grid grid-cols-2 gap-4 border-t pt-8">
             <div className="flex flex-col items-center p-4 bg-slate-50 rounded-xl">
               <CreditCard className="w-6 h-6 text-slate-600 mb-2" />
               <span className="text-xs font-semibold text-slate-500 uppercase">Supports Cards</span>
             </div>
             <div className="flex flex-col items-center p-4 bg-slate-50 rounded-xl">
               <Search className="w-6 h-6 text-slate-600 mb-2" />
               <span className="text-xs font-semibold text-slate-500 uppercase">Fuzzy Search</span>
             </div>
          </div>
        </div>

      </div>
    </div>
  );
}
