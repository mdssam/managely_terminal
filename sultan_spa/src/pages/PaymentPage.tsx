import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, CreditCard, Banknote, Smartphone, CheckCircle2, Loader2, AlertCircle, ShoppingCart } from "lucide-react";
import { toast } from "react-toastify";
import { usePaymentModes } from "../hooks/usePaymentModes";
import { usePOSDetails } from "../hooks/usePOSProfile";

interface InvoiceItem {
  item_code: string;
  item_name: string;
  qty: number;
  rate: number;
  amount: number;
}

interface InvoiceData {
  name: string;
  doctype: string;
  customer: string;
  customer_name: string;
  grand_total: number;
  outstanding_amount: number;
  docstatus: number;
  status: string;
  posting_date: string;
  currency: string;
  currency_symbol: string;
  items: InvoiceItem[];
}

function getPaymentIcon(label: string) {
  const l = label.toLowerCase();
  if (l.includes("cash")) return <Banknote className="w-5 h-5" />;
  if (l.includes("mobile") || l.includes("mpesa") || l.includes("phone")) return <Smartphone className="w-5 h-5" />;
  return <CreditCard className="w-5 h-5" />;
}

const DEFAULT_MODES = ["Cash", "Card"];

export default function PaymentPage() {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const navigate = useNavigate();

  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMode, setSelectedMode] = useState<string>("");
  const [processing, setProcessing] = useState(false);
  const [paid, setPaid] = useState(false);

  const { posDetails } = usePOSDetails();
  const { modes } = usePaymentModes(typeof posDetails?.name === "string" ? posDetails.name : "");

  useEffect(() => {
    if (!invoiceId) return;
    setLoading(true);
    setError(null);
    fetch(
      `/api/method/sultan.sultan.api.get_invoice_for_cashier?invoice_name=${encodeURIComponent(invoiceId)}`,
      {
        headers: { "X-Frappe-CSRF-Token": (window as any).csrf_token || "" },
        credentials: "include",
      }
    )
      .then((r) => r.json())
      .then((data) => {
        if (data.message?.success) {
          setInvoice(data.message.invoice);
          if (data.message.invoice.docstatus === 1) setPaid(true);
        } else {
          setError(data.message?.message || "Invoice not found");
        }
      })
      .catch(() => setError("Failed to load invoice — check your connection"))
      .finally(() => setLoading(false));
  }, [invoiceId]);

  const handlePay = async () => {
    if (!selectedMode || !invoice) return;
    setProcessing(true);
    try {
      const resp = await fetch("/api/method/sultan.sultan.api.pay_draft_invoice", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Frappe-CSRF-Token": (window as any).csrf_token || "",
        },
        credentials: "include",
        body: JSON.stringify({
          invoice_name: invoice.name,
          mode_of_payment: selectedMode,
          amount: invoice.grand_total,
        }),
      });
      const result = await resp.json();
      if (result.message?.success) {
        setPaid(true);
        toast.success("Payment processed successfully!");
      } else {
        toast.error(result.message?.message || "Payment failed — check the invoice in ERPNext");
      }
    } catch {
      toast.error("Payment request failed");
    } finally {
      setProcessing(false);
    }
  };

  const sym = invoice?.currency_symbol || "";

  // Always show at least Cash + Card; merge with POS profile modes
  const apiModes = modes.map((m: any) => m.mode_of_payment || m.name).filter(Boolean) as string[];
  const paymentModeNames: string[] = apiModes.length > 0
    ? Array.from(new Set([...apiModes, ...DEFAULT_MODES]))
    : DEFAULT_MODES;

  const invoiceUrl = `/app/${invoice?.doctype === "POS Invoice" ? "pos-invoice" : "sales-invoice"}/${invoice?.name}`;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0D0033' }}>
        <div className="flex flex-col items-center gap-3" style={{ color: '#9a88ff' }}>
          <Loader2 className="w-10 h-10 animate-spin" />
          <span className="text-sm font-black uppercase tracking-widest">Loading invoice…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: '#0D0033' }}>
        <div className="rounded-[32px] p-10 max-w-sm w-full text-center shadow-3xl animate-in zoom-in-95 duration-300" style={{ backgroundColor: '#180855', border: '1px solid rgba(255,255,255,0.1)' }}>
          <div className="w-20 h-20 bg-red-400/10 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-10 h-10 text-red-400" />
          </div>
          <h2 className="text-2xl font-black text-white mb-2 uppercase tracking-tight">Invoice Not Found</h2>
          <p className="text-sm mb-8" style={{ color: '#8878c8' }}>{error}</p>
          <button
            onClick={() => navigate("/cashier-station")}
            className="w-full py-4 bg-ziditech-600 hover:bg-ziditech-500 text-white rounded-2xl font-black text-sm uppercase tracking-widest transition-all active:scale-95 shadow-xl shadow-ziditech-600/20"
          >
            Back to Cashier Terminal
          </button>
        </div>
      </div>
    );
  }

  if (paid) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: '#0D0033' }}>
        <div className="rounded-[32px] p-10 max-w-md w-full text-center shadow-3xl animate-in zoom-in-95 duration-300" style={{ backgroundColor: '#180855', border: '1px solid rgba(255,255,255,0.1)' }}>
          <div className="w-20 h-20 bg-ziditech-600/20 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-ziditech-500" />
          </div>
          <h2 className="text-3xl font-black text-white mb-1 uppercase tracking-tight">Payment Complete</h2>
          <p className="text-sm mb-6" style={{ color: '#8878c8' }}>{invoice?.name}</p>
          <p className="text-5xl font-black text-white mb-10">
            {sym}{invoice?.grand_total.toFixed(2)}
          </p>
          
          <div className="space-y-4">
            <a
              href={invoiceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all hover:bg-white/5"
              style={{ border: '1px solid rgba(255,255,255,0.1)', color: '#9a88ff' }}
            >
              View in ERPNext
            </a>
            <button
              onClick={() => navigate("/cashier-station")}
              className="w-full py-4 bg-ziditech-600 hover:bg-ziditech-500 text-white rounded-2xl font-black text-sm uppercase tracking-widest transition-all active:scale-95 shadow-xl shadow-ziditech-600/20"
            >
              Next Customer
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#0D0033' }}>
      {/* Header */}
      <header className="px-8 py-5 flex items-center gap-6 sticky top-0 z-30 backdrop-blur-xl border-b" style={{ backgroundColor: 'rgba(24,8,85,0.9)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <button
          onClick={() => navigate("/cashier-station")}
          className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/5 transition-all active:scale-90"
        >
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-black text-white tracking-tight truncate uppercase">{invoice?.name}</h1>
          <p className="text-xs font-bold uppercase tracking-widest mt-0.5" style={{ color: '#8878c8' }}>
            {invoice?.customer_name || invoice?.customer} · {invoice?.posting_date}
          </p>
        </div>
        <span className="text-[10px] font-black px-3 py-1.5 rounded-lg uppercase tracking-widest" style={{ backgroundColor: 'rgba(124,96,245,0.15)', color: '#9a88ff', border: '1px solid rgba(124,96,245,0.2)' }}>
          {invoice?.status || "Draft"}
        </span>
      </header>

      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-8">
          
          {/* Items & Summary */}
          <div className="lg:col-span-3 space-y-6">
            <div className="rounded-[32px] overflow-hidden shadow-2xl" style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                <h2 className="text-xs font-black text-white uppercase tracking-widest">Order Items</h2>
                <span className="text-[10px] font-black text-gray-500 uppercase">{invoice?.items.length} items</span>
              </div>
              <div className="divide-y" style={{ divideColor: 'rgba(255,255,255,0.05)' }}>
                {invoice?.items.map((item, idx) => (
                  <div key={idx} className="px-6 py-4 flex items-center justify-between hover:bg-white/5 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white truncate">{item.item_name}</p>
                      <p className="text-[10px] font-black uppercase tracking-wider mt-0.5" style={{ color: '#8878c8' }}>
                        {item.qty} × {sym}{item.rate.toFixed(2)}
                      </p>
                    </div>
                    <span className="text-sm font-black text-white ml-4 flex-shrink-0">
                      {sym}{item.amount.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="px-6 py-6 border-t flex items-center justify-between" style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.05)' }}>
                <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Grand Total</span>
                <span className="text-3xl font-black text-white tracking-tighter">
                  {sym}{invoice?.grand_total.toFixed(2)}
                </span>
              </div>
            </div>

            <button
              onClick={() => navigate("/cashier-station")}
              className="flex items-center justify-center gap-3 w-full py-5 rounded-2xl font-black text-xs uppercase tracking-widest transition-all hover:bg-white/5"
              style={{ border: '1px solid rgba(255,255,255,0.1)', color: '#9a88ff' }}
            >
              <ShoppingCart className="w-5 h-5" />
              Back to Terminal
            </button>
          </div>

          {/* Payment Methods */}
          <div className="lg:col-span-2 space-y-6">
            <div className="rounded-[32px] overflow-hidden shadow-2xl" style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="px-6 py-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                <h2 className="text-xs font-black text-white uppercase tracking-widest">Select Method</h2>
              </div>
              <div className="p-6 grid grid-cols-1 gap-3">
                {paymentModeNames.map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setSelectedMode(mode)}
                    className="flex items-center gap-4 p-5 rounded-2xl border-2 transition-all group"
                    style={{
                      borderColor: selectedMode === mode ? '#7c60f5' : 'rgba(255,255,255,0.05)',
                      backgroundColor: selectedMode === mode ? 'rgba(124,96,245,0.15)' : 'rgba(255,255,255,0.02)',
                    }}
                  >
                    <div className="p-3 rounded-xl transition-all" style={{ backgroundColor: selectedMode === mode ? '#7c60f5' : 'rgba(255,255,255,0.05)', color: selectedMode === mode ? 'white' : '#7c60f5' }}>
                      {getPaymentIcon(mode)}
                    </div>
                    <span className="font-black text-xs uppercase tracking-widest" style={{ color: selectedMode === mode ? 'white' : '#8878c8' }}>{mode}</span>
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handlePay}
              disabled={!selectedMode || processing}
              className="w-full py-6 bg-ziditech-600 hover:bg-ziditech-500 disabled:opacity-40 text-white rounded-[24px] font-black text-lg uppercase tracking-tighter shadow-2xl shadow-ziditech-600/30 active:scale-[0.98] transition-all flex flex-col items-center justify-center"
            >
              {processing ? (
                <Loader2 className="w-8 h-8 animate-spin" />
              ) : (
                <>
                  <span className="text-[10px] opacity-70 mb-1 font-black uppercase tracking-[0.2em]">Complete Transaction</span>
                  <span>Confirm {sym}{invoice?.grand_total.toFixed(2)}</span>
                </>
              )}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
