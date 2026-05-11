"use client";

import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, CreditCard, Banknote, Smartphone, CheckCircle2, Loader2, AlertCircle } from "lucide-react";
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
    fetch(`/api/method/sultan.sultan.api.get_invoice_for_cashier?invoice_name=${encodeURIComponent(invoiceId)}`, {
      headers: { "X-Frappe-CSRF-Token": (window as any).csrf_token || "" },
      credentials: "include",
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.message?.success) {
          setInvoice(data.message.invoice);
          if (data.message.invoice.docstatus === 1) setPaid(true);
        } else {
          setError(data.message?.message || "Invoice not found");
        }
      })
      .catch(() => setError("Failed to load invoice"))
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
        toast.error(result.message?.message || "Payment failed");
      }
    } catch {
      toast.error("Payment request failed");
    } finally {
      setProcessing(false);
    }
  };

  const sym = invoice?.currency_symbol || "";

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Loader2 className="w-8 h-8 animate-spin" />
          <span className="text-sm font-medium">Loading invoice...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-slate-800 mb-2">Invoice Not Found</h2>
          <p className="text-sm text-slate-500 mb-6">{error}</p>
          <button
            onClick={() => navigate("/cashier-station")}
            className="w-full py-3 bg-slate-900 text-white rounded-xl font-semibold text-sm hover:bg-slate-800 transition-colors"
          >
            Back to Cashier Terminal
          </button>
        </div>
      </div>
    );
  }

  if (paid) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
          <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-800 mb-1">Payment Complete</h2>
          <p className="text-sm text-slate-500 mb-2">{invoice?.name}</p>
          <p className="text-3xl font-bold text-emerald-600 mb-6">
            {sym}{invoice?.grand_total.toFixed(2)}
          </p>
          <a
            href={`/app/sales-invoice/${invoice?.name}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full py-2.5 mb-3 border border-emerald-300 text-emerald-700 rounded-xl font-medium text-sm hover:bg-emerald-50 transition-colors"
          >
            View Invoice
          </a>
          <button
            onClick={() => navigate("/cashier-station")}
            className="w-full py-3 bg-slate-900 text-white rounded-xl font-semibold text-sm hover:bg-slate-800 transition-colors"
          >
            Next Customer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4">
        <button
          onClick={() => navigate("/cashier-station")}
          className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-base font-bold text-slate-900">{invoice?.name}</h1>
          <p className="text-xs text-slate-500">{invoice?.customer_name || invoice?.customer} · {invoice?.posting_date}</p>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 max-w-2xl mx-auto w-full space-y-5">
        {/* Items */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-700">Order Items</h2>
          </div>
          <div className="divide-y divide-slate-50">
            {invoice?.items.map((item, idx) => (
              <div key={idx} className="px-5 py-3 flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{item.item_name}</p>
                  <p className="text-xs text-slate-400">{item.qty} × {sym}{item.rate.toFixed(2)}</p>
                </div>
                <span className="text-sm font-semibold text-slate-700 ml-4">{sym}{item.amount.toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div className="px-5 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-600">Total</span>
            <span className="text-xl font-bold text-slate-900">{sym}{invoice?.grand_total.toFixed(2)}</span>
          </div>
        </div>

        {/* Payment Methods */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-700">Payment Method</h2>
          </div>
          <div className="p-4 grid grid-cols-2 gap-3">
            {(modes.length > 0 ? modes.map((m: any) => m.mode_of_payment || m.name) : ["Cash", "Card"]).map((mode: string) => (
              <button
                key={mode}
                onClick={() => setSelectedMode(mode)}
                className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left ${
                  selectedMode === mode
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <span className={selectedMode === mode ? "text-emerald-600" : "text-slate-400"}>
                  {getPaymentIcon(mode)}
                </span>
                <span className="font-medium text-sm">{mode}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Confirm Button */}
        <button
          onClick={handlePay}
          disabled={!selectedMode || processing}
          className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-2xl font-bold text-lg shadow-lg shadow-emerald-200 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
        >
          {processing ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Processing...
            </>
          ) : (
            `Confirm Payment · ${sym}${invoice?.grand_total.toFixed(2)}`
          )}
        </button>
      </div>
    </div>
  );
}
