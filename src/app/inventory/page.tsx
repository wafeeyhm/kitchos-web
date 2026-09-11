'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import Sidebar from '@/components/Sidebar';

interface InventoryItem {
  id: string;
  name: string;
  unit_of_measure: string;
  quantity_in_stock: number;
  low_stock_alert: number;
}

interface StockMovement {
  id: string;
  inventory_item_id: string;
  quantity_delta: number;
  movement_type: 'SALE' | 'RESTOCK' | 'WASTE' | 'CORRECTION';
  reference_id: string | null;
  notes: string | null;
  created_at: string;
}

export default function InventoryPage() {
  const supabase = createClient();

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Restock Modal State
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [restockAmount, setRestockAmount] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // History Drawer/Modal State
  const [historyItem, setHistoryItem] = useState<InventoryItem | null>(null);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Fetch inventory data
  const fetchInventory = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('inventory_items')
        .select('id, name, unit_of_measure, quantity_in_stock, low_stock_alert')
        .order('name', { ascending: true });

      if (error) throw error;
      setItems(data || []);
    } catch (err: any) {
      console.error('Error fetching inventory:', err.message);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  // Fetch Movement History for an item
  const fetchHistory = async (item: InventoryItem) => {
    setHistoryItem(item);
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from('stock_movements')
        .select('*')
        .eq('inventory_item_id', item.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setMovements(data || []);
    } catch (err: any) {
      console.error('Error fetching movements:', err.message);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchInventory();

    // Supabase Realtime Subscription for updates
    const channel = supabase
      .channel(`realtime:inventory_items-${Math.random()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'inventory_items',
        },
        () => {
          fetchInventory();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchInventory, supabase]);

  // Handle Restock Submission
  const handleRestockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;

    const qtyToAdd = parseFloat(restockAmount);
    if (isNaN(qtyToAdd) || qtyToAdd <= 0) {
      setErrorMessage('Please enter a valid positive number.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const newStock = Number(selectedItem.quantity_in_stock) + qtyToAdd;

    // 1. Update Current Stock
    const { error: updateError } = await supabase
      .from('inventory_items')
      .update({ quantity_in_stock: newStock })
      .eq('id', selectedItem.id);

    if (updateError) {
      setErrorMessage(updateError.message);
      setIsSubmitting(false);
      return;
    }

    // 2. Insert Immutable Ledger Record
    await supabase.from('stock_movements').insert({
      inventory_item_id: selectedItem.id,
      quantity_delta: qtyToAdd,
      movement_type: 'RESTOCK',
      notes: `Restocked manually (+${qtyToAdd} ${selectedItem.unit_of_measure})`,
    });

    // 3. Local State Update
    setItems((prev) =>
      prev.map((item) =>
        item.id === selectedItem.id ? { ...item, quantity_in_stock: newStock } : item
      )
    );

    setIsSubmitting(false);
    setSelectedItem(null);
    setRestockAmount('');
  };

  return (
    <div className="flex min-h-screen bg-neutral-950 text-neutral-100">
      <Sidebar />

      <main className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Inventory Manager</h1>
              <p className="text-neutral-400 text-sm mt-1">
                Track raw ingredients and inspect stock audit logs in real-time.
              </p>
            </div>
            <button
              onClick={() => fetchInventory()}
              className="text-xs bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 px-3 py-2 rounded-lg text-neutral-300 transition-colors"
            >
              ↻ Refresh
            </button>
          </div>

          {/* Table Container */}
          <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl overflow-hidden backdrop-blur-sm">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-neutral-800 bg-neutral-900/80 text-neutral-400 font-medium">
                <tr>
                  <th className="py-3.5 px-6">Ingredient Name</th>
                  <th className="py-3.5 px-6">Unit</th>
                  <th className="py-3.5 px-6 text-right">Current Stock</th>
                  <th className="py-3.5 px-6 text-center">Status</th>
                  <th className="py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-neutral-500">
                      Loading inventory data...
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-neutral-500">
                      No inventory records found.
                    </td>
                  </tr>
                ) : (
                  items.map((item) => {
                    const isLow = Number(item.quantity_in_stock) <= Number(item.low_stock_alert);
                    const isOut = Number(item.quantity_in_stock) <= 0;

                    return (
                      <tr key={item.id} className="hover:bg-neutral-800/30 transition-colors">
                        <td className="py-4 px-6 font-medium text-white">{item.name}</td>
                        <td className="py-4 px-6 text-neutral-400 uppercase tracking-wide text-xs">
                          {item.unit_of_measure}
                        </td>
                        <td className="py-4 px-6 text-right font-semibold text-emerald-400 text-base">
                          {item.quantity_in_stock}
                        </td>
                        <td className="py-4 px-6 text-center">
                          <span
                            className={`inline-flex items-center px-3 py-0.5 rounded-full text-xs font-medium border ${
                              isOut
                                ? 'bg-rose-950/60 text-rose-400 border-rose-800/50'
                                : isLow
                                ? 'bg-amber-950/60 text-amber-400 border-amber-800/50'
                                : 'bg-emerald-950/60 text-emerald-400 border-emerald-800/50'
                            }`}
                          >
                            {isOut ? 'Out of Stock' : isLow ? 'Low Stock' : 'Healthy'}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-right space-x-2">
                          <button
                            onClick={() => fetchHistory(item)}
                            className="bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 text-xs px-3 py-1.5 rounded-lg border border-neutral-800 font-medium transition-colors"
                          >
                            History
                          </button>
                          <button
                            onClick={() => {
                              setSelectedItem(item);
                              setRestockAmount('');
                              setErrorMessage(null);
                            }}
                            className="bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs px-3.5 py-1.5 rounded-lg border border-neutral-700 font-medium transition-colors"
                          >
                            + Restock
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Restock Modal */}
        {selectedItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5">
              <div>
                <h2 className="text-xl font-bold text-white">Restock Ingredient</h2>
                <p className="text-sm text-neutral-400 mt-0.5">
                  Add incoming supply for{' '}
                  <span className="text-white font-medium">{selectedItem.name}</span>.
                </p>
              </div>

              <form onSubmit={handleRestockSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                    Quantity to Add ({selectedItem.unit_of_measure})
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    autoFocus
                    required
                    placeholder="e.g. 50"
                    value={restockAmount}
                    onChange={(e) => setRestockAmount(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-700 focus:border-emerald-500 rounded-lg px-3.5 py-2.5 text-white placeholder-neutral-500 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors"
                  />
                </div>

                {restockAmount && !isNaN(parseFloat(restockAmount)) && (
                  <div className="p-3 bg-neutral-950/70 border border-neutral-800 rounded-lg flex justify-between items-center text-xs">
                    <span className="text-neutral-400">Resulting Stock:</span>
                    <span className="text-white font-semibold">
                      {selectedItem.quantity_in_stock} →{' '}
                      <span className="text-emerald-400">
                        {Number(selectedItem.quantity_in_stock) + parseFloat(restockAmount)}{' '}
                        {selectedItem.unit_of_measure}
                      </span>
                    </span>
                  </div>
                )}

                {errorMessage && (
                  <p className="text-xs text-rose-400 bg-rose-950/40 border border-rose-900 p-2.5 rounded-lg">
                    {errorMessage}
                  </p>
                )}

                <div className="flex justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => setSelectedItem(null)}
                    className="px-4 py-2 text-xs font-medium text-neutral-400 hover:text-white bg-neutral-800/60 hover:bg-neutral-800 rounded-lg border border-neutral-700/60 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-2 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {isSubmitting ? 'Updating...' : 'Confirm Restock'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Movement History Drawer/Modal */}
        {historyItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-5 flex flex-col max-h-[85vh]">
              <div className="flex justify-between items-start border-b border-neutral-800 pb-3">
                <div>
                  <h2 className="text-xl font-bold text-white">Stock Movement History</h2>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Audit log for <span className="text-white font-semibold">{historyItem.name}</span>
                  </p>
                </div>
                <button
                  onClick={() => setHistoryItem(null)}
                  className="text-neutral-400 hover:text-white text-lg font-bold px-2 py-1 rounded-lg hover:bg-neutral-800"
                >
                  ✕
                </button>
              </div>

              {/* Movement Records Table */}
              <div className="flex-1 overflow-y-auto border border-neutral-800 rounded-xl bg-neutral-950/50">
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-900 border-b border-neutral-800 text-neutral-400 sticky top-0">
                    <tr>
                      <th className="py-2.5 px-4">Timestamp</th>
                      <th className="py-2.5 px-4 text-center">Type</th>
                      <th className="py-2.5 px-4 text-right">Change</th>
                      <th className="py-2.5 px-4">Notes / Source</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/50">
                    {loadingHistory ? (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-neutral-500">
                          Loading movements...
                        </td>
                      </tr>
                    ) : movements.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-neutral-500">
                          No movements recorded yet for this item.
                        </td>
                      </tr>
                    ) : (
                      movements.map((m) => {
                        const isPositive = Number(m.quantity_delta) > 0;
                        return (
                          <tr key={m.id} className="hover:bg-neutral-800/20">
                            <td className="py-3 px-4 text-neutral-400 font-mono whitespace-nowrap">
                              {new Date(m.created_at).toLocaleString([], {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span
                                className={`inline-block px-2 py-0.5 rounded text-[10px] font-extrabold uppercase border ${
                                  m.movement_type === 'SALE'
                                    ? 'bg-rose-950/60 text-rose-400 border-rose-800/40'
                                    : m.movement_type === 'RESTOCK'
                                    ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/40'
                                    : 'bg-amber-950/60 text-amber-400 border-amber-800/40'
                                }`}
                              >
                                {m.movement_type}
                              </span>
                            </td>
                            <td
                              className={`py-3 px-4 text-right font-mono font-bold whitespace-nowrap ${
                                isPositive ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {isPositive ? `+${m.quantity_delta}` : m.quantity_delta}{' '}
                              {historyItem.unit_of_measure}
                            </td>
                            <td className="py-3 px-4 text-neutral-300 truncate max-w-xs">
                              {m.notes || '—'}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setHistoryItem(null)}
                  className="px-4 py-2 text-xs font-semibold text-neutral-300 hover:text-white bg-neutral-800 hover:bg-neutral-700 rounded-lg transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}