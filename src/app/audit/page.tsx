'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import Sidebar from '@/components/Sidebar';
import ManagerGuard from '@/components/ManagerGuard';
import { useBranch } from '@/context/BranchContext';

interface AuditLog {
  id: string;
  created_at: string;
  branch_id: string | null;
  staff_id: string | null;
  action_type: string;
  severity: 'INFO' | 'WARN' | 'CRITICAL';
  entity_name: string | null;
  entity_id: string | null;
  summary: string;
  details: Record<string, any>;
  branch?: {
    id: string;
    name: string;
    code: string;
  } | null;
  staff?: {
    id: string;
    name: string;
    role: string;
  } | null;
}

type DatePreset = 'TODAY' | 'YESTERDAY' | '7_DAYS' | 'THIS_MONTH' | 'CUSTOM' | 'ALL';

export default function AuditPage() {
  const supabase = createClient();
  const { branches, currentBranch } = useBranch();

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [selectedBranchId, setSelectedBranchId] = useState<string>('ALL');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [datePreset, setDatePreset] = useState<DatePreset>('TODAY');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [rowsPerPage, setRowsPerPage] = useState<number>(15);

  // Payload Inspector Modal
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  // Sync initial branch filter with active branch context
  useEffect(() => {
    if (currentBranch && selectedBranchId === 'ALL') {
      setSelectedBranchId(currentBranch.id);
    }
  }, [currentBranch]);

  // Fetch Audit Logs
  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('audit_logs')
        .select(`
          id,
          created_at,
          branch_id,
          staff_id,
          action_type,
          severity,
          entity_name,
          entity_id,
          summary,
          details,
          branch:branches(id, name, code),
          staff:staff_members(id, name, role)
        `)
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;
      setLogs((data as any) || []);
    } catch (err: any) {
      console.error('Error loading audit log:', err.message);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  // Realtime Live Stream Listener
  useEffect(() => {
    fetchLogs();

    const channel = supabase
      .channel(`realtime:audit-logs-${Math.random()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'audit_logs' }, () => {
        fetchLogs();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchLogs, supabase]);

  // Filtered Logs
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // 1. Branch Filter
      if (selectedBranchId !== 'ALL' && log.branch_id !== selectedBranchId) {
        return false;
      }

      // 2. Severity Filter
      if (selectedSeverity !== 'ALL' && log.severity !== selectedSeverity) {
        return false;
      }

      // 3. Category Filter
      if (selectedCategory !== 'ALL') {
        if (selectedCategory === 'SALES' && !log.action_type.includes('SALE') && !log.action_type.includes('VOID')) {
          return false;
        }
        if (selectedCategory === 'PRICE' && !log.action_type.includes('PRICE') && !log.action_type.includes('MENU')) {
          return false;
        }
        if (
          selectedCategory === 'TILL' &&
          !log.action_type.includes('TILL') &&
          !log.action_type.includes('FLOAT') &&
          !log.action_type.includes('SHIFT')
        ) {
          return false;
        }
        if (
          selectedCategory === 'SECURITY' &&
          !log.action_type.includes('LOCK') &&
          !log.action_type.includes('OVERRIDE') &&
          !log.action_type.includes('AUTH')
        ) {
          return false;
        }
      }

      // 4. Date Filter & Custom Calendar Selection
      const logDate = new Date(log.created_at);
      const now = new Date();

      if (datePreset === 'TODAY') {
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        if (logDate < startOfToday) return false;
      } else if (datePreset === 'YESTERDAY') {
        const startOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        const endOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, -1);
        if (logDate < startOfYesterday || logDate > endOfYesterday) return false;
      } else if (datePreset === '7_DAYS') {
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        if (logDate < sevenDaysAgo) return false;
      } else if (datePreset === 'THIS_MONTH') {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        if (logDate < startOfMonth) return false;
      } else if (datePreset === 'CUSTOM') {
        if (customStartDate) {
          const start = new Date(`${customStartDate}T00:00:00`);
          if (logDate < start) return false;
        }
        if (customEndDate) {
          const end = new Date(`${customEndDate}T23:59:59.999`);
          if (logDate > end) return false;
        }
      }

      // 5. Keyword Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchSummary = log.summary.toLowerCase().includes(q);
        const matchAction = log.action_type.toLowerCase().includes(q);
        const matchStaff = log.staff?.name.toLowerCase().includes(q);
        const matchBranch = log.branch?.name.toLowerCase().includes(q);
        const matchEntity = log.entity_name?.toLowerCase().includes(q);

        if (!matchSummary && !matchAction && !matchStaff && !matchBranch && !matchEntity) {
          return false;
        }
      }

      return true;
    });
  }, [logs, selectedBranchId, selectedSeverity, selectedCategory, datePreset, customStartDate, customEndDate, searchQuery]);

  // Reset pagination to first page whenever any filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedBranchId, selectedSeverity, selectedCategory, datePreset, customStartDate, customEndDate, searchQuery, rowsPerPage]);

  // Pagination Slice
  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / rowsPerPage));
  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredLogs.slice(start, start + rowsPerPage);
  }, [filteredLogs, currentPage, rowsPerPage]);

  // Metrics
  const metrics = useMemo(() => {
    const criticalCount = filteredLogs.filter((l) => l.severity === 'CRITICAL').length;
    const warningCount = filteredLogs.filter((l) => l.severity === 'WARN').length;
    const overridesCount = filteredLogs.filter(
      (l) => l.action_type.includes('OVERRIDE') || l.action_type.includes('VOID')
    ).length;

    return {
      total: filteredLogs.length,
      criticalCount,
      warningCount,
      overridesCount,
    };
  }, [filteredLogs]);

  // Severity styling helper
  const getSeverityBadge = (severity: AuditLog['severity']) => {
    switch (severity) {
      case 'CRITICAL':
        return 'bg-rose-950/80 text-rose-400 border-rose-800/80 animate-pulse';
      case 'WARN':
        return 'bg-amber-950/80 text-amber-400 border-amber-800/80';
      case 'INFO':
      default:
        return 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60';
    }
  };

  return (
    <ManagerGuard
      pageTitle="Unified System Audit Ledger"
      description="Viewing security audit logs, price alteration histories, manager overrides, and cash drawer activities requires Manager authorization."
    >
      <div className="flex h-screen bg-neutral-950 font-sans text-neutral-100 overflow-hidden">
        <div className="h-full flex-shrink-0">
          <Sidebar />
        </div>

        <main className="flex-1 flex flex-col overflow-y-auto p-8 space-y-6 bg-neutral-950 pb-16">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-800 pb-5 flex-shrink-0">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-black tracking-wider text-rose-400 bg-rose-950/60 border border-rose-800/50 px-2 py-0.5 rounded-md">
                  Security & Compliance
                </span>
                <span className="text-xs text-neutral-400 font-mono">Immutable Log</span>
              </div>
              <h1 className="text-2xl font-black text-white tracking-tight mt-1">
                Unified System Audit Ledger
              </h1>
              <p className="text-xs text-neutral-400 mt-0.5">
                Chronological event stream tracking manager overrides, price adjustments, voids, and cash reconciliations across all locations.
              </p>
            </div>

            <div className="flex items-center gap-2.5">
              <span className="flex items-center gap-1.5 text-xs text-emerald-400 bg-neutral-900 border border-neutral-800 px-3 py-1.5 rounded-xl font-mono">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                Live Stream Active
              </span>
              <button
                onClick={() => fetchLogs()}
                className="bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 hover:text-white px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                ↻ Refresh
              </button>
            </div>
          </div>

          {/* 4 Metric Cards */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 flex-shrink-0">
            <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-5 flex flex-col justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 mb-1">
                Filtered Events
              </span>
              <p className="font-mono text-3xl font-black text-white">{metrics.total}</p>
              <span className="text-[11px] text-neutral-500 mt-2">Matching query criteria</span>
            </div>

            <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-5 flex flex-col justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-rose-400 mb-1">
                Critical Alerts
              </span>
              <p className="font-mono text-3xl font-black text-rose-400">{metrics.criticalCount}</p>
              <span className="text-[11px] text-neutral-500 mt-2">Requires immediate attention</span>
            </div>

            <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-5 flex flex-col justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400 mb-1">
                Warning Events
              </span>
              <p className="font-mono text-3xl font-black text-amber-400">{metrics.warningCount}</p>
              <span className="text-[11px] text-neutral-500 mt-2">Price changes & variances</span>
            </div>

            <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-5 flex flex-col justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 mb-1">
                Manager Overrides & Voids
              </span>
              <p className="font-mono text-3xl font-black text-emerald-400">{metrics.overridesCount}</p>
              <span className="text-[11px] text-neutral-500 mt-2">PIN-authorized actions</span>
            </div>
          </section>

          {/* Multi-Filter Bar with Custom Date Range */}
          <div className="bg-neutral-900/40 border border-neutral-800 rounded-2xl p-4 space-y-3 flex-shrink-0">
            {/* Top Row: Date Presets & Custom Calendar Picker */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800/60 pb-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-bold text-neutral-400 mr-2 flex items-center gap-1">
                  <span>📅</span> Date:
                </span>
                {(
                  [
                    { id: 'TODAY', label: 'Today' },
                    { id: 'YESTERDAY', label: 'Yesterday' },
                    { id: '7_DAYS', label: 'Past 7 Days' },
                    { id: 'THIS_MONTH', label: 'This Month' },
                    { id: 'CUSTOM', label: 'Custom Range' },
                    { id: 'ALL', label: 'All History' },
                  ] as const
                ).map((d) => (
                  <button
                    key={d.id}
                    onClick={() => setDatePreset(d.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border ${
                      datePreset === d.id
                        ? 'bg-emerald-500 text-neutral-950 border-emerald-400 shadow-sm'
                        : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:text-white hover:bg-neutral-900'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>

              {/* Custom Date Inputs (Displayed when CUSTOM is selected) */}
              {datePreset === 'CUSTOM' && (
                <div className="flex items-center gap-2 text-xs bg-neutral-950 border border-neutral-800 p-1.5 rounded-xl">
                  <div className="flex items-center gap-1.5">
                    <span className="text-neutral-500 text-[10px] uppercase font-mono">From:</span>
                    <input
                      type="date"
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                      className="bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <span className="text-neutral-600">—</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-neutral-500 text-[10px] uppercase font-mono">To:</span>
                    <input
                      type="date"
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                      className="bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              )}

              {/* Severity Quick Pills */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-neutral-400 mr-1">Severity:</span>
                {(['ALL', 'CRITICAL', 'WARN', 'INFO'] as const).map((sev) => (
                  <button
                    key={sev}
                    onClick={() => setSelectedSeverity(sev)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer border ${
                      selectedSeverity === sev
                        ? sev === 'CRITICAL'
                          ? 'bg-rose-500 text-white border-rose-400 shadow'
                          : sev === 'WARN'
                          ? 'bg-amber-500 text-neutral-950 border-amber-400 shadow'
                          : 'bg-emerald-500 text-neutral-950 border-emerald-400 shadow'
                        : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:text-white'
                    }`}
                  >
                    {sev}
                  </button>
                ))}
              </div>
            </div>

            {/* Bottom Row: Branch, Category, and Search Query */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {/* Branch Selector */}
                <select
                  value={selectedBranchId}
                  onChange={(e) => setSelectedBranchId(e.target.value)}
                  className="bg-neutral-950 border border-neutral-800 text-xs text-neutral-300 rounded-xl px-3 py-2 focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                  <option value="ALL">All Branches</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.code})
                    </option>
                  ))}
                </select>

                {/* Category Selector */}
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="bg-neutral-950 border border-neutral-800 text-xs text-neutral-300 rounded-xl px-3 py-2 focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                  <option value="ALL">All Categories</option>
                  <option value="SALES">Sales & Voids</option>
                  <option value="PRICE">Menu & Pricing Overrides</option>
                  <option value="TILL">Till & Shift Reconciliations</option>
                  <option value="SECURITY">Security & Terminal Locks</option>
                </select>
              </div>

              {/* Keyword Search */}
              <div className="w-full sm:w-80">
                <input
                  type="text"
                  placeholder="Search summary, staff, action or entity..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* Audit Event Table Container (Scrollable with Pagination) */}
          <div className="bg-neutral-900/40 border border-neutral-800 rounded-2xl overflow-hidden backdrop-blur-sm shadow-xl flex flex-col">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[850px]">
                <thead className="border-b border-neutral-800 bg-neutral-900/90 text-neutral-400 font-medium">
                  <tr>
                    <th className="py-3.5 px-5">Timestamp</th>
                    <th className="py-3.5 px-5">Severity</th>
                    <th className="py-3.5 px-5">Branch</th>
                    <th className="py-3.5 px-5">Staff / Actor</th>
                    <th className="py-3.5 px-5">Action Type</th>
                    <th className="py-3.5 px-5">Summary Description</th>
                    <th className="py-3.5 px-5 text-right">Payload</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/60 font-mono">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="py-16 text-center text-neutral-500 font-sans">
                        Loading audit events...
                      </td>
                    </tr>
                  ) : paginatedLogs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-16 text-center text-neutral-500 font-sans">
                        No audit events found matching your date or search filters.
                      </td>
                    </tr>
                  ) : (
                    paginatedLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-neutral-800/30 transition-colors">
                        {/* Timestamp */}
                        <td className="py-3.5 px-5 text-neutral-400 whitespace-nowrap">
                          {new Date(log.created_at).toLocaleString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </td>

                        {/* Severity */}
                        <td className="py-3.5 px-5 whitespace-nowrap">
                          <span
                            className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${getSeverityBadge(
                              log.severity
                            )}`}
                          >
                            {log.severity}
                          </span>
                        </td>

                        {/* Branch */}
                        <td className="py-3.5 px-5 text-neutral-300 font-sans whitespace-nowrap">
                          {log.branch ? (
                            <span className="font-bold text-white">{log.branch.code}</span>
                          ) : (
                            <span className="text-neutral-500">System</span>
                          )}
                        </td>

                        {/* Staff */}
                        <td className="py-3.5 px-5 text-neutral-300 font-sans whitespace-nowrap">
                          {log.staff ? (
                            <div>
                              <span className="font-bold text-white block">{log.staff.name}</span>
                              <span className="text-[10px] text-neutral-500 uppercase">{log.staff.role}</span>
                            </div>
                          ) : (
                            <span className="text-neutral-500">Automated</span>
                          )}
                        </td>

                        {/* Action Type */}
                        <td className="py-3.5 px-5 text-emerald-400 font-bold whitespace-nowrap">
                          {log.action_type}
                        </td>

                        {/* Summary */}
                        <td className="py-3.5 px-5 text-neutral-200 font-sans max-w-md break-words">
                          {log.summary}
                        </td>

                        {/* Payload Inspector Button */}
                        <td className="py-3.5 px-5 text-right font-sans whitespace-nowrap">
                          <button
                            onClick={() => setSelectedLog(log)}
                            className="bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white px-2.5 py-1 rounded-lg border border-neutral-800 text-[11px] transition cursor-pointer"
                          >
                            Inspect 🔍
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls Bar */}
            <div className="p-4 border-t border-neutral-800 bg-neutral-950/80 flex flex-col sm:flex-row items-center justify-between gap-4 font-sans text-xs">
              <div className="flex items-center gap-3 text-neutral-400">
                <span>
                  Showing{' '}
                  <strong className="text-white">
                    {filteredLogs.length === 0 ? 0 : (currentPage - 1) * rowsPerPage + 1}
                  </strong>{' '}
                  to{' '}
                  <strong className="text-white">
                    {Math.min(currentPage * rowsPerPage, filteredLogs.length)}
                  </strong>{' '}
                  of <strong className="text-white">{filteredLogs.length}</strong> events
                </span>

                <span className="text-neutral-700">|</span>

                <div className="flex items-center gap-1.5">
                  <span className="text-[11px]">Rows:</span>
                  <select
                    value={rowsPerPage}
                    onChange={(e) => setRowsPerPage(Number(e.target.value))}
                    className="bg-neutral-900 border border-neutral-800 text-neutral-300 rounded-lg px-2 py-1 focus:outline-none focus:border-emerald-500 cursor-pointer text-xs"
                  >
                    <option value={10}>10</option>
                    <option value={15}>15</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
              </div>

              {/* Navigation Buttons */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1.5 rounded-xl border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed text-neutral-300 hover:text-white transition cursor-pointer"
                >
                  ← Prev
                </button>

                <div className="flex items-center gap-1 px-2 font-mono">
                  <span className="text-white font-bold">{currentPage}</span>
                  <span className="text-neutral-500">/</span>
                  <span className="text-neutral-500">{totalPages}</span>
                </div>

                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="px-3 py-1.5 rounded-xl border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed text-neutral-300 hover:text-white transition cursor-pointer"
                >
                  Next →
                </button>
              </div>
            </div>
          </div>

          {/* MODAL: PAYLOAD & METADATA INSPECTOR */}
          {selectedLog && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
              <div className="bg-neutral-900 border border-neutral-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
                <div className="flex justify-between items-start border-b border-neutral-800 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${getSeverityBadge(
                          selectedLog.severity
                        )}`}
                      >
                        {selectedLog.severity}
                      </span>
                      <span className="text-xs text-neutral-400 font-mono">
                        ID: #{selectedLog.id.slice(0, 8)}
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-white mt-1">{selectedLog.action_type}</h3>
                  </div>

                  <button
                    onClick={() => setSelectedLog(null)}
                    className="text-neutral-400 hover:text-white text-sm font-bold cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-800 space-y-1">
                    <p className="text-neutral-400">
                      <strong className="text-white">Summary:</strong> {selectedLog.summary}
                    </p>
                    <p className="text-neutral-400">
                      <strong className="text-white">Timestamp:</strong>{' '}
                      {new Date(selectedLog.created_at).toLocaleString()}
                    </p>
                    <p className="text-neutral-400">
                      <strong className="text-white">Branch:</strong>{' '}
                      {selectedLog.branch ? `${selectedLog.branch.name} (${selectedLog.branch.code})` : 'Global / All'}
                    </p>
                    <p className="text-neutral-400">
                      <strong className="text-white">Staff Actor:</strong>{' '}
                      {selectedLog.staff ? `${selectedLog.staff.name} (${selectedLog.staff.role})` : 'System Engine'}
                    </p>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold uppercase text-neutral-400 tracking-wider block mb-1.5">
                      Structured Payload & Diff:
                    </span>
                    <pre className="p-3.5 bg-neutral-950 border border-neutral-800 rounded-xl text-emerald-400 font-mono text-[11px] overflow-x-auto max-h-60">
                      {JSON.stringify(selectedLog.details, null, 2)}
                    </pre>
                  </div>
                </div>

                <div className="flex justify-end pt-2 border-t border-neutral-800">
                  <button
                    onClick={() => setSelectedLog(null)}
                    className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl text-xs font-semibold cursor-pointer"
                  >
                    Close Inspector
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </ManagerGuard>
  );
}