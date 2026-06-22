import { useState, useEffect, useMemo } from "react";
import { X, CreditCard, Banknote } from "lucide-react";
import { formatNumberWithCommas, parseNumberFromCommas } from "../utils/currency";
import { useAllPaymentModes } from "../hooks/usePaymentModes";
import { useCreatePOSClosingEntry } from "../services/closingEntry";
import { useSalesInvoices } from "../hooks/useSalesInvoices";
import { usePOSDetails } from "../hooks/usePOSProfile";
import { useUserInfo } from "../hooks/useUserInfo";
import { getCashTransactions } from "../services/cashTransaction";
import type { CashTransaction, CashTransactionSummary } from "../services/cashTransaction";
import { toast } from "react-toastify";
import { clearAllCache } from "../utils/clearCache";
import ShiftClosureReceipt from "./ShiftClosureReceipt";
import type { ShiftReceiptData } from "./ShiftClosureReceipt";

interface CloseShiftModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function CloseShiftModal({ isOpen, onClose, onSuccess }: CloseShiftModalProps) {
  const { modes, isLoading: modesLoading } = useAllPaymentModes();
  const { invoices, isLoading: invoicesLoading, error: invoicesError } = useSalesInvoices();
  const { posDetails } = usePOSDetails();
  const { userInfo } = useUserInfo();
  const { createClosingEntry, isCreating } = useCreatePOSClosingEntry();

