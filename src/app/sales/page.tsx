'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import Sidebar from '@/components/Sidebar';

interface SaleItem {
  id: string;
  sale_id: string;
  product_id: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

interface Sale {
  id: string;
  total_amount: number;
  payment_method: string;
  amount_tendered: number;
  change_due: number;
  status: 'COMPLETED' | 'VOIDED';
  void_reason: string | null;
  voided_at: string | null;
  created_at: string;
  items?: SaleItem[];
}

export default function SalesHistoryPage() {
  const supabase = createClient();

  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<'today' | 'yesterday' | 'week' | 'all'>('today');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'COMPLETED' | 'VOIDED'>('ALL');
  const [tenderFilter, setTenderFilter] = useState<'ALL' | 'cash' | 'card' | 'qr' | 'transfer'>('ALL');

  // Receipt Modal State
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);

  // Void Confirmation Modal State
  const [voidSaleTarget, setVoidSaleTarget] = useState<Sale | null>(null);
  const [voidReason, setVoidReason] = useState('Customer canceled order');
  const [isVoiding, setIsVoiding] = useState(false);
  const [voidError, setVoidError] = useState<string | null>(null);

  // Fetch sales records with child items
  const fetchSales = useCallback(async () => {
    try {
      setLoading(true);

      let query = supabase
        .from('sales')
        .select(`
          id,
          total_amount,
          payment_method,
          amount_tendered,
          change_due,
          status,
          void_reason,
          voided_at,
          created_at,
          items:sale_items (
            id,
            sale_id,
            product_id,
            item_name,
            quantity,
            unit_price,
            subtotal
          )
        `)
        .order('created_at', { ascending: false });

      // Apply date bounds
      const now = new Date();
      if (dateFilter === 'today') {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        query = query.gte('created_at', start);
      } else if (dateFilter === 'yesterday') {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        query = query.gte('created_at', start.toISOString()).lt('created_at', end.toISOString());
      } else if (dateFilter === 'week') {
        const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        query = query.gte('created_at', start);
      }

      const { data, error } = await query;
      if (error) throw error;

      setSales((data as any) || []);
    } catch (err: any) {
      console.error('Error fetching sales:', err.message);
    } finally {
      setLoading(false);
    }
  }, [dateFilter, supabase]);

