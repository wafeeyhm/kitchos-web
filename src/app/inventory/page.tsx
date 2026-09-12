'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import Sidebar from '@/components/Sidebar';
import ManagerGuard from '@/components/ManagerGuard';

interface InventoryItem {
  id: string;
  name: string;
  category?: string;
  quantity_in_stock: number;
  unit_of_measure: string;
  cost_per_unit: number;
  low_stock_alert: number;
}

interface StockMovement {
  id: string;
  created_at: string;
  quantity_delta: number;
  movement_type: 'SALE' | 'RESTOCK' | 'WASTE' | 'CORRECTION' | 'INITIAL';
  notes: string | null;
}

export default function InventoryPage() {
  const supabase = createClient();

  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Add Item Modal
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [unitOfMeasure, setUnitOfMeasure] = useState('g');
  const [initialStock, setInitialStock] = useState('1000');
  const [costPerUnit, setCostPerUnit] = useState('0.01');
  const [lowStockAlert, setLowStockAlert] = useState('100');
  const [isSaving, setIsSaving] = useState(false);

  // Waste Modal State
  const [wasteItem, setWasteItem] = useState<InventoryItem | null>(null);
  const [wasteQty, setWasteQty] = useState('');
  const [wasteReason, setWasteReason] = useState('Expired / Rotten');
  const [wasteNotes, setWasteNotes] = useState('');
  const [isLoggingWaste, setIsLoggingWaste] = useState(false);

  // History Ledger Modal State
  const [historyItem, setHistoryItem] = useState<InventoryItem | null>(null);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const fetchInventory = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('inventory_items')
        .select('*')
        .order('name');

      if (error) throw error;
      setInventory((data as any) || []);
    } catch (err: any) {
      console.error('Error fetching inventory:', err.message);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchInventory();

    const channel = supabase
      .channel(`realtime:inventory-page-${Math.random()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_items' }, () => {
        fetchInventory();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchInventory, supabase]);

  const filteredInventory = useMemo(() => {
    return inventory.filter((i) => i.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [inventory, searchQuery]);

  // Metrics
  const metrics = useMemo(() => {
    let totalItems = inventory.length;
    let lowStockCount = 0;
    let totalValuation = 0;

    inventory.forEach((i) => {
      const stock = Number(i.quantity_in_stock || 0);
      const cost = Number(i.cost_per_unit || 0);
      totalValuation += stock * cost;
      if (stock <= Number(i.low_stock_alert || 0)) {
        lowStockCount += 1;
      }
    });

    return { totalItems, lowStockCount, totalValuation };
  }, [inventory]);

  // Handle Add Item
  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSaving(true);
    try {
      const stockNum = parseFloat(initialStock) || 0;
      const { data: newItem, error } = await supabase
        .from('inventory_items')
        .insert({
          name: name.trim(),
          unit_of_measure: unitOfMeasure,
          quantity_in_stock: stockNum,
          cost_per_unit: parseFloat(costPerUnit) || 0,
          low_stock_alert: parseFloat(lowStockAlert) || 10,
        })
        .select('id')
        .single();

      if (error) throw error;

      if (newItem && stockNum > 0) {
        await supabase.from('stock_movements').insert({
          inventory_item_id: newItem.id,
          quantity_delta: stockNum,
          movement_type: 'INITIAL',
          notes: 'Initial stock setup',
        });
      }

      setIsAddOpen(false);
      setName('');
      setInitialStock('1000');
      setCostPerUnit('0.01');
      fetchInventory();
    } catch (err: any) {
      alert(`Failed to add item: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle Waste Logging
  const handleLogWaste = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wasteItem) return;

    const qty = parseFloat(wasteQty);
    if (isNaN(qty) || qty <= 0) {
      alert('Please enter a valid waste quantity.');
      return;
    }

    if (qty > wasteItem.quantity_in_stock) {
      alert('Waste quantity cannot exceed physical stock in hand.');
      return;
    }

    setIsLoggingWaste(true);
    try {
      // 1. Deduct stock
      const { error: updateErr } = await supabase
        .from('inventory_items')
        .update({ quantity_in_stock: wasteItem.quantity_in_stock - qty })
        .eq('id', wasteItem.id);

      if (updateErr) throw updateErr;

      // 2. Log movement
      const { error: moveErr } = await supabase.from('stock_movements').insert({
        inventory_item_id: wasteItem.id,
        quantity_delta: -qty,
        movement_type: 'WASTE',
        notes: `Waste Logged: ${wasteReason}${wasteNotes ? ` (${wasteNotes})` : ''}`,
      });

      if (moveErr) throw moveErr;

      setWasteItem(null);
      setWasteQty('');
      setWasteNotes('');
      fetchInventory();
    } catch (err: any) {
      alert(`Error logging waste: ${err.message}`);
    } finally {
      setIsLoggingWaste(false);
    }
  };

  // Fetch Movement History
  const handleOpenHistory = async (item: InventoryItem) => {
    setHistoryItem(item);
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from('stock_movements')
        .select('id, created_at, quantity_delta, movement_type, notes')
        .eq('inventory_item_id', item.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setMovements((data as any) || []);
    } catch (err: any) {
      console.error('Error fetching stock history:', err.message);
    } finally {
      setLoadingHistory(false);
    }
  };

  return (
    <ManagerGuard
      pageTitle="Inventory & Waste Management"
      description="Raw material stock levels, manual stock adjustments, and waste logs require Manager approval."
    >
      <div className="flex h-screen bg-neutral-950 font-sans text-neutral-100 overflow-hidden">
        <div className="h-full flex-shrink-0">
          <Sidebar />
        </div>

        <main className="flex-1 flex flex-col overflow-y-auto p-8 space-y-6 bg-neutral-950">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-800 pb-5">
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight">Inventory & Waste</h1>
              <p className="text-xs text-neutral-400 mt-1">
                Real-time raw ingredient stock levels, valuation, and waste incident logging.
              </p>
            </div>

            <button
              onClick={() => setIsAddOpen(true)}
              className="bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-extrabold text-xs px-4 py-2.5 rounded-xl transition cursor-pointer shadow-lg shadow-emerald-950/40"
            >
              + Add Raw Ingredient
            </button>
          </div>

          {/* 3 Metric Cards */}
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-neutral-900/60 border border-neutral-800/80 rounded-2xl p-5 flex flex-col justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 mb-1">
                Total Raw Ingredients
              </span>
              <p className="font-mono text-3xl font-black text-white">{metrics.totalItems}</p>
              <span className="text-[11px] text-neutral-500 mt-2">Active catalog items</span>
            </div>

            <div className="bg-neutral-900/60 border border-neutral-800/80 rounded-2xl p-5 flex flex-col justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 mb-1">
                Stock Depletion Alerts
              </span>
              <p className="font-mono text-3xl font-black text-rose-400">{metrics.lowStockCount}</p>
              <span className="text-[11px] text-neutral-500 mt-2">
                Items at or below minimum threshold
              </span>
            </div>

            <div className="bg-neutral-900/60 border border-neutral-800/80 rounded-2xl p-5 flex flex-col justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 mb-1">
                Inventory Valuation
              </span>
              <p className="font-mono text-3xl font-black text-emerald-400">
                ${metrics.totalValuation.toFixed(2)}
              </p>
              <span className="text-[11px] text-neutral-500 mt-2">Total wholesale asset worth</span>
            </div>
          </section>

          {/* Search Bar */}
          <div className="bg-neutral-900/40 border border-neutral-800 rounded-2xl p-4 flex items-center justify-between gap-3">
            <div className="w-full sm:w-80">
              <input
                type="text"
                placeholder="Search raw ingredients..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <button
              onClick={() => fetchInventory()}
              className="bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 px-3 py-2 rounded-xl text-xs text-neutral-400 hover:text-white transition cursor-pointer"
            >
              ↻ Refresh
            </button>
          </div>

          {/* Inventory Table */}
          <div className="bg-neutral-900/40 border border-neutral-800 rounded-2xl overflow-hidden backdrop-blur-sm flex-1">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-neutral-800 bg-neutral-900/80 text-neutral-400 font-medium">
                <tr>
                  <th className="py-3.5 px-5">Ingredient Name</th>
                  <th className="py-3.5 px-5 text-center">Stock In Hand</th>
                  <th className="py-3.5 px-5 text-right">Unit Cost</th>
                  <th className="py-3.5 px-5 text-right">Total Asset Value</th>
                  <th className="py-3.5 px-5 text-center">Status</th>
                  <th className="py-3.5 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-neutral-500">
                      Loading inventory stock...
                    </td>
                  </tr>
                ) : filteredInventory.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-neutral-500">
                      No inventory items found.
                    </td>
                  </tr>
                ) : (
                  filteredInventory.map((item) => {
                    const stock = Number(item.quantity_in_stock || 0);
                    const alertThreshold = Number(item.low_stock_alert || 0);
                    const isLow = stock <= alertThreshold;
                    const valuation = stock * Number(item.cost_per_unit || 0);

                    return (
                      <tr key={item.id} className="hover:bg-neutral-800/20 transition-colors">
                        <td className="py-3.5 px-5 font-bold text-white">{item.name}</td>
                        <td className="py-3.5 px-5 text-center font-mono font-bold text-white">
                          {stock.toLocaleString()} {item.unit_of_measure}
                        </td>
                        <td className="py-3.5 px-5 text-right font-mono text-neutral-400">
                          ${Number(item.cost_per_unit || 0).toFixed(4)}
                        </td>
                        <td className="py-3.5 px-5 text-right font-mono font-bold text-emerald-400">
                          ${valuation.toFixed(2)}
                        </td>
                        <td className="py-3.5 px-5 text-center">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${
                              isLow
                                ? 'bg-rose-950/60 text-rose-400 border-rose-800/50 animate-pulse'
                                : 'bg-emerald-950/60 text-emerald-400 border-emerald-800/50'
                            }`}
                          >
                            {isLow ? '⚠️ Low Stock' : 'Optimal'}
                          </span>
                        </td>
                        <td className="py-3.5 px-5 text-right space-x-2 whitespace-nowrap">
                          <button
                            onClick={() => {
                              setWasteItem(item);
                              setWasteQty('');
                              setWasteNotes('');
                            }}
                            className="bg-rose-950/30 hover:bg-rose-900/50 text-rose-300 text-xs px-3 py-1 rounded-lg border border-rose-800/50 transition cursor-pointer"
                          >
                            - Waste
                          </button>
                          <button
                            onClick={() => handleOpenHistory(item)}
                            className="bg-neutral-900 hover:bg-neutral-800 text-neutral-300 text-xs px-3 py-1 rounded-lg border border-neutral-800 transition cursor-pointer"
                          >
                            History
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* MODAL: ADD RAW INGREDIENT */}
          {isAddOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
              <div className="bg-neutral-900 border border-neutral-800 rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4">
                <h3 className="text-lg font-bold text-white">Add Raw Ingredient</h3>

                <form onSubmit={handleAddItem} className="space-y-3 text-xs">
                  <div>
                    <label className="block text-neutral-300 mb-1">Ingredient Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Fresh Milk"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-neutral-300 mb-1">Unit of Measure</label>
                    <select
                      value={unitOfMeasure}
                      onChange={(e) => setUnitOfMeasure(e.target.value)}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-white"
                    >
                      <option value="g">Grams (g)</option>
                      <option value="ml">Milliliters (ml)</option>
                      <option value="pcs">Pieces (pcs)</option>
                      <option value="packs">Packs</option>
                      <option value="kg">Kilograms (kg)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-neutral-300 mb-1">Initial Stock Quantity</label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      required
                      value={initialStock}
                      onChange={(e) => setInitialStock(e.target.value)}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-neutral-300 mb-1">Cost Per Unit ($)</label>
                    <input
                      type="number"
                      step="0.0001"
                      min="0"
                      required
                      value={costPerUnit}
                      onChange={(e) => setCostPerUnit(e.target.value)}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-neutral-300 mb-1">Low Stock Alert Threshold</label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      required
                      value={lowStockAlert}
                      onChange={(e) => setLowStockAlert(e.target.value)}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-white font-mono"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t border-neutral-800">
                    <button
                      type="button"
                      onClick={() => setIsAddOpen(false)}
                      className="px-3 py-1.5 text-neutral-400 hover:text-white bg-neutral-800 rounded-xl cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="px-4 py-1.5 font-bold text-neutral-950 bg-emerald-500 hover:bg-emerald-400 rounded-xl transition cursor-pointer"
                    >
                      {isSaving ? 'Saving...' : 'Save Ingredient'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* MODAL: LOG WASTE */}
          {wasteItem && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
              <div className="bg-neutral-900 border border-neutral-800 rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4">
                <div>
                  <h3 className="text-lg font-bold text-white">Log Spoilage & Waste</h3>
                  <p className="text-xs text-neutral-400 mt-0.5">{wasteItem.name}</p>
                </div>

                <form onSubmit={handleLogWaste} className="space-y-3 text-xs">
                  <div>
                    <label className="block text-neutral-300 mb-1">
                      Quantity to Waste ({wasteItem.unit_of_measure}) *
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0.001"
                      max={wasteItem.quantity_in_stock}
                      required
                      autoFocus
                      placeholder={`Max: ${wasteItem.quantity_in_stock}`}
                      value={wasteQty}
                      onChange={(e) => setWasteQty(e.target.value)}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-neutral-300 mb-1">Reason for Waste</label>
                    <select
                      value={wasteReason}
                      onChange={(e) => setWasteReason(e.target.value)}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-white"
                    >
                      <option value="Expired / Rotten">Expired / Rotten</option>
                      <option value="Spillage / Dropped">Spillage / Dropped</option>
                      <option value="Prep Error / Remake">Prep Error / Remake</option>
                      <option value="Packaging Damaged">Packaging Damaged</option>
                      <option value="QC Rejection">QC Rejection</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-neutral-300 mb-1">Notes (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. spilled container on floor"
                      value={wasteNotes}
                      onChange={(e) => setWasteNotes(e.target.value)}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-white"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t border-neutral-800">
                    <button
                      type="button"
                      onClick={() => setWasteItem(null)}
                      className="px-3 py-1.5 text-neutral-400 hover:text-white bg-neutral-800 rounded-xl cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isLoggingWaste}
                      className="px-4 py-1.5 font-bold text-white bg-rose-600 hover:bg-rose-500 rounded-xl transition cursor-pointer"
                    >
                      {isLoggingWaste ? 'Logging...' : 'Confirm Waste'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* MODAL: STOCK AUDIT HISTORY */}
          {historyItem && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
              <div className="bg-neutral-900 border border-neutral-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
                <div className="flex justify-between items-start border-b border-neutral-800 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-white">Stock Movement Audit Trail</h3>
                    <p className="text-xs text-neutral-400">{historyItem.name}</p>
                  </div>
                  <button
                    onClick={() => setHistoryItem(null)}
                    className="text-neutral-400 hover:text-white text-sm font-bold cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                <div className="max-h-80 overflow-y-auto space-y-2">
                  {loadingHistory ? (
                    <p className="text-xs text-neutral-500 text-center py-6">Loading movements...</p>
                  ) : movements.length === 0 ? (
                    <p className="text-xs text-neutral-500 text-center py-6">No audit movements recorded.</p>
                  ) : (
                    movements.map((m) => {
                      const isPositive = m.quantity_delta > 0;
                      return (
                        <div
                          key={m.id}
                          className="p-3 bg-neutral-950 border border-neutral-800 rounded-xl flex items-center justify-between text-xs font-mono"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span
                                className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${
                                  m.movement_type === 'RESTOCK'
                                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                    : m.movement_type === 'WASTE'
                                    ? 'bg-rose-950 text-rose-400 border border-rose-800'
                                    : 'bg-neutral-800 text-neutral-300'
                                }`}
                              >
                                {m.movement_type}
                              </span>
                              <span className="text-neutral-400 text-[10px]">
                                {new Date(m.created_at).toLocaleString([], {
                                  dateStyle: 'short',
                                  timeStyle: 'short',
                                })}
                              </span>
                            </div>
                            {m.notes && <p className="text-[11px] text-neutral-300 mt-1">{m.notes}</p>}
                          </div>

                          <span
                            className={`font-black text-sm ${
                              isPositive ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {isPositive ? `+${m.quantity_delta}` : m.quantity_delta}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="pt-2 border-t border-neutral-800 flex justify-end">
                  <button
                    onClick={() => setHistoryItem(null)}
                    className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-xs font-bold text-white rounded-xl cursor-pointer"
                  >
                    Close History
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