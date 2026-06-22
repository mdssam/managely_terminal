import React, { useState, useEffect } from "react";
import { useFrappeGetCall } from "frappe-react-sdk";
import { Store, User, Clock, CheckCircle2, XCircle, Search, Filter, ChevronLeft, ChevronRight, ChevronDown, ChevronRight as ChevronRightIcon, Eye } from "lucide-react";
import ShiftClosureReceipt from "../components/ShiftClosureReceipt";
import type { ShiftReceiptData } from "../components/ShiftClosureReceipt";

interface ClosingDetail {
  mode_of_payment: string;
  expected_amount: number;
  closing_amount: number;
  difference: number;
}

interface BranchSession {
  name: string;
  pos_profile: string;
  user?: string;
  owner?: string;
  custom_employee_name?: string;
  status: string;
  opening_amount?: number;
  period_start_date: string;
  period_end_date?: string;
  closing_details?: ClosingDetail[];
  grand_total?: number;
  total_quantity?: number;
}

export default function BranchSessionsPage() {
  const [sessions, setSessions] = useState<BranchSession[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Filters & Pagination State
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;
  
  // Expandable Row & Receipt State
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<ShiftReceiptData | null>(null);

  const { data, isLoading, error: apiError } = useFrappeGetCall<{ message: BranchSession[] }>("sultan.sultan.api.pos_entry.get_branch_sessions");

  useEffect(() => {
    if (data?.message) {
      setSessions(data.message);
    }
    if (apiError) {
      setError(apiError.message || "Failed to load branch sessions");
    }
  }, [data, apiError]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter]);

  // Apply Filters
  const filteredSessions = sessions.filter((s) => {
    const searchString = searchTerm.toLowerCase();
    const cashier = (s.custom_employee_name || s.user || s.owner || "Unknown User").toLowerCase();
    const matchesSearch =
      s.name.toLowerCase().includes(searchString) ||
      cashier.includes(searchString) ||
      s.pos_profile.toLowerCase().includes(searchString);

    const matchesStatus = statusFilter === "All" || s.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // Pagination Logic
  const totalPages = Math.max(1, Math.ceil(filteredSessions.length / itemsPerPage));
  const paginatedSessions = filteredSessions.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const toggleRow = (sessionName: string) => {
    setExpandedRow(expandedRow === sessionName ? null : sessionName);
  };

  const handleShowReceipt = (e: React.MouseEvent, session: BranchSession) => {
    e.stopPropagation(); // prevent row toggle
    const receiptData: ShiftReceiptData = {
      posProfile: session.pos_profile,
      cashierName: session.custom_employee_name || session.user || session.owner || "Unknown User",
      openingDate: new Date(session.period_start_date).toLocaleString(),
      closingDate: session.period_end_date ? new Date(session.period_end_date).toLocaleString() : "-",
      currency: "SAR", // Adjust currency if needed dynamically
      totalSales: session.grand_total || 0,
      totalQuantity: session.total_quantity || 0,
      paymentBreakdown: (session.closing_details || []).map(d => ({
        mode: d.mode_of_payment,
        openingAmount: 0, // Usually fetched separately if needed, fallback to 0
        salesAmount: d.expected_amount, 
        closingAmount: d.closing_amount,
        difference: d.difference
      })),
      cashTransactions: [], // Empty for now, but satisfies the UI
      cashSummary: { cash_in: 0, cash_out: 0, net: 0 }
    };
    setSelectedReceipt(receiptData);
  };

  return (
    <div className="flex-1 bg-gray-50 h-screen overflow-y-auto p-4 lg:p-8 ml-0">
      <div className="w-full space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Store className="text-ziditech-600" />
              Session Management
            </h1>
            <p className="text-gray-500 mt-1">View all POS sessions within your branch</p>
          </div>

          {/* Filters Section */}
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search size={16} className="text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="Search by ID, Cashier or Branch..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ziditech-500 focus:border-transparent w-full sm:w-64"
              />
            </div>
            <div className="relative flex-shrink-0">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Filter size={16} className="text-gray-400" />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="pl-9 pr-8 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ziditech-500 focus:border-transparent appearance-none bg-white cursor-pointer"
              >
                <option value="All">All Statuses</option>
                <option value="Open">Open</option>
                <option value="Closed">Closed</option>
              </select>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
            <XCircle size={20} />
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ziditech-600"></div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-sm font-semibold text-gray-600">
                    <th className="p-4 w-10"></th>
                    <th className="p-4 whitespace-nowrap">Branch</th>
                    <th className="p-4 whitespace-nowrap">Session ID</th>
                    <th className="p-4 whitespace-nowrap">Employee</th>
                    <th className="p-4 whitespace-nowrap">Status</th>
                    <th className="p-4 whitespace-nowrap">Started At</th>
                    <th className="p-4 whitespace-nowrap">Closed At</th>
                    <th className="p-4 whitespace-nowrap text-right">Opening Amount</th>
                    <th className="p-4 whitespace-nowrap text-center">Receipt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-sm">
                  {paginatedSessions.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-gray-500">
                        {sessions.length === 0 ? "No sessions found for this branch." : "No sessions match your search/filter criteria."}
                      </td>
                    </tr>
                  ) : (
                    paginatedSessions.map((session) => (
                      <React.Fragment key={session.name}>
                        <tr 
                          onClick={() => toggleRow(session.name)} 
                          className="hover:bg-gray-50 transition-colors cursor-pointer group"
                        >
                          <td className="p-4 text-gray-400 group-hover:text-gray-600 transition-colors">
                            {expandedRow === session.name ? <ChevronDown size={18} /> : <ChevronRightIcon size={18} />}
                          </td>
                          <td className="p-4 font-medium text-blue-600">{session.pos_profile}</td>
                          <td className="p-4 font-medium text-gray-900">{session.name}</td>
                          <td className="p-4">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                                <User size={16} />
                              </div>
                              <span className="font-medium text-gray-900">{session.custom_employee_name || session.user || session.owner || 'Unknown User'}</span>
                            </div>
                          </td>
                          <td className="p-4">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                              session.status === "Open" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"
                            }`}>
                              {session.status === "Open" ? <CheckCircle2 size={14} /> : <Clock size={14} />}
                              {session.status}
                            </span>
                          </td>
                          <td className="p-4 text-gray-600">{session.period_start_date ? new Date(session.period_start_date).toLocaleString() : 'N/A'}</td>
                          <td className="p-4 text-gray-600">{session.period_end_date ? new Date(session.period_end_date).toLocaleString() : '-'}</td>
                          <td className="p-4 text-gray-900 font-medium text-right">{(session.opening_amount || 0).toFixed(2)}</td>
                          <td className="p-4 text-center">
                            {session.status === "Closed" && session.closing_details && session.closing_details.length > 0 ? (
                              <button 
                                onClick={(e) => handleShowReceipt(e, session)}
                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="View Receipt"
                              >
                                <Eye size={18} />
                              </button>
                            ) : (
                              <span className="text-gray-300">-</span>
                            )}
                          </td>
                        </tr>
                        
                        {/* Expanded Details Row */}
                        {expandedRow === session.name && (
                          <tr className="bg-gray-50/50 border-b border-gray-100">
                            <td colSpan={9} className="p-0">
                              <div className="px-16 py-4 overflow-hidden animate-in slide-in-from-top-2 duration-200">
                                {session.closing_details && session.closing_details.length > 0 ? (
                                  <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
                                    <table className="w-full text-left text-sm">
                                      <thead>
                                        <tr className="bg-gray-50 border-b border-gray-100 text-gray-600 font-medium">
                                          <th className="px-6 py-3">Mode of Payment</th>
                                          <th className="px-6 py-3 text-right">Expected Amount</th>
                                          <th className="px-6 py-3 text-right">Closing Amount</th>
                                          <th className="px-6 py-3 text-right">Difference</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-50">
                                        {session.closing_details.map((detail, idx) => (
                                          <tr key={idx} className="hover:bg-gray-50">
                                            <td className="px-6 py-3 font-medium text-gray-800">{detail.mode_of_payment}</td>
                                            <td className="px-6 py-3 text-right text-gray-600">{(detail.expected_amount || 0).toFixed(2)}</td>
                                            <td className="px-6 py-3 text-right font-medium text-gray-900">{(detail.closing_amount || 0).toFixed(2)}</td>
                                            <td className={`px-6 py-3 text-right font-medium ${
                                              detail.difference < 0 ? 'text-red-600' : detail.difference > 0 ? 'text-green-600' : 'text-gray-500'
                                            }`}>
                                              {detail.difference > 0 ? '+' : ''}{(detail.difference || 0).toFixed(2)}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                ) : (
                                  <div className="text-gray-500 italic py-2 text-sm flex items-center gap-2">
                                    <Clock size={14} />
                                    No closing details available for this session yet.
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="p-4 border-t border-gray-100 flex items-center justify-between bg-gray-50 mt-auto">
              <span className="text-sm text-gray-600">
                Showing <span className="font-medium">{filteredSessions.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0}</span> to <span className="font-medium">{Math.min(currentPage * itemsPerPage, filteredSessions.length)}</span> of <span className="font-medium">{filteredSessions.length}</span> results
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="p-1 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={20} />
                </button>
                <span className="text-sm font-medium text-gray-700 px-2">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="p-1 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Shift Closure Receipt Modal */}
      {selectedReceipt && (
        <ShiftClosureReceipt 
          data={selectedReceipt} 
          onClose={() => setSelectedReceipt(null)} 
        />
      )}
    </div>
  );
}
