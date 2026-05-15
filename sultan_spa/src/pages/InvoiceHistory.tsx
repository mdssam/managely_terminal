import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  FilePlus,
  RefreshCw,
  Download,
  Search,
  DollarSign,
  Grid3X3,
  List,
  Eye,
  Edit,
  Users,
  ShoppingCart,
  RotateCcw,
  Check,
  FileMinus,
} from "lucide-react";

import InvoiceViewModal from "../components/InvoiceViewModal";
import BottomNavigation from "../components/BottomNavigation";
import MultiInvoiceReturn from "../components/MultiInvoiceReturn";
import SingleInvoiceReturn from "../components/SingleInvoiceReturn";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { formatCurrency } from "../utils/currency";
import type { SalesInvoice } from "../../types";
import { useSalesInvoices } from "../hooks/useSalesInvoices";
import { useCustomers } from "../hooks/useCustomers";
import { useUserInfo } from "../hooks/useUserInfo";
import { usePOSDetails } from "../hooks/usePOSProfile";
import { toast } from "react-toastify";
import { extractErrorFromException } from "../utils/errorExtraction";
import { createSalesReturn, deleteDraftInvoice, submitDraftInvoice } from "../services/salesInvoice";
import { useAllPaymentModes } from "../hooks/usePaymentModes";

import { addDraftInvoiceToCart } from "../utils/draftInvoiceToCart";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { isToday, isThisWeek, isThisMonth, isThisYear } from "../utils/time";
import { exportInvoicesToCSV, getExportFilename, type ExportableInvoice } from "../utils/exportUtils";
// import InvoiceViewPage from "./InvoiceViewPage";

export default function InvoiceHistoryPage() {
  const navigate = useNavigate();
  const isMobile = useMediaQuery("(max-width: 1024px)");
  const [activeTab, setActiveTab] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [cashierFilter, setCashierFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"cards" | "list">("list");
  const [selectedInvoice] = useState<SalesInvoice | null>(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);

  // Multi-Invoice Return states
  const [showCustomerSelection, setShowCustomerSelection] = useState(false);
  const [showMultiReturn, setShowMultiReturn] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");


  // Single Invoice Return states
  const [showSingleReturn, setShowSingleReturn] = useState(false);
  const [selectedInvoiceForReturn, setSelectedInvoiceForReturn] = useState<SalesInvoice | null>(null);

  // Delete confirmation states
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState<SalesInvoice | null>(null);

  // Original edit options states
  const [showEditOptions, setShowEditOptions] = useState(false);
  const [selectedDraftInvoice, setSelectedDraftInvoice] = useState<SalesInvoice | null>(null);

  // Skip opening entry filter for Invoice History - show all invoices for cashier regardless of opening entry
  // Pass cashier filter to API so it filters on server side (more efficient)
  const { invoices, isLoading, isLoadingMore, error, hasMore, totalLoaded, totalCount, loadMore } = useSalesInvoices(searchTerm, true, cashierFilter);
  const { modes } = useAllPaymentModes();
  const { customers } = useCustomers();
  const { posDetails } = usePOSDetails();
  const { userInfo, isLoading: userInfoLoading } = useUserInfo();

  // Role-based filtering
  const isAdminUser = userInfo?.is_admin_user || false;
  const currentUserCashier = userInfo?.full_name || "";

  // Set default cashier filter for non-admin users
  useEffect(() => {
    if (!isAdminUser && currentUserCashier && cashierFilter === "all") {
      setCashierFilter(currentUserCashier);
    }
  }, [isAdminUser, currentUserCashier, cashierFilter]);

  // Keyboard event handler for Escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (showEditOptions) {
          handleCloseEditOptions();
        }
        if (showCustomerSelection) {
          setShowCustomerSelection(false);
        }
        if (showMultiReturn) {
          setShowMultiReturn(false);
        }
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [showEditOptions, showCustomerSelection, showMultiReturn]);

  const tabs = [
    { id: "all", name: "All Invoices", icon: FileText, color: "text-gray-600" },
    { id: "Draft", name: "Draft", icon: FilePlus, color: "text-gray-500" },
    { id: "Unpaid", name: "Unpaid", icon: Clock, color: "text-yellow-600" },
    { id: "Partly Paid", name: "Partly Paid", icon: AlertTriangle, color: "text-orange-600" },
    { id: "Paid", name: "Paid", icon: CheckCircle, color: "text-ziditech-600" },
    { id: "Overdue", name: "Overdue", icon: XCircle, color: "text-red-600" },
    { id: "Return", name: "Returns", icon: RefreshCw, color: "text-ziditech-600" },
    { id: "Cancelled", name: "Cancelled", icon: XCircle, color: "text-red-500" },
  ];

  const filterInvoiceByDate = (invoiceDateStr: string) => {
    if (dateFilter === "all") return true;

    if (dateFilter === "today") {
      return isToday(invoiceDateStr);
    }

    if (dateFilter === "yesterday") {
      const yesterday = new Date();
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      const invoiceDate = new Date(invoiceDateStr);
      return (
        invoiceDate.getUTCFullYear() === yesterday.getUTCFullYear() &&
        invoiceDate.getUTCMonth() === yesterday.getUTCMonth() &&
        invoiceDate.getUTCDate() === yesterday.getUTCDate()
      );
    }

    if (dateFilter === "week") {
      return isThisWeek(invoiceDateStr);
    }

    if (dateFilter === "month") {
      return isThisMonth(invoiceDateStr);
    }

    if (dateFilter === "year") {
      return isThisYear(invoiceDateStr);
    }

    return true;
  };


