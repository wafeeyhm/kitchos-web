'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import Sidebar from '@/components/Sidebar';

interface Supplier {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
}

interface InventoryItem {
  id: string;
  name: string;
  unit_of_measure: string;
  quantity_in_stock: number;
  low_stock_alert: number;
  cost_per_unit: number;
}

interface PoItem {
  id?: string;
  inventory_item_id: string;
  item_name?: string;
  unit_of_measure?: string;
  quantity_ordered: number;
  unit_cost: number;
  subtotal: number;
}

interface PurchaseOrder {
  id: string;
  po_number: string;
  supplier_id: string | null;
  supplier?: Supplier;
  status: 'DRAFT' | 'ORDERED' | 'RECEIVED' | 'CANCELLED';
  total_amount: number;
  notes: string | null;
  ordered_at: string | null;
  received_at: string | null;
  created_at: string;
  items?: PoItem[];
}

export default function PurchasesPage() {
  const supabase = createClient();

  // Active Tab
  const [activeTab, setActiveTab] = useState<'orders' | 'suppliers'>('orders');

  // Datasets
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'DRAFT' | 'ORDERED' | 'RECEIVED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [isNewPoOpen, setIsNewPoOpen] = useState(false);
  const [isNewSupplierOpen, setIsNewSupplierOpen] = useState(false);
  const [selectedPo, setSelectedPo] = useState<PurchaseOrder | null>(null);
  const [isPoDetailOpen, setIsPoDetailOpen] = useState(false);

  // New Supplier Form State
  const [supName, setSupName] = useState('');
  const [supContact, setSupContact] = useState('');
  const [supPhone, setSupPhone] = useState('');
  const [supEmail, setSupEmail] = useState('');
  const [supAddress, setSupAddress] = useState('');
  const [isSavingSupplier, setIsSavingSupplier] = useState(false);

  // New PO Form State
  const [poSupplierId, setPoSupplierId] = useState('');
  const [poNotes, setPoNotes] = useState('');
  const [poItems, setPoItems] = useState<PoItem[]>([]);
  const [isSavingPo, setIsSavingPo] = useState(false);
  const [poError, setPoError] = useState<string | null>(null);

  // Receiving Action State
  const [receivingPoId, setReceivingPoId] = useState<string | null>(null);
  const [isReceiving, setIsReceiving] = useState(false);

  // Fetch Data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);

      const [ordersRes, supRes, invRes] = await Promise.all([
        supabase
          .from('purchase_orders')
          .select(`
            id,
            po_number,
            supplier_id,
            status,
            total_amount,
            notes,
            ordered_at,
            received_at,
            created_at,
            supplier:suppliers (
              id,
              name,
              contact_person,
              phone,
              email
            ),
            items:purchase_order_items (
              id,
              inventory_item_id,
              quantity_ordered,
              unit_cost,
              subtotal
            )
          `)
          .order('created_at', { ascending: false }),
        supabase.from('suppliers').select('*').order('name'),
        supabase
          .from('inventory_items')
          .select('id, name, unit_of_measure, quantity_in_stock, low_stock_alert, cost_per_unit')
          .order('name'),
      ]);

      if (ordersRes.data) {
        const invMap = new Map((invRes.data || []).map((i) => [i.id, i]));
        const formattedOrders = ordersRes.data.map((o: any) => ({
          ...o,
          items: (o.items || []).map((item: any) => {
            const inv = invMap.get(item.inventory_item_id);
            return {
              ...item,
              item_name: inv?.name || 'Unknown Ingredient',
              unit_of_measure: inv?.unit_of_measure || 'units',
            };
          }),
        }));
        setOrders(formattedOrders);
      }

      if (supRes.data) setSuppliers(supRes.data);
      if (invRes.data) setInventory(invRes.data);
    } catch (err: any) {
      console.error('Error loading procurement data:', err.message);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel(`realtime:purchases-${Math.random()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_orders' }, () => {
        fetchData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'suppliers' }, () => {
        fetchData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData, supabase]);

  // Metrics
  const metrics = useMemo(() => {
    const openOrders = orders.filter((o) => o.status === 'ORDERED' || o.status === 'DRAFT');
    const receivedOrders = orders.filter((o) => o.status === 'RECEIVED');
    const lowStockCount = inventory.filter(
      (i) => Number(i.quantity_in_stock) <= Number(i.low_stock_alert)
    ).length;

    const totalOpenSpend = openOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);

    return {
      openCount: openOrders.length,
      totalOpenSpend,
      receivedCount: receivedOrders.length,
      lowStockCount,
      supplierCount: suppliers.length,
    };
  }, [orders, inventory, suppliers]);

  // Filtered Orders
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (statusFilter !== 'ALL' && o.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesPo = o.po_number.toLowerCase().includes(q);
        const matchesSup = o.supplier?.name.toLowerCase().includes(q);
        if (!matchesPo && !matchesSup) return false;
      }
      return true;
    });
  }, [orders, statusFilter, searchQuery]);

  // 1-Click Low Stock PO Generator
  const handleGenerateLowStockPo = () => {
    const depleted = inventory.filter(
      (item) => Number(item.quantity_in_stock) <= Number(item.low_stock_alert)
    );

    if (depleted.length === 0) {
      alert('All ingredient stocks are currently healthy above minimum alerts.');
      return;
    }

    const generatedLines: PoItem[] = depleted.map((item) => {
      const targetRestock = Math.max(
        Math.ceil(item.low_stock_alert * 2),
        item.low_stock_alert - item.quantity_in_stock + 10
      );
      const unitCost = Number(item.cost_per_unit || 1.0);
      return {
        inventory_item_id: item.id,
        item_name: item.name,
        unit_of_measure: item.unit_of_measure,
        quantity_ordered: targetRestock,
        unit_cost: unitCost,
        subtotal: targetRestock * unitCost,
      };
    });

    setPoSupplierId(suppliers[0]?.id || '');
    setPoNotes(`Automated replenishment PO for ${depleted.length} low-stock ingredients.`);
    setPoItems(generatedLines);
    setPoError(null);
    setIsNewPoOpen(true);
  };

  // Add Line Item
  const handleAddLineItem = () => {
    if (inventory.length === 0) return;
    const defaultItem = inventory[0];
    setPoItems((prev) => [
      ...prev,
      {
        inventory_item_id: defaultItem.id,
        item_name: defaultItem.name,
        unit_of_measure: defaultItem.unit_of_measure,
        quantity_ordered: 10,
        unit_cost: defaultItem.cost_per_unit || 1.0,
        subtotal: 10 * (defaultItem.cost_per_unit || 1.0),
      },
    ]);
  };

  // Update Line Item
  const handleUpdatePoLine = (
    index: number,
    field: 'inventory_item_id' | 'quantity_ordered' | 'unit_cost',
    val: any
  ) => {
    setPoItems((prev) => {
      const updated = [...prev];
      const target = { ...updated[index] };

      if (field === 'inventory_item_id') {
        const item = inventory.find((i) => i.id === val);
        if (item) {
          target.inventory_item_id = item.id;
          target.item_name = item.name;
          target.unit_of_measure = item.unit_of_measure;
          target.unit_cost = item.cost_per_unit || 1.0;
        }
      } else if (field === 'quantity_ordered') {
        target.quantity_ordered = Math.max(0, parseFloat(val) || 0);
      } else if (field === 'unit_cost') {
        target.unit_cost = Math.max(0, parseFloat(val) || 0);
      }

      target.subtotal = target.quantity_ordered * target.unit_cost;
      updated[index] = target;
      return updated;
    });
  };

  // Remove Line Item
  const handleRemovePoLine = (index: number) => {
    setPoItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Create Purchase Order
  const handleCreatePo = async (targetStatus: 'DRAFT' | 'ORDERED') => {
    if (!poSupplierId) {
      setPoError('Please select a supplier.');
      return;
    }
    if (poItems.length === 0) {
      setPoError('Please add at least one line item to the order.');
      return;
    }

    setIsSavingPo(true);
    setPoError(null);

    try {
      const poNumber = `PO-${Date.now().toString().slice(-6)}`;
      const totalAmount = poItems.reduce((sum, item) => sum + item.subtotal, 0);

      // 1. Insert header
      const { data: poHeader, error: poErr } = await supabase
        .from('purchase_orders')
        .insert({
          po_number: poNumber,
          supplier_id: poSupplierId,
          status: targetStatus,
          total_amount: totalAmount,
          notes: poNotes.trim() || null,
          ordered_at: targetStatus === 'ORDERED' ? new Date().toISOString() : null,
        })
        .select('id')
        .single();

      if (poErr) throw poErr;

      // 2. Insert lines
      const linesToInsert = poItems.map((item) => ({
        purchase_order_id: poHeader.id,
        inventory_item_id: item.inventory_item_id,
        quantity_ordered: item.quantity_ordered,
        unit_cost: item.unit_cost,
        subtotal: item.subtotal,
      }));

      const { error: itemsErr } = await supabase
        .from('purchase_order_items')
        .insert(linesToInsert);

      if (itemsErr) throw itemsErr;

      setIsNewPoOpen(false);
      setPoItems([]);
      fetchData();
    } catch (err: any) {
      setPoError(err.message || 'Failed to create purchase order.');
    } finally {
      setIsSavingPo(false);
    }
  };

  // Receive Delivery (Invokes Server-side RPC)
  const handleReceiveGoods = async (poId: string) => {
    setIsReceiving(true);
    setReceivingPoId(poId);
    try {
      const { data, error } = await supabase.rpc('receive_purchase_order', {
        p_po_id: poId,
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.message);

      setReceivingPoId(null);
      setIsPoDetailOpen(false);
      fetchData();
    } catch (err: any) {
      alert(`Error receiving shipment: ${err.message}`);
    } finally {
      setIsReceiving(false);
      setReceivingPoId(null);
    }
  };

  // Create Supplier
  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supName.trim()) return;

    setIsSavingSupplier(true);
    try {
      const { error } = await supabase.from('suppliers').insert({
        name: supName.trim(),
        contact_person: supContact.trim() || null,
        phone: supPhone.trim() || null,
        email: supEmail.trim() || null,
        address: supAddress.trim() || null,
      });

      if (error) throw error;

      setIsNewSupplierOpen(false);
      setSupName('');
      setSupContact('');
      setSupPhone('');
      setSupEmail('');
      setSupAddress('');
      fetchData();
    } catch (err: any) {
      alert(`Failed to save supplier: ${err.message}`);
    } finally {
      setIsSavingSupplier(false);
    }
  };

  return (
    <div className="flex h-screen bg-neutral-950 font-sans text-neutral-100 overflow-hidden">
      <div className="h-full flex-shrink-0">
        <Sidebar />
      </div>

      <main className="flex-1 flex flex-col overflow-y-auto p-8 space-y-6 bg-neutral-950">
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-800 pb-5">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Procurement & Vendors</h1>
            <p className="text-xs text-neutral-400 mt-1">
              Supplier management, automated replenishment orders, and raw goods receiving.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={handleGenerateLowStockPo}
              className="bg-amber-500 hover:bg-amber-400 text-neutral-950 font-extrabold text-xs px-3.5 py-2 rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-md shadow-amber-950/40"
            >
              <span>⚡</span>
              <span>1-Click Low-Stock PO</span>
            </button>
            <button
              onClick={() => {
                setPoSupplierId(suppliers[0]?.id || '');
                setPoNotes('');
                setPoItems([]);
                setPoError(null);
                handleAddLineItem();
                setIsNewPoOpen(true);
              }}
              className="bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-extrabold text-xs px-3.5 py-2 rounded-xl transition cursor-pointer"
            >
              + Create PO
            </button>
          </div>
        </div>

        {/* 4 Metric Cards */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-neutral-900/60 border border-neutral-800/80 rounded-2xl p-5 flex flex-col justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 mb-1">
              Active / Open POs
            </span>
            <p className="font-mono text-3xl font-black text-amber-400">{metrics.openCount}</p>
            <span className="text-[11px] text-neutral-500 mt-2">
              Pending deliveries (${metrics.totalOpenSpend.toFixed(2)})
            </span>
          </div>

          <div className="bg-neutral-900/60 border border-neutral-800/80 rounded-2xl p-5 flex flex-col justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 mb-1">
              Critical Restock Bottlenecks
            </span>
            <p className="font-mono text-3xl font-black text-rose-400">{metrics.lowStockCount}</p>
            <span className="text-[11px] text-neutral-500 mt-2">
              Ingredients below threshold alert
            </span>
          </div>

          <div className="bg-neutral-900/60 border border-neutral-800/80 rounded-2xl p-5 flex flex-col justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 mb-1">
              Deliveries Received
            </span>
            <p className="font-mono text-3xl font-black text-emerald-400">{metrics.receivedCount}</p>
            <span className="text-[11px] text-neutral-500 mt-2">
              Fulfilled purchase orders
            </span>
          </div>

          <div className="bg-neutral-900/60 border border-neutral-800/80 rounded-2xl p-5 flex flex-col justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 mb-1">
              Active Suppliers
            </span>
            <p className="font-mono text-3xl font-black text-white">{metrics.supplierCount}</p>
            <span className="text-[11px] text-neutral-500 mt-2">
              Connected vendor accounts
            </span>
          </div>
        </section>

        {/* Tabs & Filters */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-800 pb-3">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('orders')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                activeTab === 'orders'
                  ? 'bg-neutral-800 text-white shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Purchase Orders ({orders.length})
            </button>
            <button
              onClick={() => setActiveTab('suppliers')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                activeTab === 'suppliers'
                  ? 'bg-neutral-800 text-white shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Suppliers Directory ({suppliers.length})
            </button>
          </div>

          {activeTab === 'orders' ? (
            <div className="flex items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="bg-neutral-900 border border-neutral-800 text-xs text-neutral-300 rounded-xl px-3 py-2 focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                <option value="ALL">All Statuses</option>
                <option value="DRAFT">Draft</option>
                <option value="ORDERED">Ordered</option>
                <option value="RECEIVED">Received</option>
              </select>

              <input
                type="text"
                placeholder="Search PO # or Vendor..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-neutral-900 border border-neutral-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500"
              />
            </div>
          ) : (
            <button
              onClick={() => setIsNewSupplierOpen(true)}
              className="bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 px-3 py-1.5 rounded-xl text-xs font-bold text-white transition cursor-pointer"
            >
              + Add Supplier
            </button>
          )}
        </div>

        {/* TAB 1: ORDERS TABLE */}
        {activeTab === 'orders' ? (
          <div className="bg-neutral-900/40 border border-neutral-800 rounded-2xl overflow-hidden flex-1">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-neutral-800 bg-neutral-900/80 text-neutral-400 font-medium">
                <tr>
                  <th className="py-3.5 px-5">PO Number</th>
                  <th className="py-3.5 px-5">Supplier</th>
                  <th className="py-3.5 px-5">Date Created</th>
                  <th className="py-3.5 px-5 text-center">Items</th>
                  <th className="py-3.5 px-5 text-right">Total Cost</th>
                  <th className="py-3.5 px-5 text-center">Status</th>
                  <th className="py-3.5 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-neutral-500">
                      Loading purchase orders...
                    </td>
                  </tr>
                ) : filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-neutral-500">
                      No purchase orders found. Click "+ Create PO" or "1-Click Low-Stock PO".
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((po) => {
                    const itemCount = po.items?.length || 0;
                    return (
                      <tr key={po.id} className="hover:bg-neutral-800/20 transition-colors">
                        <td className="py-3.5 px-5 font-mono font-bold text-white">
                          {po.po_number}
                        </td>
                        <td className="py-3.5 px-5 text-white font-medium">
                          {po.supplier?.name || 'Unassigned'}
                        </td>
                        <td className="py-3.5 px-5 text-neutral-400 font-mono">
                          {new Date(po.created_at).toLocaleDateString([], {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </td>
                        <td className="py-3.5 px-5 text-center font-mono text-neutral-300">
                          {itemCount} lines
                        </td>
                        <td className="py-3.5 px-5 text-right font-mono font-bold text-emerald-400">
                          ${Number(po.total_amount).toFixed(2)}
                        </td>
                        <td className="py-3.5 px-5 text-center">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${
                              po.status === 'RECEIVED'
                                ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/50'
                                : po.status === 'ORDERED'
                                ? 'bg-amber-950/60 text-amber-400 border-amber-800/50'
                                : 'bg-neutral-800 text-neutral-400 border-neutral-700'
                            }`}
                          >
                            {po.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-5 text-right space-x-2">
                          <button
                            onClick={() => {
                              setSelectedPo(po);
                              setIsPoDetailOpen(true);
                            }}
                            className="bg-neutral-900 hover:bg-neutral-800 text-neutral-300 text-xs px-3 py-1 rounded-lg border border-neutral-800 transition cursor-pointer"
                          >
                            View Slip
                          </button>

                          {po.status === 'ORDERED' && (
                            <button
                              onClick={() => handleReceiveGoods(po.id)}
                              disabled={isReceiving && receivingPoId === po.id}
                              className="bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold text-xs px-3 py-1 rounded-lg transition cursor-pointer disabled:opacity-50"
                            >
                              {isReceiving && receivingPoId === po.id ? 'Restocking...' : 'Receive Items'}
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
        ) : (
          /* TAB 2: SUPPLIERS DIRECTORY */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {suppliers.map((sup) => (
              <div
                key={sup.id}
                className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-5 space-y-3"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-sm font-bold text-white">{sup.name}</h3>
                    <p className="text-xs text-neutral-400">{sup.contact_person || 'General Sales'}</p>
                  </div>
                  <span className="text-xl">🏢</span>
                </div>

                <div className="space-y-1.5 text-xs text-neutral-400 pt-2 border-t border-neutral-800/80">
                  <p>📞 {sup.phone || 'No phone recorded'}</p>
                  <p>✉️ {sup.email || 'No email recorded'}</p>
                  <p>📍 {sup.address || 'Address unlisted'}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* MODAL: CREATE / CONFIGURE PO */}
        {isNewPoOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-neutral-900 border border-neutral-800 rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-5">
              <div className="flex justify-between items-start border-b border-neutral-800 pb-3">
                <div>
                  <h3 className="text-lg font-bold text-white">New Purchase Order</h3>
                  <p className="text-xs text-neutral-400">Order raw ingredients and supplies from vendor</p>
                </div>
                <button
                  onClick={() => setIsNewPoOpen(false)}
                  className="text-neutral-400 hover:text-white text-sm font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Vendor & Notes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block text-neutral-300 font-medium mb-1">Target Supplier</label>
                  <select
                    value={poSupplierId}
                    onChange={(e) => setPoSupplierId(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-neutral-300 font-medium mb-1">PO Notes / Memo</label>
                  <input
                    type="text"
                    placeholder="e.g. Urgent morning delivery before opening"
                    value={poNotes}
                    onChange={(e) => setPoNotes(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Line Items Table */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                    Order Items Checklist
                  </span>
                  <button
                    onClick={handleAddLineItem}
                    className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold cursor-pointer"
                  >
                    + Add Ingredient Line
                  </button>
                </div>

                <div className="max-h-56 overflow-y-auto border border-neutral-800 rounded-xl divide-y divide-neutral-800/80">
                  {poItems.map((line, idx) => (
                    <div key={idx} className="p-3 bg-neutral-950/60 flex items-center gap-3 text-xs">
                      {/* Ingredient Selector */}
                      <div className="flex-1">
                        <select
                          value={line.inventory_item_id}
                          onChange={(e) => handleUpdatePoLine(idx, 'inventory_item_id', e.target.value)}
                          className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-white"
                        >
                          {inventory.map((inv) => (
                            <option key={inv.id} value={inv.id}>
                              {inv.name} ({inv.unit_of_measure})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Quantity */}
                      <div className="w-24">
                        <input
                          type="number"
                          step="any"
                          min="0.1"
                          value={line.quantity_ordered}
                          onChange={(e) => handleUpdatePoLine(idx, 'quantity_ordered', e.target.value)}
                          className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-2 py-1.5 font-mono text-right text-white"
                          title="Quantity"
                        />
                      </div>

                      {/* Unit Cost */}
                      <div className="w-24">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={line.unit_cost}
                          onChange={(e) => handleUpdatePoLine(idx, 'unit_cost', e.target.value)}
                          className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-2 py-1.5 font-mono text-right text-white"
                          title="Cost per unit"
                        />
                      </div>

                      {/* Line Subtotal */}
                      <div className="w-20 text-right font-mono font-bold text-emerald-400">
                        ${line.subtotal.toFixed(2)}
                      </div>

                      {/* Remove Line */}
                      <button
                        onClick={() => handleRemovePoLine(idx)}
                        className="text-neutral-500 hover:text-rose-400 text-sm px-1 cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {poError && (
                <p className="text-xs text-rose-400 bg-rose-950/40 border border-rose-900/60 p-2.5 rounded-xl">
                  {poError}
                </p>
              )}

              {/* Total & Action Buttons */}
              <div className="pt-3 border-t border-neutral-800 flex justify-between items-center">
                <div>
                  <span className="text-xs text-neutral-400">Total Purchase Value:</span>
                  <p className="font-mono text-xl font-black text-emerald-400">
                    ${poItems.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2)}
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    disabled={isSavingPo}
                    onClick={() => handleCreatePo('DRAFT')}
                    className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-xs font-semibold text-white rounded-xl transition cursor-pointer"
                  >
                    Save Draft
                  </button>
                  <button
                    disabled={isSavingPo}
                    onClick={() => handleCreatePo('ORDERED')}
                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-xs font-bold text-neutral-950 rounded-xl transition cursor-pointer"
                  >
                    {isSavingPo ? 'Creating...' : 'Issue Order to Supplier'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: ADD SUPPLIER */}
        {isNewSupplierOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-neutral-900 border border-neutral-800 rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4">
              <h3 className="text-lg font-bold text-white">Add Supplier</h3>

              <form onSubmit={handleCreateSupplier} className="space-y-3 text-xs">
                <div>
                  <label className="block text-neutral-300 mb-1">Company / Vendor Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Metro Dairy Dist."
                    value={supName}
                    onChange={(e) => setSupName(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-neutral-300 mb-1">Contact Person</label>
                  <input
                    type="text"
                    placeholder="e.g. Sarah Lim"
                    value={supContact}
                    onChange={(e) => setSupContact(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-neutral-300 mb-1">Phone Number</label>
                  <input
                    type="text"
                    placeholder="e.g. +673 876-5432"
                    value={supPhone}
                    onChange={(e) => setSupPhone(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-neutral-300 mb-1">Email</label>
                  <input
                    type="email"
                    placeholder="e.g. orders@supplier.com"
                    value={supEmail}
                    onChange={(e) => setSupEmail(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-neutral-800">
                  <button
                    type="button"
                    onClick={() => setIsNewSupplierOpen(false)}
                    className="px-3 py-1.5 text-neutral-400 hover:text-white bg-neutral-800 rounded-xl cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingSupplier}
                    className="px-4 py-1.5 font-bold text-neutral-950 bg-emerald-500 hover:bg-emerald-400 rounded-xl transition cursor-pointer"
                  >
                    {isSavingSupplier ? 'Saving...' : 'Save Vendor'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL: VIEW / PRINT PO SLIP */}
        {isPoDetailOpen && selectedPo && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 print:shadow-none print:border-none print:m-0 print:p-0">
              <div className="flex justify-between items-start border-b border-neutral-800 pb-3 print:hidden">
                <div>
                  <h3 className="text-base font-bold text-white">Purchase Order Slip</h3>
                  <p className="text-[11px] text-neutral-400 font-mono">{selectedPo.po_number}</p>
                </div>
                <button
                  onClick={() => setIsPoDetailOpen(false)}
                  className="text-neutral-400 hover:text-white text-sm font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Printable PO Sheet */}
              <div className="p-4 bg-neutral-950 border border-neutral-800 rounded-xl font-mono text-xs text-neutral-300 space-y-3 print:border-none print:p-0 print:text-black">
                <div className="text-center pb-2 border-b border-dashed border-neutral-700">
                  <h4 className="font-extrabold text-sm text-white tracking-widest uppercase print:text-black">
                    KITCHOS PURCHASE ORDER
                  </h4>
                  <p className="text-[10px] text-neutral-400 print:text-neutral-600">
                    Order #{selectedPo.po_number} • Status: {selectedPo.status}
                  </p>
                  <p className="text-[10px] text-neutral-400 print:text-neutral-600">
                    Vendor: {selectedPo.supplier?.name}
                  </p>
                </div>

                <div className="space-y-1.5 py-1 border-b border-dashed border-neutral-800">
                  {(selectedPo.items || []).map((item, idx) => (
                    <div key={idx} className="flex justify-between text-[11px]">
                      <span>
                        {item.quantity_ordered}x {item.item_name}
                      </span>
                      <span className="font-bold">${Number(item.subtotal).toFixed(2)}</span>
                    </div>
                  ))}
                </div>

                <div className="space-y-1 text-[11px]">
                  <div className="flex justify-between font-bold text-white print:text-black">
                    <span>TOTAL:</span>
                    <span>${Number(selectedPo.total_amount).toFixed(2)}</span>
                  </div>
                  {selectedPo.notes && (
                    <p className="text-[10px] text-neutral-400 print:text-neutral-600 italic">
                      Notes: {selectedPo.notes}
                    </p>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 print:hidden">
                <button
                  onClick={() => window.print()}
                  className="flex-1 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs font-bold text-white flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <span>🖨️</span>
                  <span>Print PO</span>
                </button>
                {selectedPo.status === 'ORDERED' && (
                  <button
                    onClick={() => handleReceiveGoods(selectedPo.id)}
                    disabled={isReceiving}
                    className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-xs font-bold text-neutral-950 transition cursor-pointer"
                  >
                    Receive Goods
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}