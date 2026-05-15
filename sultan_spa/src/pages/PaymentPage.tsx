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

  const apiModes = modes.map((m: any) => m.mode_of_payment || m.name).filter(Boolean) as string[];
  const paymentModeNames: string[] = apiModes.length > 0
    ? Array.from(new Set([...apiModes, ...DEFAULT_MODES]))
    : DEFAULT_MODES;

  const invoiceUrl = `/app/${invoice?.doctype === "POS Invoice" ? "pos-invoice" : "sales-invoice"}/${invoice?.name}`;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#eef1f8' }}>
        <div className="flex flex-col items-center gap-3 text-gray-400">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#1e2d6b' }} />
          <span className="text-sm font-semibold text-gray-500">Loading invoice…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: '#eef1f8' }}>
        <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-sm border border-gray-200">
          <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-1">Invoice Not Found</h2>
          <p className="text-sm text-gray-500 mb-6">{error}</p>
          <button
            onClick={() => navigate("/cashier-station")}
            className="w-full py-3 rounded-xl font-semibold text-sm text-white transition-all active:scale-95"
            style={{ backgroundColor: '#1e2d6b' }}
          >
            Back to Cashier Terminal
          </button>
        </div>
      </div>
    );
  }

  if (paid) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: '#eef1f8' }}>
        <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center shadow-sm border border-gray-200">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: '#eef1f8' }}>
            <CheckCircle2 className="w-8 h-8" style={{ color: '#1e2d6b' }} />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-1">Payment Complete</h2>
          <p className="text-sm text-gray-500 mb-2">{invoice?.name}</p>
          <p className="text-4xl font-black mb-8" style={{ color: '#1e2d6b' }}>
            {sym}{invoice?.grand_total.toFixed(2)}
          </p>
          <div className="space-y-3">
            <a
              href={invoiceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center w-full py-3 rounded-xl font-semibold text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
            >
              View in ERPNext
            </a>
            <button
              onClick={() => navigate("/cashier-station")}
              className="w-full py-3 rounded-xl font-semibold text-sm text-white transition-all active:scale-95"
              style={{ backgroundColor: '#1e2d6b' }}
            >
              Next Customer
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#eef1f8' }}>
      {/* Header */}
      <header className="px-6 py-4 flex items-center gap-4 sticky top-0 z-30 bg-white border-b border-gray-200">
        <button
          onClick={() => navigate("/cashier-station")}
          className="p-2 bg-gray-100 hover:bg-gray-200 rounded-xl transition-all active:scale-90"
        >
          <ArrowLeft className="w-5 h-5 text-gray-700" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold text-gray-900 truncate">{invoice?.name}</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {invoice?.customer_name || invoice?.customer} · {invoice?.posting_date}
          </p>
        </div>
        <span className="text-[11px] font-semibold px-3 py-1 rounded-lg text-gray-600 bg-gray-100">
          {invoice?.status || "Draft"}
        </span>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* Items & Summary */}
          <div className="lg:col-span-3 space-y-4">
            <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-200">
              <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-700">Order Items</h2>
                <span className="text-xs text-gray-400">{invoice?.items.length} items</span>
              </div>
              <div className="divide-y divide-gray-100">
                {invoice?.items.map((item, idx) => (
                  <div key={idx} className="px-5 py-3.5 flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{item.item_name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {item.qty} × {sym}{item.rate.toFixed(2)}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-gray-900 ml-4 flex-shrink-0">
                      {sym}{item.amount.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between" style={{ backgroundColor: '#eef1f8' }}>
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Grand Total</span>
                <span className="text-2xl font-black" style={{ color: '#1e2d6b' }}>
                  {sym}{invoice?.grand_total.toFixed(2)}
                </span>
              </div>
            </div>

            <button
              onClick={() => navigate("/cashier-station")}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-medium text-sm text-gray-600 border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
            >
              <ShoppingCart className="w-4 h-4" />
              Back to Terminal
            </button>
          </div>

          {/* Payment Methods */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-200">
              <div className="px-5 py-3.5 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-700">Payment Method</h2>
              </div>
              <div className="p-4 grid grid-cols-1 gap-2">
                {paymentModeNames.map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setSelectedMode(mode)}
                    className="flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left"
                    style={{
                      borderColor: selectedMode === mode ? '#1e2d6b' : '#e5e7eb',
                      backgroundColor: selectedMode === mode ? '#eef1f8' : 'white',
                    }}
                  >
                    <div className="p-2 rounded-lg transition-all" style={{
                      backgroundColor: selectedMode === mode ? '#1e2d6b' : '#f3f4f6',
                      color: selectedMode === mode ? 'white' : '#6b7280'
                    }}>
                      {getPaymentIcon(mode)}
                    </div>
                    <span className="font-semibold text-sm" style={{ color: selectedMode === mode ? '#1e2d6b' : '#374151' }}>{mode}</span>
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handlePay}
              disabled={!selectedMode || processing}
              className="w-full py-4 disabled:opacity-40 text-white rounded-xl font-bold text-sm transition-all active:scale-[0.98] flex flex-col items-center justify-center shadow-sm"
              style={{ backgroundColor: '#1e2d6b' }}
            >
              {processing ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : (
                <>
                  <span className="text-[10px] opacity-70 mb-0.5 font-semibold uppercase tracking-wider">Complete Transaction</span>
                  <span className="text-lg font-black">Confirm {sym}{invoice?.grand_total.toFixed(2)}</span>
                </>
              )}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
