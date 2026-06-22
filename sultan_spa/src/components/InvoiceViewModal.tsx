"use client";

import React, { useState } from "react";
import { X, Printer, Loader2 } from "lucide-react";
import type { SalesInvoice } from "../../types";
import { useInvoiceDetails } from "../hooks/useInvoiceDetails";
import { usePOSDetails } from "../hooks/usePOSProfile";
import DisplayPrintPreview from "../utils/invoicePrint";
import { handlePrintInvoice } from "../utils/printHandler";

interface InvoiceViewModalProps {
  invoice: SalesInvoice | null;
  isOpen: boolean;
  onClose: () => void;
  onRefund?: (invoiceId: string) => void;
  onCancel?: (invoiceId: string) => void;
}

export default function InvoiceViewModal({
  invoice,
  isOpen,
  onClose,
}: InvoiceViewModalProps) {
  const [receiptLanguage, setReceiptLanguage] = useState<"en" | "ar">("ar");

  // Fetch full details (so we have all fields like taxes, customer address, etc. if needed)
  const {
    invoice: fullInvoice,
    isLoading,
    error,
  } = useInvoiceDetails(invoice?.id ?? null);

  const { posDetails } = usePOSDetails();

  if (!isOpen || !invoice) return null;

  const displayInvoice = (fullInvoice || invoice) as SalesInvoice;

  const canPreviewReceiptLanguage = {
    en: Boolean(posDetails?.custom_pos_print_format_en),
    ar: Boolean(posDetails?.custom_pos_print_format_ar),
  };

  const handlePrintAction = () => {
    handlePrintInvoice(displayInvoice);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4 bg-black/60">
        <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                Print Invoice
              </h2>
              <p className="text-xs text-gray-500">
                {displayInvoice.id}
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={handlePrintAction}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors text-gray-700 dark:text-gray-200"
                title="Print"
              >
                <Printer className="w-6 h-6 text-ziditech-600" />
              </button>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors text-gray-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-5 overflow-y-auto flex-1 bg-gray-50 dark:bg-gray-900/50">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="w-10 h-10 animate-spin text-ziditech-600 mb-4" />
                <span className="text-gray-600 dark:text-gray-400 font-medium">Loading invoice details...</span>
              </div>
            ) : error ? (
              <div className="text-red-500 text-center py-12">
                Error loading invoice: {error}
              </div>
            ) : (
              <div className="flex flex-col items-center">
                {/* Language Toggle */}
                <div className="mb-4">
                  <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 p-1">
                    {canPreviewReceiptLanguage.en && (
                      <button
                        type="button"
                        onClick={() => setReceiptLanguage("en")}
                        className={`px-4 py-1 text-xs font-semibold rounded-md transition-colors ${
                          receiptLanguage === "en"
                            ? "bg-ziditech-600 text-white"
                            : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                        }`}
                      >
                        EN
                      </button>
                    )}
                    {canPreviewReceiptLanguage.ar && (
                      <button
                        type="button"
                        onClick={() => setReceiptLanguage("ar")}
                        className={`px-4 py-1 text-xs font-semibold rounded-md transition-colors ${
                          receiptLanguage === "ar"
                            ? "bg-ziditech-600 text-white"
                            : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                        }`}
                      >
                        AR
                      </button>
                    )}
                  </div>
                </div>

                {/* Preview Area */}
                <div className="w-full border border-gray-300 dark:border-gray-600 rounded-xl p-4 bg-white dark:bg-gray-800 max-h-[60vh] overflow-y-auto shadow-sm flex justify-center print-preview-container">
                  <div className="w-[80mm] print:w-full">
                    <DisplayPrintPreview invoice={displayInvoice} language={receiptLanguage} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
