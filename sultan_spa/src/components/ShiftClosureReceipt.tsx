import { useRef } from "react"
import { Printer } from "lucide-react"
import { formatCurrency, formatPaymentMethodName } from "../utils/currency"
import type { CashTransaction, CashTransactionSummary } from "../services/cashTransaction"

export interface ShiftReceiptData {
  companyName?: string
  posProfile: string
  sessionNumber?: string      // POS Opening Entry name e.g. OP-BRANCH-00001
  cashierName: string
  openingDate: string
  closingDate: string
  currency: string
  paymentBreakdown: Array<{
    mode: string
    openingAmount: number
    salesAmount: number
    closingAmount: number
    difference: number
    currency?: string
    currencyNumberFormat?: string
  }>
  cashTransactions: CashTransaction[]
  cashSummary: CashTransactionSummary
  totalSales: number
  totalQuantity: number
}

interface Props {
  data: ShiftReceiptData
  onClose: () => void
}

function formatAmt(amount: number, currency: string, numberFormat?: string): string {
  let precision = 2;
  if (numberFormat) {
    const match = numberFormat.match(/[.,]([#0]+)$/);
    precision = match ? match[1].length : 0;
  }

  // Always add thousands separator
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });
}

function ReceiptContent({ data }: { data: ShiftReceiptData }) {
  const now = new Date()
  const printedAt = now.toLocaleString("en-US", { hour12: false })

  // Group paymentBreakdown by currency to show multi-currency totals
  const currencyTotals: Record<string, number> = {}
  const currencyFormats: Record<string, string> = {}
  data.paymentBreakdown.forEach(p => {
    const cur = p.currency || data.currency || ""
    currencyTotals[cur] = (currencyTotals[cur] || 0) + p.salesAmount
    if (p.currencyNumberFormat) {
      currencyFormats[cur] = p.currencyNumberFormat
    }
  })

  return (
    <div style={{ fontFamily: "monospace", fontSize: "12px", width: "76mm", margin: "0 auto", color: "#000" }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "8px" }}>
        <div style={{ fontSize: "16px", fontWeight: "bold" }}>{data.companyName || data.posProfile}</div>
        <div style={{ fontSize: "11px" }}>{data.posProfile}</div>
        {data.sessionNumber && (
          <div style={{ fontSize: "10px", color: "#555" }}>Session: {data.sessionNumber}</div>
        )}
        <div style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />
        <div>Shift Closure Report</div>
        <div style={{ fontSize: "10px" }}>Cashier: {data.cashierName}</div>
        <div style={{ fontSize: "10px" }}>
          From: {data.openingDate}
        </div>
        <div style={{ fontSize: "10px" }}>
          To: {data.closingDate}
        </div>
        <div style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />
      </div>

      {/* Payment Breakdown */}
      <div style={{ marginBottom: "6px" }}>
        <div style={{ fontWeight: "bold", textAlign: "center", marginBottom: "3px" }}>PAYMENT SUMMARY</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Mode</th>
              <th style={{ textAlign: "right" }}>Open</th>
              <th style={{ textAlign: "right" }}>Sales</th>
              <th style={{ textAlign: "right" }}>Expected</th>
              <th style={{ textAlign: "right" }}>Actual</th>
            </tr>
          </thead>
          <tbody>
            {data.paymentBreakdown.map((p) => {
              const cur = (p.currency || data.currency || "").toUpperCase();
              return (
                <tr key={`${p.mode}-${cur}`}>
                  <td style={{ maxWidth: "22mm", overflow: "hidden", fontSize: "10px" }}>{formatPaymentMethodName(p.mode)}</td>
                  <td style={{ textAlign: "right" }}>{formatAmt(p.openingAmount, cur, p.currencyNumberFormat)}</td>
                  <td style={{ textAlign: "right" }}>{formatAmt(p.salesAmount, cur, p.currencyNumberFormat)}</td>
                  <td style={{ textAlign: "right" }}>{formatAmt(p.openingAmount + p.salesAmount, cur, p.currencyNumberFormat)}</td>
                  <td style={{ textAlign: "right" }}>{formatAmt(p.closingAmount, cur, p.currencyNumberFormat)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />

      {/* Cash In/Out */}
      {data.cashTransactions.length > 0 && (
        <>
          <div style={{ marginBottom: "6px" }}>
            <div style={{ fontWeight: "bold", textAlign: "center", marginBottom: "3px" }}>CASH IN / CASH OUT</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Type</th>
                  <th style={{ textAlign: "right" }}>Amount</th>
                  <th style={{ textAlign: "left", paddingLeft: "4px" }}>Description</th>
                </tr>
              </thead>
              <tbody>
                {data.cashTransactions.map((txn) => (
                  <tr key={txn.name}>
                    <td style={{ color: txn.transaction_type === "Cash In" ? "#006600" : "#cc0000" }}>
                      {txn.transaction_type === "Cash In" ? "IN" : "OUT"}
                    </td>
                    <td style={{ textAlign: "right" }}>{formatAmt(txn.amount, data.currency)}</td>
                    <td style={{ paddingLeft: "4px", maxWidth: "30mm", overflow: "hidden" }}>
                      {txn.description?.slice(0, 18)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ fontSize: "11px", marginTop: "3px" }}>
              <span>Cash In: {formatAmt(data.cashSummary.cash_in, data.currency)}</span>
              {"  "}
              <span>Cash Out: {formatAmt(data.cashSummary.cash_out, data.currency)}</span>
              {"  "}
              <span>Net: {formatAmt(data.cashSummary.net, data.currency)}</span>
            </div>
          </div>
          <div style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />
        </>
      )}

      {/* Totals - per currency */}
      <div style={{ fontSize: "12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Total Transactions:</span>
          <span>{data.totalQuantity}</span>
        </div>
        {Object.entries(currencyTotals).map(([cur, total]) => (
          <div key={cur} style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Total Sales ({cur}):</span>
            <span style={{ fontWeight: "bold" }}>
              {formatAmt(total, cur, currencyFormats[cur])} {cur}
            </span>
          </div>
        ))}
        {data.cashSummary.net !== 0 && (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Net Cash I/O:</span>
            <span>{formatCurrency(data.cashSummary.net, data.currency)}</span>
          </div>
        )}
      </div>

      <div style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />

      {/* Differences */}
      {data.paymentBreakdown.some(p => p.difference !== 0) && (
        <div style={{ fontSize: "11px", marginBottom: "6px" }}>
          <div style={{ fontWeight: "bold", textAlign: "center" }}>DIFFERENCES</div>
          {data.paymentBreakdown.filter(p => p.difference !== 0).map(p => {
            const cur = (p.currency || data.currency || "").toUpperCase();
            return (
              <div key={`${p.mode}-${cur}`} style={{ display: "flex", justifyContent: "space-between" }}>
                <span>{formatPaymentMethodName(p.mode)}:</span>
                <span style={{ color: p.difference < 0 ? "#cc0000" : "#006600" }}>
                  {p.difference > 0 ? "+" : ""}{formatAmt(p.difference, cur, p.currencyNumberFormat)} {cur}
                </span>
              </div>
            );
          })}
          <div style={{ borderTop: "1px dashed #000", margin: "4px 0" }} />
        </div>
      )}

      {/* Footer */}
      <div style={{ textAlign: "center", fontSize: "10px", marginTop: "6px" }}>
        <div>Printed: {printedAt}</div>
        <div style={{ marginTop: "16px", borderTop: "1px solid #000", paddingTop: "4px" }}>
          Cashier Signature
        </div>
        <div style={{ marginTop: "16px", borderTop: "1px solid #000", paddingTop: "4px" }}>
          Manager Signature
        </div>
      </div>
    </div>
  )
}


export default function ShiftClosureReceipt({ data, onClose }: Props) {
  const printRef = useRef<HTMLDivElement>(null)

  const handlePrint = () => {
    const win = window.open("", "_blank", "width=400,height=600")
    if (!win) return
    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Shift Closure - ${data.posProfile}</title>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { background: #fff; }
            @page { size: 80mm auto; margin: 5mm; }
            @media print { body { width: 80mm; } }
          </style>
        </head>
        <body>${printRef.current?.innerHTML || ""}</body>
      </html>
    `)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 300)
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Shift Closure Receipt</h2>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-ziditech-600 text-white rounded-lg hover:bg-ziditech-700 transition-colors"
          >
            <Printer className="w-4 h-4" />
            Print
          </button>
        </div>

        {/* Preview */}
        <div className="flex-1 overflow-y-auto p-6 bg-gray-50 dark:bg-gray-900">
          <div className="bg-white shadow-sm rounded border border-gray-200 p-4 mx-auto" style={{ maxWidth: "340px" }}>
            <div ref={printRef}>
              <ReceiptContent data={data} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-ziditech-600 text-white rounded-lg hover:bg-ziditech-700 font-semibold"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
