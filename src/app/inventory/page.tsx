'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import Sidebar from '@/components/Sidebar';
import ManagerGuard from '@/components/ManagerGuard';

interface InventoryItem {
  id: string;
  name: string;
  quantity_in_stock: number;
  unit_of_measure: string;
  purchase_price: number;
  package_size: number;
  package_unit: string;
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

  // Add / Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [name, setName] = useState('');
  const [packageUnit, setPackageUnit] = useState('Bag');
  const [purchasePrice, setPurchasePrice] = useState('18.00');
  const [packageSize, setPackageSize] = useState('1000');
  const [unitOfMeasure, setUnitOfMeasure] = useState('g');
  const [initialStock, setInitialStock] = useState('1000');
  const [lowStockAlert, setLowStockAlert] = useState('150');
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

  // Live calculated unit cost preview for modal
  const computedUnitCost = useMemo(() => {
    const price = parseFloat(purchasePrice) || 0;
    const size = parseFloat(packageSize) || 1;
    return size > 0 ? price / size : 0;
  }, [purchasePrice, packageSize]);

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

  const handleOpenAdd = () => {
    setEditingItem(null);
    setName('');
    setPackageUnit('Bag');
    setPurchasePrice('18.00');
    setPackageSize('1000');
    setUnitOfMeasure('g');
    setInitialStock('1000');
    setLowStockAlert('150');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: InventoryItem) => {
    setEditingItem(item);
    setName(item.name);
    setPackageUnit(item.package_unit || 'Package');
    setPurchasePrice((item.purchase_price || 0).toString());
    setPackageSize((item.package_size || 1).toString());
    setUnitOfMeasure(item.unit_of_measure || 'g');
    setInitialStock(item.quantity_in_stock.toString());
    setLowStockAlert((item.low_stock_alert || 10).toString());
    setIsModalOpen(true);
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSaving(true);
    try {
      const priceNum = parseFloat(purchasePrice) || 0;
      const sizeNum = parseFloat(packageSize) || 1;
      const stockNum = parseFloat(initialStock) || 0;
      const alertNum = parseFloat(lowStockAlert) || 10;
      const calculatedCost = sizeNum > 0 ? priceNum / sizeNum : 0;

      if (editingItem) {
        // Update item
        const { error } = await supabase
          .from('inventory_items')
          .update({
            name: name.trim(),
            package_unit: packageUnit.trim(),
            purchase_price: priceNum,
            package_size: sizeNum,
            unit_of_measure: unitOfMeasure,
            cost_per_unit: calculatedCost,
            low_stock_alert: alertNum,
          })
          .eq('id', editingItem.id);

        if (error) throw error;
      } else {
        // Insert new item
        const { data: newItem, error } = await supabase
          .from('inventory_items')
          .insert({
            name: name.trim(),
            package_unit: packageUnit.trim(),
            purchase_price: priceNum,
            package_size: sizeNum,
            unit_of_measure: unitOfMeasure,
            cost_per_unit: calculatedCost,
            quantity_in_stock: stockNum,
            low_stock_alert: alertNum,
          })
          .select('id')
          .single();

        if (error) throw error;

        if (newItem && stockNum > 0) {
          await supabase.from('stock_movements').insert({
            inventory_item_id: newItem.id,
            quantity_delta: stockNum,
            movement_type: 'INITIAL',
            notes: 'Initial stock intake',
          });
        }
      }

      setIsModalOpen(false);
      fetchInventory();
    } catch (err: any) {
      alert(`Failed to save ingredient: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogWaste = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wasteItem) return;

    const qty = parseFloat(wasteQty);
    if (isNaN(qty) || qty <= 0) {
      alert('Please enter a valid waste quantity.');
      return;
    }

    if (qty > wasteItem.quantity_in_stock) {
      alert('Waste quantity cannot exceed stock in hand.');
      return;
    }

    setIsLoggingWaste(true);
    try {
      const { error: updateErr } = await supabase
        .from('inventory_items')
        .update({ quantity_in_stock: wasteItem.quantity_in_stock - qty })
        .eq('id', wasteItem.id);

      if (updateErr) throw updateErr;

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

  const handleOpenHistory = async (item: InventoryItem) => {
    setHistoryItem(item);
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from('stock_movements')
        .select('id, created_at, quantity_delta, movement_type, notes')
        .eq('inventory_item_id', item.id)
        .order('created_at', { ascending: false })
        .limit(25);

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
      description="Raw stock levels, wholesale purchase prices, and waste adjustments require Manager approval."
    >
      <div className="flex h-screen bg-neutral-950 font-sans text-neutral-100 overflow-hidden">
        <div className="h-full flex-shrink-0">
          <Sidebar />
        </div>

        <main className="flex-1 flex flex-col overflow-y-auto p-8 space-y-6 bg-neutral-950">
          {/* Top Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-800 pb-5">
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight">Inventory & Raw Materials</h1>
              <p className="text-xs text-neutral-400 mt-1">
                Manage bulk purchase packaging, automatic portion COGS conversion, and waste logs.
              </p>
            </div>

            <button
              onClick={handleOpenAdd}
              className="bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-extrabold text-xs px-4 py-2.5 rounded-xl transition cursor-pointer shadow-lg shadow-emerald-950/40"
            >
              + Add Raw Ingredient
            </button>
          </div>

          {/* Metrics */}
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-neutral-900/60 border border-neutral-800/80 rounded-2xl p-5 flex flex-col justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 mb-1">
                Raw Ingredients Tracked
              </span>
              <p className="font-mono text-3xl font-black text-white">{metrics.totalItems}</p>
              <span className="text-[11px] text-neutral-500 mt-2">Active kitchen stock items</span>
            </div>

            <div className="bg-neutral-900/60 border border-neutral-800/80 rounded-2xl p-5 flex flex-col justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 mb-1">
                Stock Depletion Alerts
              </span>
              <p className="font-mono text-3xl font-black text-rose-400">{metrics.lowStockCount}</p>
              <span className="text-[11px] text-neutral-500 mt-2">Items below minimum threshold</span>
            </div>

            <div className="bg-neutral-900/60 border border-neutral-800/80 rounded-2xl p-5 flex flex-col justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 mb-1">
                Total Stock Asset Value
              </span>
              <p className="font-mono text-3xl font-black text-emerald-400">
                ${metrics.totalValuation.toFixed(2)}
              </p>
              <span className="text-[11px] text-neutral-500 mt-2">Wholesale inventory valuation</span>
            </div>
          </section>

          {/* Search */}
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

          {/* Table */}
          <div className="bg-neutral-900/40 border border-neutral-800 rounded-2xl overflow-hidden backdrop-blur-sm flex-1">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-neutral-800 bg-neutral-900/80 text-neutral-400 font-medium">
                <tr>
                  <th className="py-3.5 px-5">Ingredient</th>
                  <th className="py-3.5 px-5">Bulk Packaging</th>
                  <th className="py-3.5 px-5 text-right">Auto Recipe Unit Cost</th>
                  <th className="py-3.5 px-5 text-center">Stock In Hand</th>
                  <th className="py-3.5 px-5 text-right">Asset Value</th>
                  <th className="py-3.5 px-5 text-center">Status</th>
                  <th className="py-3.5 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-neutral-500">
                      Loading inventory items...
                    </td>
                  </tr>
                ) : filteredInventory.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-neutral-500">
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
                        <td className="py-3.5 px-5 text-neutral-400 font-mono">
                          ${Number(item.purchase_price || 0).toFixed(2)} / {item.package_size} {item.unit_of_measure} ({item.package_unit || 'pack'})
                        </td>
                        <td className="py-3.5 px-5 text-right font-mono font-bold text-emerald-400">
                          ${Number(item.cost_per_unit || 0).toFixed(4)} / {item.unit_of_measure}
                        </td>
                        <td className="py-3.5 px-5 text-center font-mono font-bold text-white">
                          {stock.toLocaleString()} {item.unit_of_measure}
                        </td>
                        <td className="py-3.5 px-5 text-right font-mono font-bold text-neutral-300">
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
                            {isLow ? '⚠️ Low' : 'Optimal'}
                          </span>
                        </td>
                        <td className="py-3.5 px-5 text-right space-x-1.5 whitespace-nowrap">
                          <button
                            onClick={() => handleOpenEdit(item)}
                            className="bg-neutral-900 hover:bg-neutral-800 text-neutral-300 text-xs px-2.5 py-1 rounded-lg border border-neutral-800 transition cursor-pointer"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => {
                              setWasteItem(item);
                              setWasteQty('');
                              setWasteNotes('');
                            }}
                            className="bg-rose-950/30 hover:bg-rose-900/50 text-rose-300 text-xs px-2.5 py-1 rounded-lg border border-rose-800/50 transition cursor-pointer"
                          >
                            - Waste
                          </button>
                          <button
                            onClick={() => handleOpenHistory(item)}
                            className="bg-neutral-900 hover:bg-neutral-800 text-neutral-400 text-xs px-2 py-1 rounded-lg border border-neutral-800 transition cursor-pointer"
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

          {/* MODAL: ADD / EDIT RAW INGREDIENT WITH AUTO-COGS CALCULATOR */}
          {isModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
              <div className="bg-neutral-900 border border-neutral-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
                <div className="flex justify-between items-start border-b border-neutral-800 pb-3">
                  <div>
                    <h3 className="text-lg font-bold text-white">
                      {editingItem ? 'Edit Ingredient & Packaging' : 'Add Raw Ingredient'}
                    </h3>
                    <p className="text-xs text-neutral-400">
                      Automatic portion unit-cost derivation engine
                    </p>
                  </div>
                  <button
                    onClick={() => setIsModalOpen(false)}
                    className="text-neutral-400 hover:text-white text-sm font-bold cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleSaveItem} className="space-y-3 text-xs">
                  <div>
                    <label className="block text-neutral-300 font-medium mb-1">Ingredient Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Espresso Beans, Fresh Whole Milk"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  {/* Packaging Specification */}
                  <div className="p-3.5 bg-neutral-950 border border-neutral-800 rounded-2xl space-y-2.5">
                    <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">
                      Wholesale Packaging to Recipe Conversion
                    </span>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-neutral-400 mb-1">Package Unit Name</label>
                        <input
                          type="text"
                          placeholder="e.g. 1kg Bag, Carton"
                          value={packageUnit}
                          onChange={(e) => setPackageUnit(e.target.value)}
                          className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-1.5 text-white"
                        />
                      </div>

                      <div>
                        <label className="block text-neutral-400 mb-1">Purchase Cost ($)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          required
                          value={purchasePrice}
                          onChange={(e) => setPurchasePrice(e.target.value)}
                          className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-1.5 text-white font-mono"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-neutral-400 mb-1">Package Net Quantity</label>
                        <input
                          type="number"
                          step="any"
                          min="0.1"
                          required
                          placeholder="1000"
                          value={packageSize}
                          onChange={(e) => setPackageSize(e.target.value)}
                          className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-1.5 text-white font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-neutral-400 mb-1">Recipe Portion Unit</label>
                        <select
                          value={unitOfMeasure}
                          onChange={(e) => setUnitOfMeasure(e.target.value)}
                          className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-1.5 text-white"
                        >
                          <option value="g">Grams (g)</option>
                          <option value="ml">Milliliters (ml)</option>
                          <option value="pcs">Pieces (pcs)</option>
                          <option value="shots">Shots</option>
                          <option value="kg">Kilograms (kg)</option>
                        </select>
                      </div>
                    </div>

                    {/* Auto-Calculated Unit Cost Badge */}
                    <div className="pt-2 border-t border-neutral-900 flex justify-between items-center text-neutral-400">
                      <span>Calculated Portion Cost:</span>
                      <span className="font-mono font-bold text-emerald-400 text-sm">
                        ${computedUnitCost.toFixed(4)} / {unitOfMeasure}
                      </span>
                    </div>
                  </div>

                  {!editingItem && (
                    <div>
                      <label className="block text-neutral-300 font-medium mb-1">
                        Initial Physical Stock ({unitOfMeasure})
                      </label>
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
                  )}

                  <div>
                    <label className="block text-neutral-300 font-medium mb-1">
                      Low Stock Alert Level ({unitOfMeasure})
                    </label>
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

                  <div className="flex justify-end gap-2 pt-3 border-t border-neutral-800">
                    <button
                      type="button"
                      onClick={() => setIsModalOpen(false)}
                      className="px-3.5 py-2 text-neutral-400 hover:text-white bg-neutral-800 rounded-xl cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="px-4 py-2 font-bold text-neutral-950 bg-emerald-500 hover:bg-emerald-400 rounded-xl transition cursor-pointer"
                    >
                      {isSaving ? 'Saving...' : editingItem ? 'Update Ingredient' : 'Save Ingredient'}
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
                    <label className="block text-neutral-300 mb-1">Reason</label>
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
                      placeholder="e.g. spilled container during rush"
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
                    Close
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