  const [closingAmounts, setClosingAmounts] = useState<Record<string, number>>({});
  const [closingInputs, setClosingInputs] = useState<Record<string, string>>({});
  const [cashTransactions, setCashTransactions] = useState<CashTransaction[]>([]);
  const [cashSummary, setCashSummary] = useState<CashTransactionSummary>({ cash_in: 0, cash_out: 0, net: 0 });
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptData, setReceiptData] = useState<ShiftReceiptData | null>(null);

  // Fetch Cash Transactions
  useEffect(() => {
    if (posDetails?.current_opening_entry) {
      getCashTransactions(posDetails.current_opening_entry).then((res) => {
        if (res.success) {
          setCashTransactions(res.data);
          setCashSummary(res.summary);
        }
      });
    }
  }, [posDetails?.current_opening_entry]);

  // Filter invoices for current POS profile and opening entry
  const filteredInvoices = useMemo(() => {
    if (invoicesLoading || invoicesError) return [];
    return invoices.filter((invoice) => {
      const matchesPOSProfile = !posDetails?.name || invoice.posProfile === posDetails.name;
      const matchesOpeningEntry =
        !posDetails?.current_opening_entry ||
        (invoice.custom_pos_opening_entry && invoice.custom_pos_opening_entry === posDetails.current_opening_entry);
      return matchesPOSProfile && matchesOpeningEntry;
    });
  }, [invoices, invoicesLoading, invoicesError, posDetails]);

  // Calculate payment stats
  const paymentStats = useMemo(() => {
    if (!modes || modes.length === 0) {
      return {};
    }

    const stats = modes.reduce((acc, mode) => {
      const name = mode.name || mode.mode_of_payment;
      if (name) {
        // @ts-expect-error ignore
        acc[name] = {
          name,
          openingAmount: mode.openingAmount || 0,
          amount: 0,
          transactions: 0,
        };
      }
      return acc;
    }, {} as Record<string, any>);

    filteredInvoices.forEach((invoice) => {
      if (invoice.payment_methods && Array.isArray(invoice.payment_methods)) {
        invoice.payment_methods.forEach((payment: any) => {
          if (stats[payment.mode_of_payment]) {
            const isReturn = invoice.status === "Return";
            const amount = isReturn ? -Math.abs(payment.amount || 0) : (payment.amount || 0);
            stats[payment.mode_of_payment].amount += amount;

            if (invoice.payment_methods.indexOf(payment) === 0) {
              stats[payment.mode_of_payment].transactions += 1;
            }
          }
        });
      } else {
        if (invoice.paymentMethod && stats[invoice.paymentMethod]) {
          const isReturn = invoice.status === "Return";
          const amount = isReturn ? -Math.abs(invoice.totalAmount || 0) : (invoice.totalAmount || 0);
          stats[invoice.paymentMethod].amount += amount;
          stats[invoice.paymentMethod].transactions += 1;
        }
      }
    });

    Object.keys(stats).forEach((methodName) => {
      stats[methodName].amount += stats[methodName].openingAmount;
    });

    return stats;
  }, [modes, filteredInvoices]);

  const handleClosingAmountChange = (modeName: string, value: string) => {
    const formatted = formatNumberWithCommas(value);
    setClosingInputs((prev) => ({
      ...prev,
      [modeName]: formatted,
    }));
    setClosingAmounts((prev) => ({
      ...prev,
      [modeName]: parseFloat(parseNumberFromCommas(value)) || 0,
    }));
  };

  const handleCloseShift = async () => {
    if (typeof window !== 'undefined' && !navigator.onLine) {
      toast.error("لا يمكن إغلاق الوردية أثناء انقطاع الإنترنت. يرجى الاتصال بالإنترنت أولاً. / Cannot close shift while offline.");
      return;
    }
    try {
      const paymentMethods = modes.map((m) => m.name || m.mode_of_payment);
      const missingMethods = paymentMethods.filter(
        (method) =>
          method &&
          (closingAmounts[method] === undefined ||
            closingAmounts[method] === null ||
            isNaN(closingAmounts[method]))
      );

      if (missingMethods.length > 0) {
        toast.error(`Please enter closing amounts for all payment methods: ${missingMethods.join(", ")}`);
        return;
      }

      const closingBalanceArray = Object.entries(closingAmounts).map(
        ([mode_of_payment, closing_amount]) => ({
          mode_of_payment,
          closing_amount: closing_amount || 0,
        })
      );

      // Call submit closing entry API
      await createClosingEntry(closingBalanceArray);

      // Build receipt data
      const breakdown = Object.values(paymentStats).map((stat: any) => ({
        mode: stat.name,
        openingAmount: stat.openingAmount || 0,
        salesAmount: stat.amount - (stat.openingAmount || 0),
        closingAmount: closingAmounts[stat.name] || 0,
        difference: (closingAmounts[stat.name] || 0) - stat.amount,
      }));

      const receipt: ShiftReceiptData = {
        companyName: posDetails?.company || posDetails?.name,
        posProfile: posDetails?.name || "",
        cashierName: userInfo?.full_name || userInfo?.user || "",
        openingDate: posDetails?.current_opening_entry ? new Date().toLocaleString("en-SA", { hour12: false }) : "",
        closingDate: new Date().toLocaleString("en-SA", { hour12: false }),
        currency: posDetails?.currency || "SAR",
        paymentBreakdown: breakdown,
        cashTransactions,
        cashSummary,
        totalSales: filteredInvoices.filter(i => i.status !== "Return" && i.status !== "Cancelled" && i.status !== "Draft").length,
        totalQuantity: filteredInvoices.filter(i => i.status !== "Return" && i.status !== "Cancelled" && i.status !== "Draft").length,
      };

      setReceiptData(receipt);
      setShowReceipt(true);

      // Clear frontend caches
      clearAllCache();

      // Clear backend cache
      try {
        await fetch("/api/method/sultan.sultan.api.cache.clear_backend_cache", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "X-Frappe-CSRF-Token": (window as any).csrf_token || "",
          },
          credentials: "include",
        });
      } catch (e) {
        console.warn("Failed to clear backend cache after close:", e);
      }
    } catch (err: any) {
      console.error("Error closing shift:", err);
      toast.error(err.message || "Failed to close shift. Please try again.");
    }
  };

  if (!isOpen) return null;

  if (showReceipt && receiptData) {
    return (
      <ShiftClosureReceipt
        data={receiptData}
        onClose={() => {
          setShowReceipt(false);
          if (onSuccess) {
            onSuccess();
          }
        }}
      />
    );
  }

  const isLoading = modesLoading || invoicesLoading;
  const isOffline = typeof window !== 'undefined' && !navigator.onLine;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100] p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl relative">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Close Shift</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Offline Banner */}
        {isOffline && (
          <div className="mb-4 p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl flex items-center space-x-3 text-red-800 dark:text-red-200">
            <span className="text-sm font-semibold">
              لا يمكن إغلاق الوردية أثناء انقطاع الإنترنت. يرجى الاتصال بالشبكة أولاً.
              <br />
              Cannot close shift while offline. Please connect to the internet.
            </span>
          </div>
        )}

        {/* Content */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-ziditech-600"></div>
            <p className="mt-4 text-gray-600 dark:text-gray-300">Loading details...</p>
          </div>
        ) : (
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            {modes.map((mode) => {
              const name = mode.name || mode.mode_of_payment;
              if (!name) return null;
              const isCash = name.toLowerCase().includes("cash");
              return (
                <div
                  key={name}
                  className="flex items-center justify-between gap-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-100 dark:border-gray-700"
                >
                  <div className="flex items-center space-x-3">
                    {isCash ? (
                      <Banknote className="w-6 h-6 text-gray-500 dark:text-gray-400" />
                    ) : (
                      <CreditCard className="w-6 h-6 text-gray-500 dark:text-gray-400" />
                    )}
                    <span className="font-semibold text-gray-900 dark:text-white text-base">
                      {name}
                    </span>
                  </div>

                  <div className="flex items-center">
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="Enter actual amount"
                      required
                      value={closingInputs[name] || ""}
                      onChange={(e) => handleClosingAmountChange(name, e.target.value)}
                      className="w-44 px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-ziditech-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-bold shadow-sm"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex justify-end items-center space-x-4 mt-6 pt-4 border-t border-gray-100 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-red-600 hover:text-red-500 font-bold transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCloseShift}
            disabled={isCreating || isLoading || isOffline}
            className={`px-7 py-2.5 rounded-xl font-bold transition-all shadow-md active:scale-95 ${
              isCreating || isLoading || isOffline
                ? "bg-gray-300 dark:bg-gray-600 text-gray-500 cursor-not-allowed"
                : "bg-ziditech-600 text-white hover:bg-ziditech-700"
            }`}
          >
            {isCreating ? "Closing..." : "Close Shift"}
          </button>
        </div>
      </div>
    </div>
  );
}
