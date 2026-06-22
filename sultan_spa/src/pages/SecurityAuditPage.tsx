import React, { useState, useEffect } from "react";
import { dbGet, dbSet, APP_CACHE_STORE } from "../services/offlineDB";
import type { SecurityIncident } from "../utils/securityIncidents";
import { 
  ShieldAlert, 
  Trash2, 
  Search, 
  AlertTriangle, 
  Terminal, 
  Database,
  Calendar,
  User,
  RefreshCw,
  FileText
} from "lucide-react";

export default function SecurityAuditPage() {
  const [incidents, setIncidents] = useState<SecurityIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("All");

  const loadIncidents = async () => {
    setLoading(true);
    try {
      const logs = await dbGet<SecurityIncident[]>(APP_CACHE_STORE, "security_incidents_log") || [];
      setIncidents(logs);
    } catch (e) {
      console.error("Failed to load security incidents:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadIncidents();
  }, []);

  const handleClearLogs = async () => {
    if (window.confirm("Are you sure you want to clear all security incident logs? This action is irreversible.")) {
      try {
        await dbSet(APP_CACHE_STORE, "security_incidents_log", []);
        setIncidents([]);
      } catch (e) {
        console.error("Failed to clear logs:", e);
      }
    }
  };

  // Filter incidents based on search term and type selection
  const filteredIncidents = incidents.filter(inc => {
    const matchesSearch = 
      inc.cashier.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inc.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inc.id.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesType = typeFilter === "All" || inc.type === typeFilter;
    
    return matchesSearch && matchesType;
  });

  // Calculate statistics
  const totalCount = incidents.length;
  const consoleCount = incidents.filter(i => i.type === "Console Opened").length;
  const dbCount = incidents.filter(i => i.type === "Database Tampered").length;
  const unauthorizedCount = incidents.filter(i => i.type === "Unauthorized Access").length;

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-[#1e2d6b] flex items-center gap-3">
            <ShieldAlert className="w-8 h-8 text-red-500 animate-pulse" />
            Security Audit Log
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Silently record and analyze local security violations, developer tools access, and database tampering attempts.
          </p>
        </div>
        
        <div className="flex gap-3">
          <button
            onClick={loadIncidents}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors text-sm font-semibold text-gray-700 shadow-sm"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          
          {incidents.length > 0 && (
            <button
              onClick={handleClearLogs}
              className="flex items-center gap-2 px-4 py-2.5 bg-red-50 hover:bg-red-100 transition-colors text-sm font-semibold text-red-600 border border-red-200 rounded-xl shadow-sm"
            >
              <Trash2 className="w-4 h-4" />
              Clear Audit Log
            </button>
          )}
        </div>
      </div>

      {/* Metrics Dashboard */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Card */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Total Incidents</span>
            <h3 className="text-3xl font-black text-gray-900 mt-1">{totalCount}</h3>
          </div>
          <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl">
            <FileText className="w-6 h-6" />
          </div>
        </div>

        {/* Console Card */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">DevTools Openings</span>
            <h3 className="text-3xl font-black text-amber-600 mt-1">{consoleCount}</h3>
          </div>
          <div className="p-4 bg-amber-50 text-amber-600 rounded-2xl">
            <Terminal className="w-6 h-6" />
          </div>
        </div>

        {/* Database Tampering Card */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">IndexedDB Tampering</span>
            <h3 className="text-3xl font-black text-red-600 mt-1">{dbCount}</h3>
          </div>
          <div className="p-4 bg-red-50 text-red-600 rounded-2xl">
            <Database className="w-6 h-6" />
          </div>
        </div>

        {/* Unauthorized Access Card */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Unauthorized Access</span>
            <h3 className="text-3xl font-black text-purple-600 mt-1">{unauthorizedCount}</h3>
          </div>
          <div className="p-4 bg-purple-50 text-purple-600 rounded-2xl">
            <ShieldAlert className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Filter and Search Controls */}
      <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex flex-col md:flex-row gap-4">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by Cashier or Incident description..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1e2d6b] transition-all text-sm text-gray-700"
          />
        </div>

        {/* Type Filter */}
        <div className="flex gap-1.5 bg-gray-50 p-1 rounded-xl self-start md:self-auto">
          {["All", "Console Opened", "Database Tampered", "Unauthorized Access"].map((type) => (
            <button
              key={type}
              onClick={() => setTypeFilter(type)}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                typeFilter === type
                  ? "bg-white text-[#1e2d6b] shadow-sm"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              {type === "All" ? "All Logs" : type}
            </button>
          ))}
        </div>
      </div>

      {/* Log List */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#1e2d6b]"></div>
            <p className="text-gray-400 text-sm mt-4">Loading security logs...</p>
          </div>
        ) : filteredIncidents.length === 0 ? (
          <div className="text-center py-20 px-6">
            <div className="w-16 h-16 bg-green-50 text-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h3 className="text-lg font-black text-gray-800">No Incidents Logged</h3>
            <p className="text-gray-400 text-sm mt-1 max-w-sm mx-auto">
              System cache validation is intact and no Developer Tools activity was detected.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-6 py-4 text-xs font-black text-gray-400 uppercase tracking-widest">Type</th>
                  <th className="px-6 py-4 text-xs font-black text-gray-400 uppercase tracking-widest">Date & Time</th>
                  <th className="px-6 py-4 text-xs font-black text-gray-400 uppercase tracking-widest">Cashier</th>
                  <th className="px-6 py-4 text-xs font-black text-gray-400 uppercase tracking-widest">Details</th>
                  <th className="px-6 py-4 text-xs font-black text-gray-400 uppercase tracking-widest text-right">Log ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredIncidents.map((inc) => {
                  const getTypeStyles = (type: string) => {
                    switch (type) {
                      case "Database Tampered":
                        return { bg: "bg-red-50 text-red-700 border-red-100", icon: <Database className="w-3.5 h-3.5" /> };
                      case "Unauthorized Access":
                        return { bg: "bg-purple-50 text-purple-700 border-purple-100", icon: <ShieldAlert className="w-3.5 h-3.5" /> };
                      default: // Console Opened
                        return { bg: "bg-amber-50 text-amber-700 border-amber-100", icon: <Terminal className="w-3.5 h-3.5" /> };
                    }
                  };
                  const styles = getTypeStyles(inc.type);
                  return (
                    <tr key={inc.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4.5 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${styles.bg}`}>
                          {styles.icon}
                          {inc.type}
                        </span>
                      </td>
                      <td className="px-6 py-4.5 whitespace-nowrap text-sm text-gray-600 font-medium">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          {formatDate(inc.timestamp)}
                        </div>
                      </td>
                      <td className="px-6 py-4.5 whitespace-nowrap text-sm text-gray-700 font-bold">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-gray-400" />
                          {inc.cashier}
                        </div>
                      </td>
                      <td className="px-6 py-4.5 text-sm text-gray-600 font-medium">
                        <div className="flex items-center gap-2 text-gray-800">
                          <AlertTriangle className={`w-4 h-4 ${
                            inc.type === "Database Tampered" ? "text-red-500" :
                            inc.type === "Unauthorized Access" ? "text-purple-500" : "text-amber-500"
                          }`} />
                          {inc.details}
                        </div>
                      </td>
                      <td className="px-6 py-4.5 whitespace-nowrap text-right text-xs font-mono text-gray-400">
                        {inc.id}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
