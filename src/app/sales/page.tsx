'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import Sidebar from '@/components/Sidebar';
import { logAuditEvent } from '@/utils/audit';

interface SaleItem {
  id: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  modifiers?: { name: string; price: number }[];
  notes?: string | null;
}

interface Sale {
  id: string;
  created_at: string;
  branch_id?: string | null;
  total_amount: number;
  payment_method: string;
  amount_tendered: number;
  change_due: number;
  status: 'COMPLETED' | 'VOIDED';
  order_type: 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';
  reference_number?: string | null;
  notes?: string | null;
  void_reason?: string | null;
  voided_at?: string | null;
  payment_details?: {
    channel?: string;
    qr_provider?: string;
    bank?: string;
    network?: string;
    reference_id?: string;
    merchant_id?: string;
  } | null;
  staff?: {
    id: string;
    name: string;
  } | null;
  sale_items?: SaleItem[];
}

type DatePreset = 'TODAY' | 'YESTERDAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'CUSTOM' | 'ALL';

export default function SalesPage() {
  const supabase = createClient();

  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters State
  const [datePreset, setDatePreset] = useState<DatePreset>('TODAY');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [paymentFilter, setPaymentFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Receipt Slip Modal
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);

  // Void Modal State
  const [isVoidModalOpen, setIsVoidModalOpen] = useState(false);
  const [saleToVoid, setSaleToVoid] = useState<Sale | null>(null);
  const [voidPin, setVoidPin] = useState('');
  const [voidReason, setVoidReason] = useState('Customer Cancelled / Mistake');
  const [voidError, setVoidError] = useState<string | null>(null);
  const [isVoiding, setIsVoiding] = useState(false);

  const fetchSales = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('sales')
        .select(`
          id,
          created_at,
          branch_id,
          total_amount,
          payment_method,
          amount_tendered,
          change_due,
          status,
          order_type,
          reference_number,
          notes,
          void_reason,
          voided_at,
          payment_details,
          staff:staff_members (
            id,
            name
          ),
          sale_items (
            id,
            item_name,
            quantity,
            unit_price,
            subtotal,
            modifiers,
            notes
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSales((data as any) || []);
    } catch (err: any) {
      console.error('Error loading sales ledger:', err.message);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchSales();

    const channel = supabase
      .channel(`realtime:sales-ledger-${Math.random()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, () => {
        fetchSales();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchSales, supabase]);

  // Filtered Sales with Date, Status, Payment Channel, and Search Query
  const filteredSales = useMemo(() => {
    return sales.filter((sale) => {
      if (statusFilter !== 'ALL' && sale.status !== statusFilter) return false;

      if (paymentFilter !== 'ALL' && sale.payment_method.toUpperCase() !== paymentFilter) {
        return false;
      }

      const saleDate = new Date(sale.created_at);
      const now = new Date();

      if (datePreset === 'TODAY') {
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        if (saleDate < startOfToday) return false;
      } else if (datePreset === 'YESTERDAY') {
        const startOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        const endOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, -1);
        if (saleDate < startOfYesterday || saleDate > endOfYesterday) return false;
      } else if (datePreset === 'THIS_WEEK') {
        const dayOfWeek = now.getDay();
        const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
        if (saleDate < startOfWeek) return false;
      } else if (datePreset === 'THIS_MONTH') {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        if (saleDate < startOfMonth) return false;
      } else if (datePreset === 'CUSTOM') {
        if (customStartDate) {
          const start = new Date(`${customStartDate}T00:00:00`);
          if (saleDate < start) return false;
        }
        if (customEndDate) {
          const end = new Date(`${customEndDate}T23:59:59.999`);
          if (saleDate > end) return false;
        }
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().replace('#', '');
        const idMatch = sale.id.toLowerCase().includes(q);
        const refMatch = sale.reference_number && sale.reference_number.toLowerCase().includes(q);
        const providerMatch =
          sale.payment_details?.qr_provider &&
          sale.payment_details.qr_provider.toLowerCase().includes(q);
        const bankMatch =
          sale.payment_details?.bank && sale.payment_details.bank.toLowerCase().includes(q);
        const staffMatch = sale.staff?.name && sale.staff.name.toLowerCase().includes(q);

        if (!idMatch && !refMatch && !providerMatch && !bankMatch && !staffMatch) {
          return false;
        }
      }

      return true;
    });
  }, [sales, datePreset, customStartDate, customEndDate, statusFilter, paymentFilter, searchQuery]);

  // Metrics
  const metrics = useMemo(() => {
    const activeSales = filteredSales.filter((s) => s.status === 'COMPLETED');
    const voidedSales = filteredSales.filter((s) => s.status === 'VOIDED');

    const totalRevenue = activeSales.reduce((sum, s) => sum + Number(s.total_amount || 0), 0);
    const totalTransactions = activeSales.length;
    const averageOrderValue = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

    return {
      totalRevenue,
      totalTransactions,
      averageOrderValue,
      voidedCount: voidedSales.length,
    };
  }, [filteredSales]);

  // Void Handler with Manager PIN and Audit Trigger
  const handleConfirmVoid = async () => {
    if (!saleToVoid) return;
    if (voidPin.length !== 4) {
      setVoidError('Please enter a valid 4-digit Manager PIN.');
      return;
    }

    setIsVoiding(true);
    setVoidError(null);

    try {
      // 1. Verify Manager PIN
      const { data: pinRes, error: pinErr } = await supabase.rpc('verify_manager_pin', {
        p_pin: voidPin.trim(),
      });

      if (pinErr) throw pinErr;
      if (!pinRes || !pinRes.valid) {
        setVoidError('Invalid Manager PIN. Authorization failed.');
        setIsVoiding(false);
        return;
      }

      // 2. Execute Void RPC
      const managerAuthNote = `${voidReason} (Auth by ${pinRes.manager_name || 'Manager'})`;
      const { data: voidRes, error: rpcErr } = await supabase.rpc('void_sale_transaction', {
        p_sale_id: saleToVoid.id,
        p_reason: managerAuthNote,
      });

      if (rpcErr) throw rpcErr;
      if (!voidRes.success) throw new Error(voidRes.message);

      // 3. Automatically record to Unified System Audit Log
      await logAuditEvent({
        branchId: saleToVoid.branch_id || null,
        actionType: 'VOID_SALE',
        severity: 'CRITICAL',
        entityName: 'sales',
        entityId: saleToVoid.id,
        summary: `Transaction #${saleToVoid.id.slice(0, 8)} ($${Number(saleToVoid.total_amount).toFixed(2)}) was VOIDED`,
        details: {
          order_id: saleToVoid.id,
          amount: saleToVoid.total_amount,
          reason: voidReason,
          authorized_by: pinRes.manager_name || 'Manager',
          payment_method: saleToVoid.payment_method,
          order_type: saleToVoid.order_type,
          reference_number: saleToVoid.reference_number,
        },
      });

      setIsVoidModalOpen(false);
      setSaleToVoid(null);
      setVoidPin('');
      fetchSales();
    } catch (err: any) {
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
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-800 pb-5">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Sales & Orders Ledger</h1>
            <p className="text-xs text-neutral-400 mt-1">
              Live transaction records, date auditing, Brunei QR/EDC approval codes, and cashier audit trail.
            </p>
          </div>

          <button
            onClick={() => fetchSales()}
            className="bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 px-3.5 py-2 rounded-xl text-xs font-semibold text-neutral-300 hover:text-white transition cursor-pointer"
          >
            ↻ Refresh Ledger
          </button>
        </div>

        {/* 4 Metrics Cards */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-neutral-900/60 border border-neutral-800/80 rounded-2xl p-5 flex flex-col justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 mb-1">
              Period Revenue
            </span>
            <p className="font-mono text-3xl font-black text-emerald-400">
              ${metrics.totalRevenue.toFixed(2)}
            </p>
            <span className="text-[11px] text-neutral-500 mt-2">
              Gross completed sales for selected period
            </span>
          </div>

          <div className="bg-neutral-900/60 border border-neutral-800/80 rounded-2xl p-5 flex flex-col justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 mb-1">
              Transactions Count
            </span>
            <p className="font-mono text-3xl font-black text-white">{metrics.totalTransactions}</p>
            <span className="text-[11px] text-neutral-500 mt-2">Completed customer tickets</span>
          </div>

          <div className="bg-neutral-900/60 border border-neutral-800/80 rounded-2xl p-5 flex flex-col justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 mb-1">
              Average Order Value (AOV)
            </span>
            <p className="font-mono text-3xl font-black text-amber-400">
              ${metrics.averageOrderValue.toFixed(2)}
            </p>
            <span className="text-[11px] text-neutral-500 mt-2">Average spend per ticket</span>
          </div>

          <div className="bg-neutral-900/60 border border-neutral-800/80 rounded-2xl p-5 flex flex-col justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 mb-1">
              Voided Tickets
            </span>
            <p className="font-mono text-3xl font-black text-rose-400">{metrics.voidedCount}</p>
            <span className="text-[11px] text-neutral-500 mt-2">Cancelled & restocked orders</span>
          </div>
        </section>

        {/* Filter Controls Bar */}
        <div className="bg-neutral-900/40 border border-neutral-800 rounded-2xl p-4 space-y-3">
          {/* Top Row: Date Presets & Custom Range */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800/70 pb-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-bold text-neutral-400 mr-2 flex items-center gap-1">
                <span>📅</span> Date:
              </span>
              {(
                [
                  { id: 'TODAY', label: 'Today' },
                  { id: 'YESTERDAY', label: 'Yesterday' },
                  { id: 'THIS_WEEK', label: 'This Week' },
                  { id: 'THIS_MONTH', label: 'This Month' },
                  { id: 'CUSTOM', label: 'Custom Range' },
                  { id: 'ALL', label: 'All Time' },
                ] as const
              ).map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => setDatePreset(preset.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border ${
                    datePreset === preset.id
                      ? 'bg-emerald-500 text-neutral-950 border-emerald-400 shadow-sm'
                      : 'bg-neutral-950 text-neutral-400 border-neutral-800 hover:text-white hover:bg-neutral-900'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

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
          </div>

          {/* Bottom Row: Status, Tender, and Search */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-neutral-950 border border-neutral-800 text-xs text-neutral-300 rounded-xl px-3 py-2 focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                <option value="ALL">All Statuses</option>
                <option value="COMPLETED">Completed</option>
                <option value="VOIDED">Voided</option>
              </select>

              <select
                value={paymentFilter}
                onChange={(e) => setPaymentFilter(e.target.value)}
                className="bg-neutral-950 border border-neutral-800 text-xs text-neutral-300 rounded-xl px-3 py-2 focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                <option value="ALL">All Payment Channels</option>
                <option value="CASH">Cash</option>
                <option value="QR">QR / E-Wallet</option>
                <option value="CARD">Card EDC</option>
                <option value="TRANSFER">Bank Transfer</option>
              </select>
            </div>

            <div className="w-full sm:w-80">
              <input
                type="text"
                placeholder="Search Txn Ref #, Order ID, Cashier, or Bank..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>
        </div>

        {/* Sales Table */}
        <div className="bg-neutral-900/40 border border-neutral-800 rounded-2xl overflow-hidden backdrop-blur-sm flex-1">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-neutral-800 bg-neutral-900/80 text-neutral-400 font-medium">
              <tr>
                <th className="py-3.5 px-5">Order ID & Type</th>
                <th className="py-3.5 px-5">Timestamp</th>
                <th className="py-3.5 px-5">Staff / Cashier</th>
                <th className="py-3.5 px-5">Payment & Txn Ref ID</th>
                <th className="py-3.5 px-5 text-right">Total Bill</th>
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
                    No transactions found matching your date or search filter.
                  </td>
                </tr>
              ) : (
                filteredSales.map((sale) => {
                  const isVoided = sale.status === 'VOIDED';
                  const qrProvider = sale.payment_details?.qr_provider;
                  const bankName = sale.payment_details?.bank;
                  const cardNet = sale.payment_details?.network;

                  return (
                    <tr
                      key={sale.id}
                      className={`hover:bg-neutral-800/20 transition-colors ${
                        isVoided ? 'opacity-50' : ''
                      }`}
                    >
                      {/* Order ID & Type */}
                      <td className="py-3.5 px-5">
                        <span className="font-mono font-bold text-white block">
                          #{sale.id.slice(0, 8)}
                        </span>
                        <span
                          className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                            sale.order_type === 'TAKEAWAY'
                              ? 'bg-amber-950/80 text-amber-400 border border-amber-800/60'
                              : 'bg-neutral-800 text-neutral-400'
                          }`}
                        >
                          {sale.order_type || 'DINE_IN'}
                        </span>
                      </td>

                      {/* Timestamp */}
                      <td className="py-3.5 px-5 text-neutral-400 font-mono">
                        {new Date(sale.created_at).toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>

                      {/* Staff */}
                      <td className="py-3.5 px-5 text-white font-medium">
                        {sale.staff?.name || 'Cashier Station'}
                      </td>

                      {/* Payment & Prominent Txn Ref ID */}
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-white uppercase text-xs">
                            {sale.payment_method}
                          </span>
                          {(qrProvider || bankName || cardNet) && (
                            <span className="text-[10px] text-neutral-400 font-medium">
                              ({qrProvider || bankName || cardNet})
                            </span>
                          )}
                        </div>

                        {sale.reference_number ? (
                          <div className="flex items-center gap-1 text-[11px] font-mono font-bold text-emerald-400 mt-0.5">
                            <span className="text-neutral-500 font-normal">Ref:</span>
                            <span>#{sale.reference_number}</span>
                          </div>
                        ) : (
                          <span className="text-[10px] text-neutral-600 font-mono">
                            No ref recorded
                          </span>
                        )}
                      </td>

                      {/* Total */}
                      <td
                        className={`py-3.5 px-5 text-right font-mono font-bold text-sm ${
                          isVoided ? 'line-through text-neutral-500' : 'text-emerald-400'
                        }`}
                      >
                        ${Number(sale.total_amount).toFixed(2)}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-5 text-center">
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
                          className="bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white text-xs px-3 py-1 rounded-lg border border-neutral-800 transition cursor-pointer"
                        >
                          View Slip
                        </button>

                        {!isVoided && (
                          <button
                            onClick={() => {
                              setSaleToVoid(sale);
                              setVoidPin('');
                              setVoidError(null);
                              setIsVoidModalOpen(true);
                            }}
                            className="bg-rose-950/30 hover:bg-rose-900/50 text-rose-400 hover:text-rose-300 text-xs px-2.5 py-1 rounded-lg border border-rose-900/50 transition cursor-pointer"
                          >
                            Void
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

        {/* MODAL: ORDER RECEIPT SLIP */}
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

              {/* Thermal Slip */}
              <div className="p-4 bg-neutral-950 border border-neutral-800 rounded-xl font-mono text-xs text-neutral-300 space-y-2.5 print:border-none print:p-0 print:text-black">
                <div className="text-center pb-2 border-b border-dashed border-neutral-700">
                  <h4 className="font-extrabold text-sm text-white tracking-widest uppercase print:text-black">
                    KITCHOS RESTAURANT
                  </h4>
                  <p className="text-[10px] text-neutral-400 print:text-neutral-600 font-bold uppercase mt-0.5">
                    *** {selectedSale.order_type === 'TAKEAWAY' ? 'TAKEAWAY' : 'DINE-IN'} ***
                  </p>
                  <p className="text-[10px] text-neutral-400 print:text-neutral-600">
                    Order #{selectedSale.id.slice(0, 8)} • Staff: {selectedSale.staff?.name || 'Staff'}
                  </p>
                  <p className="text-[10px] text-neutral-400 print:text-neutral-600">
                    {new Date(selectedSale.created_at).toLocaleString([], {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </p>
                </div>

                {/* Items & Modifiers */}
                <div className="space-y-1.5 py-1 border-b border-dashed border-neutral-800">
                  {(selectedSale.sale_items || []).map((item, idx) => (
                    <div key={idx} className="text-[11px]">
                      <div className="flex justify-between">
                        <span className="truncate pr-2 font-bold">
                          {item.quantity}x {item.item_name}
                        </span>
                        <span className="font-bold font-mono">
                          ${Number(item.subtotal).toFixed(2)}
                        </span>
                      </div>

                      {item.modifiers &&
                        item.modifiers.map((m, mIdx) => (
                          <div key={mIdx} className="text-[10px] text-neutral-400 pl-3">
                            + {m.name} {m.price > 0 ? `($${m.price.toFixed(2)})` : ''}
                          </div>
                        ))}
                      {item.notes && (
                        <div className="text-[10px] text-neutral-400 italic pl-3">
                          "{item.notes}"
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Payment Breakdown & Transaction Reference ID */}
                <div className="space-y-1 text-[11px]">
                  <div className="flex justify-between font-bold text-white print:text-black">
                    <span>TOTAL:</span>
                    <span>${Number(selectedSale.total_amount).toFixed(2)}</span>
                  </div>

                  <div className="flex justify-between text-neutral-400 print:text-neutral-600">
                    <span>Payment Method:</span>
                    <span className="uppercase font-semibold">
                      {selectedSale.payment_method}
                      {selectedSale.payment_details?.qr_provider &&
                        ` (${selectedSale.payment_details.qr_provider})`}
                      {selectedSale.payment_details?.bank &&
                        ` (${selectedSale.payment_details.bank})`}
                      {selectedSale.payment_details?.network &&
                        ` (${selectedSale.payment_details.network})`}
                    </span>
                  </div>

                  {selectedSale.reference_number ? (
                    <div className="flex justify-between text-emerald-400 print:text-black font-bold pt-0.5 pb-0.5">
                      <span>Txn / Approval ID:</span>
                      <span>#{selectedSale.reference_number}</span>
                    </div>
                  ) : null}

                  <div className="flex justify-between text-neutral-400 print:text-neutral-600">
                    <span>Tendered:</span>
                    <span>${Number(selectedSale.amount_tendered).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-neutral-400 print:text-neutral-600">
                    <span>Change Due:</span>
                    <span>${Number(selectedSale.change_due).toFixed(2)}</span>
                  </div>
                </div>

                {selectedSale.notes && (
                  <div className="text-[10px] text-neutral-400 pt-1 border-t border-dashed border-neutral-800 italic">
                    Memo: {selectedSale.notes}
                  </div>
                )}

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
                  className="flex-1 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs font-bold text-white transition cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: VOID SALE TRANSACTION */}
        {isVoidModalOpen && saleToVoid && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
            <div className="bg-neutral-900 border border-neutral-800 rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4">
              <div>
                <span className="text-[10px] uppercase font-bold text-rose-400 tracking-wider">
                  Manager Authorization Required
                </span>
                <h3 className="text-lg font-bold text-white mt-0.5">Void Sale Transaction</h3>
                <p className="text-xs text-neutral-400">
                  Order #{saleToVoid.id.slice(0, 8)} • ${Number(saleToVoid.total_amount).toFixed(2)}
                </p>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-neutral-300 font-medium mb-1">Reason for Void</label>
                  <select
                    value={voidReason}
                    onChange={(e) => setVoidReason(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-white cursor-pointer"
                  >
                    <option value="Customer Cancelled / Mistake">Customer Cancelled / Mistake</option>
                    <option value="Wrong Item Rung Up">Wrong Item Rung Up</option>
                    <option value="Kitchen Preparation Issue">Kitchen Preparation Issue</option>
                    <option value="Payment Gateway Failure">Payment Gateway Failure</option>
                    <option value="Manager Complimentary">Manager Complimentary</option>
                  </select>
                </div>

                <div>
                  <label className="block text-neutral-300 font-medium mb-1">
                    Enter 4-Digit Manager PIN *
                  </label>
                  <input
                    type="password"
                    maxLength={4}
                    autoFocus
                    placeholder="••••"
                    value={voidPin}
                    onChange={(e) => setVoidPin(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-white font-mono text-center tracking-widest text-base focus:outline-none focus:border-rose-500"
                  />
                </div>

                {voidError && (
                  <p className="text-xs text-rose-400 bg-rose-950/40 border border-rose-900/60 p-2 rounded-xl">
                    {voidError}
                  </p>
                )}

                <div className="flex justify-end gap-2 pt-2 border-t border-neutral-800">
                  <button
                    type="button"
                    onClick={() => setIsVoidModalOpen(false)}
                    className="px-3.5 py-2 text-neutral-400 hover:text-white bg-neutral-800 rounded-xl cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isVoiding || voidPin.length !== 4}
                    onClick={handleConfirmVoid}
                    className="px-4 py-2 font-bold text-white bg-rose-600 hover:bg-rose-500 disabled:opacity-40 rounded-xl transition cursor-pointer"
                  >
                    {isVoiding ? 'Voiding...' : 'Confirm Void'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}