  useEffect(() => {
    fetchSales();

    // Supabase Realtime listener for incoming sales or voids
    const channel = supabase
      .channel(`realtime:sales-history-${Math.random()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, () => {
        fetchSales();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchSales, supabase]);

  // Filtered dataset
  const filteredSales = useMemo(() => {
    return sales.filter((s) => {
      // Status filter
      if (statusFilter !== 'ALL' && s.status !== statusFilter) return false;

      // Tender filter
      if (tenderFilter !== 'ALL') {
        const method = (s.payment_method || '').toLowerCase().trim();
        const matchesTender =
          tenderFilter === 'transfer'
            ? method === 'transfer' || method.includes('bank')
            : method === tenderFilter;
        if (!matchesTender) return false;
      }

      // Search query filter (Order ID or item name)
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesId = s.id.toLowerCase().includes(query);
        const matchesItem = s.items?.some((i) => i.item_name.toLowerCase().includes(query));
        if (!matchesId && !matchesItem) return false;
      }

      return true;
    });
  }, [sales, statusFilter, tenderFilter, searchQuery]);

  // Aggregate Metrics for Active View
  const metrics = useMemo(() => {
    let completedRevenue = 0;
    let completedCount = 0;
    let voidedCount = 0;
    let voidedAmount = 0;

    filteredSales.forEach((s) => {
      const amt = Number(s.total_amount || 0);
      if (s.status === 'COMPLETED') {
        completedRevenue += amt;
        completedCount += 1;
      } else if (s.status === 'VOIDED') {
        voidedCount += 1;
        voidedAmount += amt;
      }
    });

    const aov = completedCount > 0 ? completedRevenue / completedCount : 0;
    return { completedRevenue, completedCount, voidedCount, voidedAmount, aov };
  }, [filteredSales]);

  // Handle Void Sale execution via RPC
  const handleExecuteVoid = async () => {
    if (!voidSaleTarget) return;

    setIsVoiding(true);
    setVoidError(null);

    try {
      const { data, error } = await supabase.rpc('void_sale', {
        p_sale_id: voidSaleTarget.id,
        p_reason: voidReason.trim() || 'Voided by cashier/manager',
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.message);

      setVoidSaleTarget(null);
      setVoidReason('Customer canceled order');
      fetchSales();
    } catch (err: any) {
      console.error('Void error:', err);
      setVoidError(err.message || 'Failed to void transaction.');
    } finally {
      setIsVoiding(false);
    }
  };

  return (
    <div className="flex h-screen bg-neutral-950 font-sans text-neutral-100 overflow-hidden">
      <div className="h-full flex-shrink-0">
        <Sidebar />
      </div>

      <main className="flex-1 flex flex-col overflow-y-auto p-8 space-y-6 bg-neutral-950">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-800 pb-5">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Sales & Orders Ledger</h1>
            <p className="text-xs text-neutral-400 mt-1">
              Audit transaction history, reprint thermal slips, and execute inventory-backed order voids.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchSales()}
              className="bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 px-3 py-2 rounded-xl text-xs text-neutral-400 hover:text-white transition-colors cursor-pointer"
              title="Refresh ledger"
            >
              ↻ Refresh
            </button>
          </div>
        </div>

        {/* 4 Summary Metric Cards */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-neutral-900/60 border border-neutral-800/80 rounded-2xl p-5 flex flex-col justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 mb-1">
              Net Completed Sales
            </span>
            <p className="font-mono text-3xl font-black text-emerald-400">
              ${metrics.completedRevenue.toFixed(2)}
            </p>
            <span className="text-[11px] text-neutral-500 mt-2">
              Excludes voided and refunded tickets
            </span>
          </div>

          <div className="bg-neutral-900/60 border border-neutral-800/80 rounded-2xl p-5 flex flex-col justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 mb-1">
              Completed Orders
            </span>
            <p className="font-mono text-3xl font-black text-white">{metrics.completedCount}</p>
            <span className="text-[11px] text-neutral-500 mt-2">
              Average ticket: <strong className="text-neutral-300">${metrics.aov.toFixed(2)}</strong>
            </span>
          </div>

          <div className="bg-neutral-900/60 border border-neutral-800/80 rounded-2xl p-5 flex flex-col justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 mb-1">
              Voided Orders
            </span>
            <p className="font-mono text-3xl font-black text-rose-400">{metrics.voidedCount}</p>
            <span className="text-[11px] text-neutral-500 mt-2">
              Cancelled tickets with stock returned
            </span>
          </div>

          <div className="bg-neutral-900/60 border border-neutral-800/80 rounded-2xl p-5 flex flex-col justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 mb-1">
              Voided Revenue Loss
            </span>
            <p className="font-mono text-3xl font-black text-neutral-400">
              ${metrics.voidedAmount.toFixed(2)}
            </p>
            <span className="text-[11px] text-neutral-500 mt-2">
              {metrics.completedRevenue > 0
                ? `${((metrics.voidedAmount / (metrics.completedRevenue + metrics.voidedAmount)) * 100).toFixed(1)}% void rate`
                : '0% void rate'}
            </span>
          </div>
        </section>

        {/* Filters Toolbar */}
        <div className="bg-neutral-900/40 border border-neutral-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {/* Date Range Chips */}
            <div className="flex bg-neutral-950 p-1 rounded-xl border border-neutral-800">
              {(['today', 'yesterday', 'week', 'all'] as const).map((range) => (
                <button
                  key={range}
                  onClick={() => setDateFilter(range)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition cursor-pointer ${
                    dateFilter === range
                      ? 'bg-neutral-800 text-white shadow-sm'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  {range === 'week' ? 'Past 7 Days' : range}
                </button>
              ))}
            </div>

            {/* Status Selector */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="bg-neutral-950 border border-neutral-800 text-xs text-neutral-300 rounded-xl px-3 py-2 focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              <option value="ALL">All Statuses</option>
              <option value="COMPLETED">Completed Only</option>
              <option value="VOIDED">Voided Only</option>
            </select>

            {/* Tender Method Selector */}
            <select
              value={tenderFilter}
              onChange={(e) => setTenderFilter(e.target.value as any)}
              className="bg-neutral-950 border border-neutral-800 text-xs text-neutral-300 rounded-xl px-3 py-2 focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              <option value="ALL">All Payment Methods</option>
              <option value="cash">💵 Cash</option>
              <option value="card">💳 Card</option>
              <option value="qr">📱 QR Code</option>
              <option value="transfer">🏦 Bank Transfer</option>
            </select>
          </div>

          {/* Search Box */}
          <div className="w-full sm:w-64">
            <input
              type="text"
              placeholder="Search by ticket # or dish..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Transactions Table */}
        <div className="bg-neutral-900/40 border border-neutral-800 rounded-2xl overflow-hidden backdrop-blur-sm flex-1">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-neutral-800 bg-neutral-900/80 text-neutral-400 font-medium">
              <tr>
                <th className="py-3.5 px-5">Ticket #</th>
                <th className="py-3.5 px-5">Date & Time</th>
                <th className="py-3.5 px-5">Items Summary</th>
                <th className="py-3.5 px-5 text-center">Tender</th>
                <th className="py-3.5 px-5 text-right">Total Amount</th>
                <th className="py-3.5 px-5 text-center">Status</th>
                <th className="py-3.5 px-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-neutral-500">
                    Loading sales transactions...
                  </td>
                </tr>
              ) : filteredSales.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-neutral-500">
                    No orders match your filter criteria.
                  </td>
                </tr>
              ) : (
                filteredSales.map((sale) => {
                  const isVoided = sale.status === 'VOIDED';
                  const method = (sale.payment_method || '').toLowerCase().trim();

                  return (
                    <tr key={sale.id} className="hover:bg-neutral-800/20 transition-colors">
                      {/* Ticket # */}
                      <td className="py-3.5 px-5 font-mono font-bold text-white whitespace-nowrap">
                        #{sale.id.slice(0, 8)}
                      </td>

                      {/* Timestamp */}
                      <td className="py-3.5 px-5 text-neutral-400 font-mono whitespace-nowrap">
                        {new Date(sale.created_at).toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>

                      {/* Items Summary */}
                      <td className="py-3.5 px-5 text-neutral-300 max-w-xs truncate">
                        {sale.items && sale.items.length > 0
                          ? sale.items.map((i) => `${i.quantity}x ${i.item_name}`).join(', ')
                          : '—'}
                      </td>

                      {/* Payment Method Badge */}
                      <td className="py-3.5 px-5 text-center whitespace-nowrap">
                        <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border bg-neutral-900 border-neutral-800 text-neutral-300 uppercase">
                          {method === 'cash'
                            ? '💵 Cash'
                            : method === 'card'
                            ? '💳 Card'
                            : method === 'transfer' || method.includes('bank')
                            ? '🏦 Transfer'
                            : '📱 QR'}
                        </span>
                      </td>

                      {/* Total Amount */}
                      <td
                        className={`py-3.5 px-5 text-right font-mono font-bold text-sm whitespace-nowrap ${
                          isVoided ? 'line-through text-neutral-500' : 'text-emerald-400'
                        }`}
                      >
                        ${Number(sale.total_amount).toFixed(2)}
                      </td>

                      {/* Status Badge */}
                      <td className="py-3.5 px-5 text-center whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${
                            isVoided
                              ? 'bg-rose-950/60 text-rose-400 border-rose-800/50'
                              : 'bg-emerald-950/60 text-emerald-400 border-emerald-800/50'
                          }`}
                        >
                          {sale.status}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-5 text-right space-x-2 whitespace-nowrap">
                        <button
                          onClick={() => {
                            setSelectedSale(sale);
                            setIsReceiptOpen(true);
                          }}
                          className="bg-neutral-900 hover:bg-neutral-800 text-neutral-300 text-xs px-3 py-1 rounded-lg border border-neutral-800 transition cursor-pointer"
                        >
                          Receipt
                        </button>

                        {!isVoided ? (
                          <button
                            onClick={() => {
                              setVoidSaleTarget(sale);
                              setVoidError(null);
                            }}
                            className="bg-rose-950/30 hover:bg-rose-900/50 text-rose-300 text-xs px-3 py-1 rounded-lg border border-rose-800/50 transition cursor-pointer"
                          >
                            Void Order
                          </button>
                        ) : (
                          <button
                            disabled
                            title={`Voided: ${sale.void_reason || 'No reason specified'}`}
                            className="text-neutral-600 text-xs px-2 py-1 cursor-not-allowed"
                          >
                            Voided
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* RECEIPT REPRINT MODAL */}
        {isReceiptOpen && selectedSale && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-5 print:shadow-none print:border-none print:m-0 print:p-0">
              <div className="flex justify-between items-start border-b border-neutral-800 pb-3 print:hidden">
                <div>
                  <h3 className="text-base font-bold text-white">Order Receipt</h3>
                  <p className="text-[11px] text-neutral-400 font-mono">
                    #{selectedSale.id.slice(0, 8)}
                  </p>
                </div>
                <button
                  onClick={() => setIsReceiptOpen(false)}
                  className="text-neutral-400 hover:text-white text-sm font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* 80mm Thermal Slip Body */}
              <div className="p-4 bg-neutral-950 border border-neutral-800 rounded-xl font-mono text-xs text-neutral-300 space-y-2.5 print:border-none print:p-0 print:text-black">
                {selectedSale.status === 'VOIDED' && (
                  <div className="border-2 border-dashed border-rose-500 text-rose-500 p-2 text-center rounded font-bold text-xs uppercase tracking-widest print:border-black print:text-black">
                    *** VOIDED TRANSACTION ***
                    {selectedSale.void_reason && (
                      <p className="text-[10px] font-normal mt-0.5 lowercase tracking-normal">
                        Reason: {selectedSale.void_reason}
                      </p>
                    )}
                  </div>
                )}

                <div className="text-center pb-2 border-b border-dashed border-neutral-700">
                  <h4 className="font-extrabold text-sm text-white tracking-widest uppercase print:text-black">
                    KITCHOS RESTAURANT
                  </h4>
                  <p className="text-[10px] text-neutral-400 print:text-neutral-600">
                    Order #{selectedSale.id.slice(0, 8)}
                  </p>
                  <p className="text-[10px] text-neutral-400 print:text-neutral-600">
                    {new Date(selectedSale.created_at).toLocaleString([], {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </p>
                </div>

                {/* Items */}
                <div className="space-y-1.5 py-1 border-b border-dashed border-neutral-800">
                  {(selectedSale.items || []).map((item, idx) => (
                    <div key={idx} className="flex justify-between text-[11px]">
                      <span className="truncate pr-2">
                        {item.quantity}x {item.item_name}
                      </span>
                      <span className="font-bold">
                        ${(item.unit_price * item.quantity).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Totals */}
                <div className="space-y-1 text-[11px]">
                  <div className="flex justify-between font-bold text-white print:text-black">
                    <span>TOTAL:</span>
                    <span>${Number(selectedSale.total_amount).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-neutral-400 print:text-neutral-600">
                    <span>Payment Method:</span>
                    <span className="uppercase">{selectedSale.payment_method}</span>
                  </div>
                  <div className="flex justify-between text-neutral-400 print:text-neutral-600">
                    <span>Tendered:</span>
                    <span>${Number(selectedSale.amount_tendered || selectedSale.total_amount).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-neutral-400 print:text-neutral-600">
                    <span>Change Due:</span>
                    <span>${Number(selectedSale.change_due || 0).toFixed(2)}</span>
                  </div>
                </div>

                <div className="text-center pt-2 border-t border-dashed border-neutral-700 text-[10px] text-neutral-500">
                  Thank you for dining with us!
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 print:hidden">
                <button
                  onClick={() => window.print()}
                  className="flex-1 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs font-bold text-white flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <span>🖨️</span>
                  <span>Print Slip</span>
                </button>
                <button
                  onClick={() => setIsReceiptOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-neutral-900 border border-neutral-800 text-xs font-bold text-neutral-300 transition cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* VOID CONFIRMATION MODAL */}
        {voidSaleTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
              <div className="border-b border-neutral-800 pb-3">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-500 inline-block" />
                  <h3 className="text-lg font-bold text-white">Void Order #{voidSaleTarget.id.slice(0, 8)}</h3>
                </div>
                <p className="text-xs text-neutral-400 mt-1">
                  Total amount: <strong className="text-white">${Number(voidSaleTarget.total_amount).toFixed(2)}</strong>
                </p>
              </div>

              <div className="p-3 bg-rose-950/20 border border-rose-900/50 rounded-xl text-xs text-rose-300 space-y-1">
                <p className="font-semibold">⚠️ Inventory Stock Rollback:</p>
                <p className="text-[11px] text-rose-400/90">
                  All raw ingredient portions consumed by this ticket will be automatically returned to stock with a <code>CORRECTION</code> ledger entry.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Reason for Void
                </label>
                <select
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500 transition"
                >
                  <option value="Customer canceled order">Customer canceled order</option>
                  <option value="Wrong items rung up / cashier mistake">Wrong items rung up / cashier mistake</option>
                  <option value="Payment failed or declined">Payment failed or declined</option>
                  <option value="Food quality complaint / remake">Food quality complaint / remake</option>
                  <option value="Duplicate transaction">Duplicate transaction</option>
                </select>
              </div>

              {voidError && (
                <div className="p-2.5 bg-rose-950/40 border border-rose-900 text-rose-300 text-xs rounded-lg">
                  {voidError}
                </div>
              )}

              <div className="flex justify-end gap-2.5 pt-3 border-t border-neutral-800">
                <button
                  type="button"
                  disabled={isVoiding}
                  onClick={() => setVoidSaleTarget(null)}
                  className="px-4 py-2 text-xs text-neutral-400 hover:text-white bg-neutral-800 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isVoiding}
                  onClick={handleExecuteVoid}
                  className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 rounded-lg transition disabled:opacity-50 cursor-pointer shadow-lg shadow-rose-950/40"
                >
                  {isVoiding ? 'Voiding & Restocking...' : 'Confirm Void & Restock'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}