const getStatusBadge = (status: string) => {
  const baseClasses = "px-2.5 py-1 rounded-full text-xs font-medium";
  const normalized = status?.toLowerCase() || "";

  switch (normalized) {
    case "paid":      return `${baseClasses} bg-green-100 text-green-800`;
    case "unpaid":    return `${baseClasses} bg-yellow-100 text-yellow-800`;
    case "partly paid": return `${baseClasses} bg-orange-100 text-orange-800`;
    case "overdue":   return `${baseClasses} bg-red-100 text-red-800`;
    case "draft":     return `${baseClasses} bg-gray-100 text-gray-700`;
    case "return":    return `${baseClasses} bg-purple-100 text-purple-800`;
    case "cancelled": return `${baseClasses} bg-red-100 text-red-700`;
    case "pending":   return `${baseClasses} bg-yellow-100 text-yellow-800`;
    case "reported":  return `${baseClasses} bg-blue-100 text-blue-800`;
    case "not reported": return `${baseClasses} bg-gray-100 text-gray-700`;
    case "cleared":   return `${baseClasses} bg-green-100 text-green-800`;
    case "not cleared": return `${baseClasses} bg-red-100 text-red-800`;
    default:          return `${baseClasses} bg-gray-100 text-gray-700`;
  }
};



  const filteredInvoices = useMemo(() => {
    if (isLoading) return [];
    if (error) return [];

    const filtered = invoices.filter((invoice) => {
      // Server-side search is handled by the API, so we only apply client-side filters
      // Normalize status comparison to handle case and whitespace differences
      const invoiceStatus = (invoice.status || "").trim();
      const tabStatus = (activeTab || "").trim();
      const matchesStatus = activeTab === "all" || invoiceStatus === tabStatus;
      const matchesPayment = paymentFilter === "all" || invoice.paymentMethod === paymentFilter;
      const matchesCashier = cashierFilter === "all" || invoice.cashier === cashierFilter;
      const matchesDate = filterInvoiceByDate(invoice.date);

      return matchesPayment && matchesCashier && matchesStatus && matchesDate;
    });

    // Debug: Log filtering results
    if (activeTab !== "all") {
      console.log(`[InvoiceHistory] Filtering by status "${activeTab}":`, {
        totalInvoices: invoices.length,
        filteredCount: filtered.length,
        activeTab,
        sampleStatuses: invoices.slice(0, 5).map(inv => inv.status)
      });
    }

    return filtered;
  }, [invoices, activeTab, dateFilter, paymentFilter, cashierFilter, isLoading, error]);

  const uniqueCashiers = useMemo(() => {
    return [...new Set(invoices.map(invoice => invoice.cashier).filter(Boolean))];
  }, [invoices]);

    // Filter customers based on search query
  const filteredCustomers = useMemo(() => {
    if (!customers) return [];

    // First, filter out customers with invalid data
    const validCustomers = customers.filter(customer =>
      customer && (customer.customer_name || customer.name)
    );

    if (!customerSearchQuery.trim()) return validCustomers;

    const query = customerSearchQuery.toLowerCase();
    return validCustomers.filter(customer => {
      // Safely handle potentially undefined values
      const customerName = customer.customer_name?.toLowerCase() || '';
      const customerCode = customer.name?.toLowerCase() || '';

      return customerName.includes(query) || customerCode.includes(query);
    });
  }, [customers, customerSearchQuery]);

  // Get count for each status - filtered by cashier, date, and payment (but not status)
  // This ensures tab counts reflect the current filter selections
  const getStatusCount = (status: string) => {
    // First apply all filters except status
    const invoicesFilteredByOtherFilters = invoices.filter((invoice) => {
      const matchesPayment = paymentFilter === "all" || invoice.paymentMethod === paymentFilter;
      const matchesCashier = cashierFilter === "all" || invoice.cashier === cashierFilter;
      const matchesDate = filterInvoiceByDate(invoice.date);
      return matchesPayment && matchesCashier && matchesDate;
    });

    // Then count by status - normalize comparison
    if (status === "all") {
      return invoicesFilteredByOtherFilters.length;
    }
    const normalizedStatus = (status || "").trim();
    return invoicesFilteredByOtherFilters.filter(invoice => {
      const invoiceStatus = (invoice.status || "").trim();
      return invoiceStatus === normalizedStatus;
    }).length;
  };

  // Loading state - only block if nothing loaded yet
  if ((isLoading && invoices.length === 0) || userInfoLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#eef1f8' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-t-transparent mx-auto mb-4" style={{ borderColor: '#1e2d6b', borderTopColor: 'transparent' }}></div>
          <p className="text-gray-500 font-medium">Loading invoices...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#eef1f8' }}>
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm max-w-md">
          <h3 className="text-base font-semibold text-gray-900 mb-2">Error loading invoices</h3>
           {/* @ts-expect-error just ignore */}
          <p className="text-sm text-gray-500">{error.message}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 text-white rounded-xl text-sm font-semibold transition-all"
            style={{ backgroundColor: '#1e2d6b' }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Define render functions before they are used
  const renderFilters = () => (
    <div className="w-full max-w-none bg-white rounded-xl p-5 border border-gray-200 mb-5">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={15} />
          <input
            type="text"
            placeholder="Search invoices..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:border-[#1e2d6b] bg-gray-50 text-gray-900 text-sm"
          />
          {isLoading && invoices.length > 0 && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="animate-spin h-4 w-4 border-2 border-t-transparent rounded-full" style={{ borderColor: '#1e2d6b', borderTopColor: 'transparent' }}></div>
            </div>
          )}
        </div>
        <select
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          className="px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:border-[#1e2d6b] bg-gray-50 text-gray-900 text-sm"
        >
          <option value="all">All Time</option>
          <option value="today">Today</option>
          <option value="yesterday">Yesterday</option>
          <option value="week">This Week</option>
          <option value="month">This Month</option>
          <option value="year">This Year</option>
        </select>
        <select
          value={cashierFilter}
          onChange={(e) => setCashierFilter(e.target.value)}
          disabled={!isAdminUser}
          className={`px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:border-[#1e2d6b] bg-gray-50 text-gray-900 text-sm ${!isAdminUser ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <option value="all">All Cashiers</option>
          {uniqueCashiers.map((cashier) => (
            <option key={cashier} value={cashier}>{cashier}</option>
          ))}
        </select>
        <select
          value={paymentFilter}
          onChange={(e) => setPaymentFilter(e.target.value)}
          className="px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:border-[#1e2d6b] bg-gray-50 text-gray-900 text-sm"
        >
          <option value="all">All Payments</option>
          {modes.map((mode) => (
            <option key={mode.name} value={mode.name}>{mode.name}</option>
          ))}
        </select>
      </div>
    </div>
  );

  const renderSummaryCards = () => (
    <div className="w-full max-w-none grid grid-cols-1 md:grid-cols-4 gap-4 mb-5">
      {[
        {
          label: "Total Invoices",
          value: filteredInvoices.length,
          sub: hasMore ? `${totalLoaded} of ${totalCount}` : null,
          icon: FileText,
        },
        {
          label: "Total Amount",
          value: formatCurrency(filteredInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0), posDetails?.currency || 'USD'),
          sub: null,
          icon: DollarSign,
        },
        {
          label: "Paid Amount",
          value: formatCurrency(filteredInvoices.filter(inv => inv.status === "Paid").reduce((sum, inv) => sum + inv.totalAmount, 0), posDetails?.currency || 'USD'),
          sub: null,
          icon: CheckCircle,
        },
        {
          label: "Outstanding",
          value: formatCurrency(filteredInvoices.filter(inv => ["Unpaid", "Partly Paid", "Overdue"].includes(inv.status)).reduce((sum, inv) => sum + inv.totalAmount, 0), posDetails?.currency || 'USD'),
          sub: null,
          icon: AlertTriangle,
        },
      ].map(({ label, value, sub, icon: Icon }) => (
        <div key={label} className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
              <p className="text-xl font-bold text-gray-900">{value}</p>
              {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
            </div>
            <div className="p-2.5 rounded-xl" style={{ backgroundColor: '#eef1f8' }}>
              <Icon className="w-5 h-5" style={{ color: '#1e2d6b' }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  const renderInvoicesTable = () => (
    <div className="w-full max-w-none bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900">
          {activeTab === "all" ? "All Invoices" : tabs.find(t => t.id === activeTab)?.name} ({filteredInvoices.length})
        </h3>
        <div className="flex items-center space-x-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setViewMode("list")}
            className={`p-1.5 rounded-md transition-colors ${viewMode === "list" ? "bg-white text-gray-800 shadow-sm" : "text-gray-400 hover:text-gray-600"}`}
          >
            <List className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode("cards")}
            className={`p-1.5 rounded-md transition-colors ${viewMode === "cards" ? "bg-white text-gray-800 shadow-sm" : "text-gray-400 hover:text-gray-600"}`}
          >
            <Grid3X3 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {viewMode === "list" ? (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {["Invoice", "Customer", "Cashier", "Payment", "Amount", "Status", ...(posDetails?.is_zatca_enabled ? ["Zatca Status"] : []), "Actions"].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredInvoices.map((invoice) => (
                <tr key={`${activeTab}-${invoice.id}`} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{invoice.id}</div>
                    <div className="text-xs text-gray-400">{invoice.date} {invoice.time}</div>
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap text-sm text-gray-700">{invoice.customer}</td>
                  <td className="px-5 py-3.5 whitespace-nowrap text-sm text-gray-700">{invoice.cashier}</td>
                  <td className="px-5 py-3.5 whitespace-nowrap text-sm text-gray-700">{invoice.paymentMethod}</td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{formatCurrency(invoice.totalAmount, invoice.currency)}</div>
                    {invoice.giftCardDiscount > 0 && (
                      <div className="text-xs text-orange-600">-{formatCurrency(invoice.giftCardDiscount, invoice.currency)} gift</div>
                    )}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <span className={getStatusBadge(invoice.status)}>{invoice.status}</span>
                  </td>
                  {posDetails?.is_zatca_enabled && (
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      {/* @ts-expect-error just ignore */}
                      <span className={getStatusBadge(invoice.custom_zatca_submit_status)}>{invoice.custom_zatca_submit_status}</span>
                    </td>
                  )}
                  <td className="px-5 py-3.5 whitespace-nowrap text-sm font-medium">
                    <div className="flex items-center space-x-3">
                      <button onClick={() => handleViewInvoice(invoice)} className="flex items-center space-x-1 text-[#1e2d6b] hover:opacity-70 transition-opacity">
                        <Eye className="w-4 h-4" /><span>View</span>
                      </button>
                      {invoice.status === "Draft" && (
                        <button onClick={() => handleEditDraftClick(invoice)} className="flex items-center space-x-1 text-blue-600 hover:opacity-70 transition-opacity">
                          <Edit className="w-4 h-4" /><span>Edit</span>
                        </button>
                      )}
                      {/* @ts-expect-error just ignore */}
                      {["Paid", "Unpaid", "Overdue", "Partly Paid", "Credit Note Issued"].includes(invoice.status) && !invoice.is_return && hasReturnableItems(invoice) && (
                        <button onClick={() => handleSingleReturnClick(invoice)} className="flex items-center space-x-1 text-orange-600 hover:opacity-70 transition-opacity">
                          <RotateCcw className="w-4 h-4" /><span>Return</span>
                        </button>
                      )}
                      {invoice.status === "Draft" && (
                        <button onClick={() => handleDeleteClick(invoice)} className="flex items-center space-x-1 text-red-500 hover:opacity-70 transition-opacity">
                          <FileMinus className="w-4 h-4" /><span>Delete</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-5">
          {filteredInvoices.map((invoice) => (
            <div key={`${activeTab}-${invoice.id}`} className="bg-gray-50 rounded-xl p-4 border border-gray-200 hover:shadow-sm transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold text-gray-900">{invoice.id}</div>
                <span className={getStatusBadge(invoice.status)}>{invoice.status}</span>
              </div>
              <div className="space-y-1.5">
                {[
                  { label: "Customer", value: invoice.customer },
                  { label: "Amount", value: formatCurrency(invoice.totalAmount, invoice.currency) },
                  { label: "Date", value: invoice.date },
                  { label: "Cashier", value: invoice.cashier },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between text-sm">
                    <span className="text-gray-500">{label}:</span>
                    <span className="text-gray-900 font-medium">{value}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex space-x-2">
                <button onClick={() => handleViewInvoice(invoice)} className="flex-1 text-xs px-3 py-2 text-white rounded-lg transition-colors" style={{ backgroundColor: '#1e2d6b' }}>View</button>
                {invoice.status === "Draft" && (
                  <button onClick={() => handleEditDraftClick(invoice)} className="flex-1 text-xs px-3 py-2 bg-blue-600 text-white rounded-lg flex items-center justify-center space-x-1 transition-colors">
                    <Edit className="w-3 h-3" /><span>Edit</span>
                  </button>
                )}
                {["Paid", "Unpaid", "Overdue", "Partly Paid", "Credit Note Issued"].includes(invoice.status) && hasReturnableItems(invoice) && (
                  <button onClick={() => handleSingleReturnClick(invoice)} className="flex-1 text-xs px-3 py-2 bg-orange-600 text-white rounded-lg transition-colors">Return</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center p-5 border-t border-gray-100">
          <button
            onClick={loadMore}
            disabled={isLoadingMore}
            className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-40"
            style={{ backgroundColor: '#1e2d6b' }}
          >
            {isLoadingMore ? (
              <div className="flex items-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-t-transparent border-white"></div>
                <span>Loading...</span>
              </div>
            ) : `Load More (${totalLoaded}/${totalCount})`}
          </button>
        </div>
      )}

      {!hasMore && totalLoaded > 0 && (
        <div className="text-center py-4 border-t border-gray-100">
          <p className="text-xs text-gray-400">
            {filteredInvoices.length > 0
              ? `Showing ${filteredInvoices.length} invoice${filteredInvoices.length !== 1 ? 's' : ''}`
              : `All ${totalCount} invoices loaded`}
          </p>
        </div>
      )}
    </div>
  );

  const handleViewInvoice = (invoice: SalesInvoice) => {
    navigate(`/invoice/${invoice.id}`);
  };


    // Helper function to check if invoice has items that can still be returned
  const hasReturnableItems = (invoice: SalesInvoice) => {
    if (!invoice || !invoice.items) {
      console.log("No invoice or items found for:", invoice?.id);
      return false;
    }

    // Use the canReturn property set by background return data loading
    // @ts-expect-error just ignore
    if (invoice.canReturn !== undefined) {
      //@ts-expect-error just ignore
      return invoice.canReturn;
    }

    // Fallback to old logic if canReturn is not set yet
    const hasReturnable = invoice.items.some(item => {
      const soldQty = item.qty || item.quantity || 0;
      const returnedQty = item.returned_qty || 0;
      const canReturn = returnedQty < soldQty;
      return canReturn;
    });

    return hasReturnable;
  };



  // Delete invoice handlers
  const handleDeleteClick = (invoice: SalesInvoice) => {
    if (invoice.status !== "Draft") {
      toast.error("Only draft invoices can be deleted");
      return;
    }
    setInvoiceToDelete(invoice);
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!invoiceToDelete) return;

    try {
      await deleteDraftInvoice(invoiceToDelete.id);
      toast.success(`Draft invoice ${invoiceToDelete.id} deleted successfully`);
      setShowDeleteConfirm(false);
      setInvoiceToDelete(null);
      // Refresh the invoices list
      window.location.reload();
      //eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      toast.error(error.message || "Failed to delete invoice");
    }
  };

  const handleDeleteCancel = () => {
    setShowDeleteConfirm(false);
    setInvoiceToDelete(null);
  };

  // Edit draft invoice handlers
  const handleEditDraftClick = (invoice: SalesInvoice) => {
    if (invoice.status !== "Draft") {
      toast.error("Only draft invoices can be edited");
      return;
    }
    setSelectedDraftInvoice(invoice);
    setShowEditOptions(true);
  };

  const handleGoToCart = async (invoice: SalesInvoice) => {
    try {
      const success = await addDraftInvoiceToCart(invoice.id);
      if (success) {
        setShowEditOptions(false);
        setSelectedDraftInvoice(null);
        setTimeout(() => {
          navigate('/pos'); // Navigate directly to POS page
        }, 500);
      }
      //eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error("Error going to cart:", error);
      toast.error(error.message || "Failed to add items to cart");
    }
  };

  const handleSubmitDirect = async (invoice: SalesInvoice) => {
    try {
      await submitDraftInvoice(invoice.id);
      toast.success(`Draft invoice ${invoice.id} submitted successfully`);
      setShowEditOptions(false);
      setSelectedDraftInvoice(null);
      // Refresh the invoices list
      window.location.reload();
      //eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error("Error submitting draft invoice:", error);
      const errorMessage = extractErrorFromException(error, "Failed to submit draft invoice");
      toast.error(errorMessage);
    }
  };

  const handleCloseEditOptions = () => {
    setShowEditOptions(false);
    setSelectedDraftInvoice(null);
  };

  const handleRefund = (invoiceId: string) => {
    handleReturnClick(invoiceId);
    setShowInvoiceModal(false);
  };

  const handleReturnClick = async (invoiceName: string) => {
    try {
      const result = await createSalesReturn(invoiceName);

      navigate(`/invoice/${result.return_invoice}`)
      toast.success(`Invoice returned: ${result.return_invoice}`);
      //eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      toast.error(error.message || "Failed to return invoice");
    }
  };

  const handleCancel = (invoiceId: string) => {
    console.log("Cancelling invoice:", invoiceId);
    setShowInvoiceModal(false);
  };

      // Multi-Invoice Return handlers
    const handleMultiReturnClick = () => {
      setSelectedCustomer("");
      setShowMultiReturn(true);
    };

    // Single Invoice Return handlers
    const handleSingleReturnClick = (invoice: SalesInvoice) => {
      setSelectedInvoiceForReturn(invoice);
      setShowSingleReturn(true);
    };

    const handleSingleReturnSuccess = () => {
      setShowSingleReturn(false);
      setSelectedInvoiceForReturn(null);
      // Refresh the invoices list
      window.location.reload();
    };


  const handleCustomerSelect = (customer: string) => {
    if (!customer) {
      toast.error("Invalid customer selection");
      return;
    }
    setSelectedCustomer(customer);
    setShowCustomerSelection(false);
    setCustomerSearchQuery("");
    setShowMultiReturn(true);
  };

  const handleMultiReturnSuccess = () => {
    // toast.success(`Created ${returnInvoices.length} return invoices successfully`);
    setShowMultiReturn(false);
    setSelectedCustomer("");
  };

  const handleCloseCustomerSelection = () => {
    setShowCustomerSelection(false);
    setCustomerSearchQuery("");
  };

  // Export functionality
  const handleExportInvoices = () => {
    try {
      if (!filteredInvoices || filteredInvoices.length === 0) {
        toast.error("No invoices to export");
        return;
      }

      // Convert invoices to exportable format
      const exportableInvoices: ExportableInvoice[] = filteredInvoices.map(invoice => {
        // Calculate outstanding amount: grand total - amount paid
        const grandTotal = invoice.totalAmount || 0;
        const amountPaid = invoice.amountPaid || 0;
        const outstandingAmount = Math.max(0, grandTotal - amountPaid);

        return {
          name: invoice.id || invoice.name || '',
          customer: invoice.customer || '',
          posting_date: invoice.date || invoice.posting_date || '',
          due_date: '', // Due date is not available in the current data structure
          grand_total: grandTotal,
          outstanding_amount: outstandingAmount,
          status: invoice.status || '',
          mode_of_payment: invoice.paymentMethod || '',
          currency: invoice.currency || 'SAR',
          company: invoice.company || ''
        };
      });

      // Generate filename based on current filters
      const tabName = activeTab === "all" ? "all" : activeTab.toLowerCase();
      const filename = getExportFilename(`invoices_${tabName}`, 'csv');

      // Export to CSV
      exportInvoicesToCSV(exportableInvoices, filename);

      toast.success(`Exported ${exportableInvoices.length} invoices successfully`);
      //eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error('Export error:', error);
      toast.error(`Failed to export invoices: ${error.message}`);
    }
  };

  // Mobile layout: full-width content and persistent bottom navigation
  if (isMobile) {
    return (
      <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900 font-inconsolata">
        {/* Mobile Header */}
        <div className="sticky top-0 z-20 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
          <div className="px-4 py-3">
            <div className="flex items-center justify-between">
              <h1 className="text-lg font-bold text-gray-900 dark:text-white">Invoice History</h1>
              <div className="flex items-center space-x-2">

                <button
                  onClick={handleExportInvoices}
                  className="flex items-center space-x-2 px-3 py-2 bg-ziditech-600 text-white rounded-lg hover:bg-ziditech-700 transition-colors text-sm"
                >
                  <Download className="w-4 h-4" />
                  <span>Export</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto pb-20 w-[98%] mx-auto px-2 py-4">
          {/* Status Tabs */}
          <div className="mb-6 w-full">
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <div className="border-b border-gray-200 dark:border-gray-700">
                <nav className="-mb-px flex space-x-4 overflow-x-auto">
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center space-x-2 py-2 px-1 border-b-2 font-medium text-xs whitespace-nowrap ${
                        activeTab === tab.id
                          ? "border-ziditech-500 text-ziditech-600 dark:text-ziditech-400"
                          : `border-transparent ${tab.color} dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300`
                      }`}
                    >
                      <tab.icon className="w-4 h-4" />
                      <span>{tab.name}</span>
                      <span className="ml-1 px-1.5 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 rounded-full">
                        {getStatusCount(tab.id)}
                      </span>
                    </button>
                  ))}
                </nav>
              </div>
            </div>
          </div>

          {renderFilters()}
          {renderSummaryCards()}
          {renderInvoicesTable()}
        </div>

        {/* Invoice View Modal */}
        <InvoiceViewModal
          invoice={selectedInvoice}
          isOpen={showInvoiceModal}
          onClose={() => setShowInvoiceModal(false)}
          onRefund={handleRefund}
          onCancel={handleCancel}
        />

        {/* Customer Selection Modal */}
        {showCustomerSelection && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-md max-h-[90vh] flex flex-col">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Select Customer</h2>
                  <button
                    onClick={handleCloseCustomerSelection}
                    className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  >
                    <XCircle className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="p-6 flex-1 overflow-hidden flex flex-col">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Choose a customer to process multi-invoice returns
                </p>

                {/* Search Bar */}
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                  <input
                    type="text"
                    placeholder="Search customers by name or ID..."
                    value={customerSearchQuery}
                    onChange={(e) => setCustomerSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>

                {/* Customer List */}
                <div className="flex-1 overflow-y-auto space-y-2">
                  {filteredCustomers && filteredCustomers.length > 0 ? (
                    filteredCustomers.map((customer) => (
                      <button

                        key={customer.name || customer.customer_name || Math.random()}
                        onClick={() => handleCustomerSelect(customer.name || customer.customer_name)}
                        className="w-full text-left p-3 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                      >
                        <div className="font-medium text-gray-900 dark:text-white">
                          {customer.customer_name || customer.name || 'Unknown Customer'}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          {customer.name || customer.customer_name || 'No ID'}
                        </div>
                      </button>
                    ))
                  ) : customerSearchQuery.trim() ? (
                    <div className="text-center py-8">
                      <div className="text-gray-500 dark:text-gray-400">No customers found matching "{customerSearchQuery}"</div>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <div className="text-gray-500 dark:text-gray-400">No customers found</div>
                    </div>
                  )}
                </div>

                {/* Results Counter */}
                {filteredCustomers && (
                  <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                    <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
                      {customerSearchQuery.trim()
                        ? `${filteredCustomers.length} of ${customers?.length || 0} customers`
                        : `${customers?.length || 0} customers total`
                      }
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Multi-Invoice Return Modal */}
        <MultiInvoiceReturn
          customer={selectedCustomer}
          isOpen={showMultiReturn}
          onClose={() => setShowMultiReturn(false)}
          onSuccess={handleMultiReturnSuccess}
          // @ts-expect-error just ignore
          customers={customers}
        />


        {/* Bottom Navigation */}
        <BottomNavigation />
      </div>
    );
  }



  return (
    <div className="min-h-screen pb-12" style={{ backgroundColor: '#eef1f8' }}>
      <div className="flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
          <div className="px-6 py-4 flex items-center justify-between">
            <h1 className="text-lg font-bold text-gray-900">Invoice History</h1>
            <button
              onClick={handleExportInvoices}
              className="flex items-center space-x-2 px-4 py-2 text-white rounded-xl text-sm font-semibold transition-colors"
              style={{ backgroundColor: '#1e2d6b' }}
            >
              <Download className="w-4 h-4" />
              <span>Export</span>
            </button>
          </div>
        </div>

        <div className="px-6 py-6">
          {/* Status Tabs */}
          <div className="mb-5 w-full">
            <div className="bg-white rounded-xl border border-gray-200 px-5 pt-4 shadow-sm">
              <nav className="-mb-px flex space-x-6 overflow-x-auto">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center space-x-1.5 py-3 px-1 border-b-2 font-medium text-sm whitespace-nowrap transition-colors ${
                      activeTab === tab.id
                        ? "border-[#1e2d6b] text-[#1e2d6b]"
                        : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                    }`}
                  >
                    <tab.icon className="w-4 h-4" />
                    <span>{tab.name}</span>
                    <span className="ml-1 px-1.5 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full">
                      {getStatusCount(tab.id)}
                    </span>
                  </button>
                ))}
              </nav>
            </div>
          </div>

          {renderFilters()}
          {renderSummaryCards()}
          {renderInvoicesTable()}
        </div>

        {/* Invoice View Modal */}
        <InvoiceViewModal
          invoice={selectedInvoice}
          isOpen={showInvoiceModal}
          onClose={() => setShowInvoiceModal(false)}
          onRefund={handleRefund}
          onCancel={handleCancel}
        />

        {/* Customer Selection Modal */}
        {showCustomerSelection && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-md max-h-[90vh] flex flex-col">
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Select Customer</h2>
                  <button
                    onClick={handleCloseCustomerSelection}
                    className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  >
                    <XCircle className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="p-6 flex-1 overflow-hidden flex flex-col">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Choose a customer to process multi-invoice returns
                </p>

                {/* Search Bar */}
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                  <input
                    type="text"
                    placeholder="Search customers by name or ID..."
                    value={customerSearchQuery}
                    onChange={(e) => setCustomerSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>

                {/* Customer List */}
                <div className="flex-1 overflow-y-auto space-y-2">
                  {filteredCustomers && filteredCustomers.length > 0 ? (
                    filteredCustomers.map((customer) => (
                      <button
                        key={customer.name || customer.customer_name || Math.random()}
                        onClick={() => handleCustomerSelect(customer.name || customer.customer_name)}
                        className="w-full text-left p-3 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                      >
                        <div className="font-medium text-gray-900 dark:text-white">
                          {customer.customer_name || customer.name || 'Unknown Customer'}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          {customer.name || customer.customer_name || 'No ID'}
                        </div>
                      </button>
                    ))
                  ) : customerSearchQuery.trim() ? (
                    <div className="text-center py-8">
                      <div className="text-gray-500 dark:text-gray-400">No customers found matching "{customerSearchQuery}"</div>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <div className="text-gray-500 dark:text-gray-400">No customers found</div>
                    </div>
                  )}
                </div>

                {/* Results Counter */}
                {filteredCustomers && (
                  <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                    <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
                      {customerSearchQuery.trim()
                        ? `${filteredCustomers.length} of ${customers?.length || 0} customers`
                        : `${customers?.length || 0} customers total`
                      }
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Multi-Invoice Return Modal */}
        <MultiInvoiceReturn
          customer={selectedCustomer}
          isOpen={showMultiReturn}
          onClose={() => setShowMultiReturn(false)}
          onSuccess={handleMultiReturnSuccess}
          // @ts-expect-error just ignore
          customers={customers}
        />


        {/* Single Invoice Return Modal */}
        <SingleInvoiceReturn
          invoice={selectedInvoiceForReturn}
          isOpen={showSingleReturn}
          onClose={() => setShowSingleReturn(false)}
          onSuccess={handleSingleReturnSuccess}
        />

        {/* Delete Confirmation Dialog */}
        <ConfirmDialog
          isOpen={showDeleteConfirm}
          onClose={handleDeleteCancel}
          onConfirm={handleDeleteConfirm}
          title="Delete Draft Invoice"
          message={`Are you sure you want to delete draft invoice ${invoiceToDelete?.id}? This action cannot be undone.`}
          confirmText="Delete"
          cancelText="Cancel"
          confirmButtonClass="bg-red-600 hover:bg-red-700 text-white"
        />

        {showEditOptions && selectedDraftInvoice && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-xl w-full max-w-md">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Edit Draft Invoice</h2>
                  <p className="text-xs text-gray-500 mt-0.5">{selectedDraftInvoice.id}</p>
                </div>
                <button onClick={handleCloseEditOptions} className="text-gray-400 hover:text-gray-600 transition-colors">
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
              <div className="p-5 space-y-3">
                <button
                  onClick={() => handleGoToCart(selectedDraftInvoice)}
                  className="w-full flex items-center space-x-3 p-4 bg-blue-50 border border-blue-200 rounded-xl hover:bg-blue-100 transition-colors text-left"
                >
                  <ShoppingCart className="w-5 h-5 text-blue-600" />
                  <span className="font-medium text-blue-900">Go to Cart</span>
                </button>
                <button
                  onClick={() => handleSubmitDirect(selectedDraftInvoice)}
                  className="w-full flex items-center space-x-3 p-4 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors text-left"
                  style={{ backgroundColor: '#eef1f8' }}
                >
                  <Check className="w-5 h-5" style={{ color: '#1e2d6b' }} />
                  <span className="font-medium text-gray-800">Submit Invoice</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
