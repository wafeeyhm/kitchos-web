'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import Sidebar from '@/components/Sidebar';

interface InventoryItem {
  id: string;
  name: string;
  unit_of_measure: string;
  quantity_in_stock: number;
  low_stock_alert: number;
  cost_per_unit: number;
}

interface Sale {
  id: string;
  total_amount: number;
  payment_method: string;
  status: string;
  created_at: string;
}

interface SaleItem {
  id: string;
  sale_id: string;
  product_id: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

interface CashShift {
  id: string;
  opened_at: string;
  closed_at: string | null;
  status: 'OPEN' | 'CLOSED';
  cashier_name: string;
  opening_float: number;
  total_sales: number | null;
  total_cash: number | null;
}

export default function DashboardPage() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [sales, setSales] = useState<Sale[]>([]);
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [activeShift, setActiveShift] = useState<CashShift | null>(null);
  const [productCogsMap, setProductCogsMap] = useState<Record<string, number>>({});

  // Quick Restock Modal State
  const [restockItem, setRestockItem] = useState<InventoryItem | null>(null);
  const [restockQty, setRestockQty] = useState('');
  const [isSubmittingRestock, setIsSubmittingRestock] = useState(false);
  const [restockError, setRestockError] = useState<string | null>(null);

  // Fetch all dashboard datasets
  const loadDashboardData = useCallback(async () => {
    try {
      setLoading(true);

      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const [invRes, bomRes, salesRes, shiftRes] = await Promise.all([
        supabase
          .from('inventory_items')
          .select('id, name, unit_of_measure, quantity_in_stock, low_stock_alert, cost_per_unit')
          .order('name'),
        supabase
          .from('recipe_bom')
          .select('product_id, quantity_required, inventory_item_id'),
        supabase
          .from('sales')
          .select('id, total_amount, payment_method, status, created_at')
          .gte('created_at', startOfDay.toISOString())
          .eq('status', 'COMPLETED')
          .order('created_at', { ascending: false }),
        supabase
          .from('cash_shifts')
          .select('*')
          .eq('status', 'OPEN')
          .order('opened_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (invRes.data) setInventory(invRes.data);
      if (salesRes.data) setSales(salesRes.data);
      if (shiftRes.data) setActiveShift(shiftRes.data);

      // Compute COGS per product
      if (bomRes.data && invRes.data) {
        const invMap = new Map<string, number>();
        invRes.data.forEach((item: any) => {
          invMap.set(item.id, Number(item.cost_per_unit || 0));
        });

        const cogsMap: Record<string, number> = {};
        bomRes.data.forEach((line: any) => {
          const itemCost = invMap.get(line.inventory_item_id) || 0;
          const lineCost = Number(line.quantity_required) * itemCost;
          cogsMap[line.product_id] = (cogsMap[line.product_id] || 0) + lineCost;
        });
        setProductCogsMap(cogsMap);
      }

      // Fetch sale items
      const saleIds = (salesRes.data || []).map((s) => s.id);
      if (saleIds.length > 0) {
        const { data: itemsData } = await supabase
          .from('sale_items')
          .select('id, sale_id, product_id, item_name, quantity, unit_price, subtotal')
          .in('sale_id', saleIds);

        if (itemsData) setSaleItems(itemsData);
      } else {
        setSaleItems([]);
      }
    } catch (err: any) {
      console.error('Error loading dashboard:', err.message);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadDashboardData();

    const channel = supabase
      .channel(`realtime:dashboard-${Math.random()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, () => {
        loadDashboardData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_items' }, () => {
        loadDashboardData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_shifts' }, () => {
        loadDashboardData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadDashboardData, supabase]);

  // Financial Metrics
  const revenueMetrics = useMemo(() => {
    const grossRevenue = sales.reduce((sum, s) => sum + Number(s.total_amount || 0), 0);
    const orderCount = sales.length;
    const aov = orderCount > 0 ? grossRevenue / orderCount : 0;

    let realizedCogs = 0;
    saleItems.forEach((item) => {
      const unitCogs = productCogsMap[item.product_id] || 0;
      realizedCogs += unitCogs * item.quantity;
    });

    const grossProfit = grossRevenue - realizedCogs;
    const grossMarginPct = grossRevenue > 0 ? (grossProfit / grossRevenue) * 100 : 0;

    return { grossRevenue, orderCount, aov, realizedCogs, grossProfit, grossMarginPct };
  }, [sales, saleItems, productCogsMap]);

  // Payment Tender Breakdown with Bank Transfer
  const paymentBreakdown = useMemo(() => {
    let cash = 0;
    let card = 0;
    let qr = 0;
    let transfer = 0;

    sales.forEach((s) => {
      const amt = Number(s.total_amount || 0);
      const method = (s.payment_method || '').toLowerCase().trim();
      if (method === 'cash') {
        cash += amt;
      } else if (method === 'card') {
        card += amt;
      } else if (method === 'transfer' || method === 'bank_transfer' || method === 'bank transfer') {
        transfer += amt;
      } else {
        qr += amt;
      }
    });

    return { cash, card, qr, transfer };
  }, [sales]);

  // Top Selling Items
  const topDishes = useMemo(() => {
    const map = new Map<string, { name: string; quantity: number; revenue: number; profit: number }>();

    saleItems.forEach((item) => {
      const existing = map.get(item.product_id) || {
        name: item.item_name,
        quantity: 0,
        revenue: 0,
        profit: 0,
      };

      const lineRev = Number(item.subtotal || item.unit_price * item.quantity);
      const unitCost = productCogsMap[item.product_id] || 0;
      const lineCost = unitCost * item.quantity;

      map.set(item.product_id, {
        name: item.item_name,
        quantity: existing.quantity + item.quantity,
        revenue: existing.revenue + lineRev,
        profit: existing.profit + (lineRev - lineCost),
      });
    });

    return Array.from(map.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);
  }, [saleItems, productCogsMap]);

  // Stock Depletion Alerts
  const lowStockAlerts = useMemo(() => {
    return inventory.filter(
      (item) => Number(item.quantity_in_stock) <= Number(item.low_stock_alert)
    );
  }, [inventory]);

  // Quick Restock Action
  const handleQuickRestock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restockItem) return;

    const qty = parseFloat(restockQty);
    if (isNaN(qty) || qty <= 0) {
      setRestockError('Enter a valid positive restock quantity.');
      return;
    }

    setIsSubmittingRestock(true);
    setRestockError(null);

    const newStock = Number(restockItem.quantity_in_stock) + qty;

    try {
      const { error: updateErr } = await supabase
        .from('inventory_items')
        .update({ quantity_in_stock: newStock })
        .eq('id', restockItem.id);

      if (updateErr) throw updateErr;

      await supabase.from('stock_movements').insert({
        inventory_item_id: restockItem.id,
        quantity_delta: qty,
        movement_type: 'RESTOCK',
        notes: `Quick restocked via Dashboard (+${qty} ${restockItem.unit_of_measure})`,
      });

      setRestockItem(null);
      setRestockQty('');
      loadDashboardData();
    } catch (err: any) {
      setRestockError(err.message || 'Failed to update stock.');
    } finally {
      setIsSubmittingRestock(false);
    }
  };

  return (
    <div className="flex h-screen bg-neutral-950 font-sans text-neutral-100 overflow-hidden">
      <div className="h-full flex-shrink-0">
        <Sidebar />
      </div>

      <main className="flex-1 flex flex-col overflow-y-auto p-8 space-y-7 bg-neutral-950">
        {/* Top Header & Real-time Status */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-800 pb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-black text-white tracking-tight">Executive Dashboard</h1>
              <span className="flex items-center gap-1.5 bg-emerald-950/60 border border-emerald-800/60 px-2.5 py-0.5 rounded-full text-[11px] font-semibold text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live Sync
              </span>
            </div>
            <p className="text-xs text-neutral-400 mt-1">
              Real-time revenue, gross margin performance, raw ingredient bottlenecks, and till status.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <Link
              href="/pos"
              className="bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold text-xs px-4 py-2 rounded-xl transition-all shadow-md shadow-emerald-950/30"
            >
              Launch POS Terminal →
            </Link>
            <button
              onClick={() => loadDashboardData()}
              className="bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 px-3 py-2 rounded-xl text-xs text-neutral-400 hover:text-white transition-colors cursor-pointer"
              title="Refresh statistics"
            >
              ↻
            </button>
          </div>
        </div>

        {/* 4 Financial Metric Cards */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-neutral-900/60 border border-neutral-800/80 rounded-2xl p-5 flex flex-col justify-between">
            <div className="flex justify-between items-start mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                Today's Gross Sales
              </span>
              <span className="text-xs text-emerald-400 bg-emerald-950/50 px-2 py-0.5 rounded-md font-mono">
                {revenueMetrics.orderCount} orders
              </span>
            </div>
            <p className="font-mono text-3xl font-black text-white">
              ${revenueMetrics.grossRevenue.toFixed(2)}
            </p>
            <span className="text-[11px] text-neutral-500 mt-2">
              Average ticket: <strong className="text-neutral-300">${revenueMetrics.aov.toFixed(2)}</strong>
            </span>
          </div>

          <div className="bg-neutral-900/60 border border-neutral-800/80 rounded-2xl p-5 flex flex-col justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 mb-2">
              Realized Food Cost (COGS)
            </span>
            <p className="font-mono text-3xl font-black text-amber-400">
              ${revenueMetrics.realizedCogs.toFixed(2)}
            </p>
            <span className="text-[11px] text-neutral-500 mt-2">
              {revenueMetrics.grossRevenue > 0
                ? `${((revenueMetrics.realizedCogs / revenueMetrics.grossRevenue) * 100).toFixed(1)}% of total revenue`
                : 'Calculated from active recipes'}
            </span>
          </div>

          <div className="bg-neutral-900/60 border border-neutral-800/80 rounded-2xl p-5 flex flex-col justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 mb-2">
              Net Gross Profit
            </span>
            <p
              className={`font-mono text-3xl font-black ${
                revenueMetrics.grossProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              ${revenueMetrics.grossProfit.toFixed(2)}
            </p>
            <span className="text-[11px] text-neutral-500 mt-2">
              Sales minus ingredient expenses
            </span>
          </div>

          <div className="bg-neutral-900/60 border border-neutral-800/80 rounded-2xl p-5 flex flex-col justify-between">
            <div className="flex justify-between items-start mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                Gross Margin
              </span>
              <span
                className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                  revenueMetrics.grossMarginPct >= 65
                    ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/60'
                    : revenueMetrics.grossMarginPct >= 40
                    ? 'bg-amber-950/60 text-amber-400 border border-amber-800/60'
                    : 'bg-rose-950/60 text-rose-400 border border-rose-800/60'
                }`}
              >
                {revenueMetrics.grossMarginPct >= 65 ? 'Optimal' : revenueMetrics.grossMarginPct >= 40 ? 'Fair' : 'Low'}
              </span>
            </div>
            <p className="font-mono text-3xl font-black text-white">
              {revenueMetrics.grossMarginPct.toFixed(1)}%
            </p>
            <span className="text-[11px] text-neutral-500 mt-2">
              Target baseline: 65% – 75%
            </span>
          </div>
        </section>

        {/* 2-Column Operational Grid */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Menu Performance & Tender Distribution */}
          <div className="lg:col-span-7 space-y-6">
            <div className="bg-neutral-900/40 border border-neutral-800 rounded-2xl p-5 space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-sm font-bold text-white tracking-tight">
                    Top Selling Dishes (Today)
                  </h3>
                  <p className="text-[11px] text-neutral-400">Ranked by volume and profit contribution</p>
                </div>
                <Link
                  href="/recipes"
                  className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold transition-colors"
                >
                  Configure Recipes →
                </Link>
              </div>

              <div className="border border-neutral-800/80 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-900/80 text-neutral-400 border-b border-neutral-800">
                    <tr>
                      <th className="py-2.5 px-4">Menu Item</th>
                      <th className="py-2.5 px-4 text-center">Sold</th>
                      <th className="py-2.5 px-4 text-right">Revenue</th>
                      <th className="py-2.5 px-4 text-right">Profit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/60">
                    {topDishes.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-neutral-500">
                          No sales recorded yet today.
                        </td>
                      </tr>
                    ) : (
                      topDishes.map((dish, i) => (
                        <tr key={i} className="hover:bg-neutral-800/20">
                          <td className="py-3 px-4 font-medium text-white flex items-center gap-2">
                            <span className="text-neutral-500 font-mono text-[10px]">#{i + 1}</span>
                            {dish.name}
                          </td>
                          <td className="py-3 px-4 text-center font-mono font-bold text-white">
                            {dish.quantity}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-neutral-300">
                            ${dish.revenue.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                            +${dish.profit.toFixed(2)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Sales by Tender Method: 4 Methods */}
            <div className="bg-neutral-900/40 border border-neutral-800 rounded-2xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-white tracking-tight">
                Sales by Tender Method
              </h3>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3.5">
                  <span className="text-[10px] text-neutral-400 uppercase font-bold block mb-1">
                    💵 Cash
                  </span>
                  <p className="font-mono text-lg font-black text-white">
                    ${paymentBreakdown.cash.toFixed(2)}
                  </p>
                  <span className="text-[10px] text-neutral-500">
                    {revenueMetrics.grossRevenue > 0
                      ? `${((paymentBreakdown.cash / revenueMetrics.grossRevenue) * 100).toFixed(0)}% of total`
                      : '0%'}
                  </span>
                </div>

                <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3.5">
                  <span className="text-[10px] text-neutral-400 uppercase font-bold block mb-1">
                    💳 Card
                  </span>
                  <p className="font-mono text-lg font-black text-white">
                    ${paymentBreakdown.card.toFixed(2)}
                  </p>
                  <span className="text-[10px] text-neutral-500">
                    {revenueMetrics.grossRevenue > 0
                      ? `${((paymentBreakdown.card / revenueMetrics.grossRevenue) * 100).toFixed(0)}% of total`
                      : '0%'}
                  </span>
                </div>

                <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3.5">
                  <span className="text-[10px] text-neutral-400 uppercase font-bold block mb-1">
                    📱 QR / e-Wallet
                  </span>
                  <p className="font-mono text-lg font-black text-white">
                    ${paymentBreakdown.qr.toFixed(2)}
                  </p>
                  <span className="text-[10px] text-neutral-500">
                    {revenueMetrics.grossRevenue > 0
                      ? `${((paymentBreakdown.qr / revenueMetrics.grossRevenue) * 100).toFixed(0)}% of total`
                      : '0%'}
                  </span>
                </div>

                <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3.5">
                  <span className="text-[10px] text-neutral-400 uppercase font-bold block mb-1">
                    🏦 Bank Transfer
                  </span>
                  <p className="font-mono text-lg font-black text-white">
                    ${paymentBreakdown.transfer.toFixed(2)}
                  </p>
                  <span className="text-[10px] text-neutral-500">
                    {revenueMetrics.grossRevenue > 0
                      ? `${((paymentBreakdown.transfer / revenueMetrics.grossRevenue) * 100).toFixed(0)}% of total`
                      : '0%'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Cash Till & Critical Stock Radar */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-neutral-900/40 border border-neutral-800 rounded-2xl p-5 space-y-3.5">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-sm font-bold text-white tracking-tight">Active Register Session</h3>
                  <p className="text-[11px] text-neutral-400">Shift drawer & cash reconciliation</p>
                </div>
                {activeShift ? (
                  <span className="flex items-center gap-1 bg-emerald-950/70 border border-emerald-800/60 px-2 py-0.5 rounded-full text-[10px] font-bold text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    REGISTER OPEN
                  </span>
                ) : (
                  <span className="bg-amber-950/60 border border-amber-800/60 px-2 py-0.5 rounded text-[10px] font-bold text-amber-400">
                    REGISTER CLOSED
                  </span>
                )}
              </div>

              {activeShift ? (
                <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 space-y-2.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-neutral-400">Station / Cashier:</span>
                    <span className="font-bold text-white">{activeShift.cashier_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-400">Shift Started:</span>
                    <span className="font-mono text-neutral-300">
                      {new Date(activeShift.opened_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-neutral-900 pt-2">
                    <span className="text-neutral-400">Opening Float:</span>
                    <span className="font-mono font-bold text-neutral-300">
                      ${Number(activeShift.opening_float).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-400">+ Cash Received Today:</span>
                    <span className="font-mono font-bold text-emerald-400">
                      +${paymentBreakdown.cash.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-neutral-800 pt-2 font-bold">
                    <span className="text-white">Expected Cash in Drawer:</span>
                    <span className="font-mono text-emerald-400">
                      ${(Number(activeShift.opening_float) + paymentBreakdown.cash).toFixed(2)}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-6 text-center space-y-2">
                  <p className="text-xs text-neutral-400">No active cashier shift currently open.</p>
                  <Link
                    href="/pos"
                    className="inline-block text-xs font-bold text-emerald-400 hover:underline"
                  >
                    Open Till Shift on POS Terminal →
                  </Link>
                </div>
              )}
            </div>

            {/* Critical Stock Radar */}
            <div className="bg-neutral-900/40 border border-neutral-800 rounded-2xl p-5 space-y-3.5">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-white tracking-tight">Stock Depletion Radar</span>
                  {lowStockAlerts.length > 0 && (
                    <span className="bg-rose-950/70 border border-rose-800/60 text-rose-400 text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                      {lowStockAlerts.length} Critical
                    </span>
                  )}
                </div>
                <Link
                  href="/inventory"
                  className="text-xs text-neutral-400 hover:text-white font-medium"
                >
                  Full Inventory →
                </Link>
              </div>

              {lowStockAlerts.length === 0 ? (
                <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-6 text-center space-y-1">
                  <span className="text-xl">✅</span>
                  <p className="text-xs font-bold text-neutral-300">All Ingredients Healthy</p>
                  <p className="text-[10px] text-neutral-500">Every raw item is above minimum threshold.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {lowStockAlerts.map((item) => {
                    const isOut = Number(item.quantity_in_stock) <= 0;
                    return (
                      <div
                        key={item.id}
                        className="bg-neutral-950 border border-neutral-800/80 rounded-xl p-3 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <h4 className="text-xs font-semibold text-white truncate">{item.name}</h4>
                          <span className="text-[10px] text-neutral-500 block">
                            Alert at {item.low_stock_alert} {item.unit_of_measure}
                          </span>
                        </div>

                        <div className="flex items-center gap-2.5">
                          <span
                            className={`font-mono text-xs font-bold ${
                              isOut ? 'text-rose-400' : 'text-amber-400'
                            }`}
                          >
                            {item.quantity_in_stock} {item.unit_of_measure}
                          </span>
                          <button
                            onClick={() => {
                              setRestockItem(item);
                              setRestockQty('');
                              setRestockError(null);
                            }}
                            className="text-[10px] font-bold bg-neutral-800 hover:bg-neutral-700 text-white px-2.5 py-1 rounded-md transition cursor-pointer"
                          >
                            Restock
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Quick Restock Modal */}
        {restockItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4">
              <div>
                <h3 className="text-lg font-bold text-white">Quick Restock</h3>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Add units to <strong className="text-white">{restockItem.name}</strong>
                </p>
              </div>

              <form onSubmit={handleQuickRestock} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1">
                    Quantity to Add ({restockItem.unit_of_measure})
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    autoFocus
                    required
                    placeholder="e.g. 50"
                    value={restockQty}
                    onChange={(e) => setRestockQty(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-700 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-sm font-mono text-white focus:outline-none"
                  />
                </div>

                {restockError && (
                  <p className="text-xs text-rose-400 bg-rose-950/40 border border-rose-900 p-2 rounded-lg">
                    {restockError}
                  </p>
                )}

                <div className="flex justify-end gap-2 pt-2 border-t border-neutral-800">
                  <button
                    type="button"
                    disabled={isSubmittingRestock}
                    onClick={() => setRestockItem(null)}
                    className="px-3 py-1.5 text-xs text-neutral-400 hover:text-white bg-neutral-800 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingRestock}
                    className="px-4 py-1.5 text-xs font-bold text-neutral-950 bg-emerald-500 hover:bg-emerald-400 rounded-lg transition disabled:opacity-50"
                  >
                    {isSubmittingRestock ? 'Updating...' : 'Confirm Restock'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}